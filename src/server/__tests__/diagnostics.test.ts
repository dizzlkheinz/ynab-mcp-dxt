/**
 * Unit tests for diagnostics module
 *
 * Tests diagnostic data collection functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DiagnosticManager,
  formatUptime,
  formatBytes,
  maskToken,
  type DiagnosticDependencies,
  type DiagnosticOptions,
} from '../diagnostics.js';

// Mock SecurityMiddleware
const mockSecurityMiddleware = {
  getSecurityStats: vi.fn(),
};

// Mock CacheManager
const mockCacheManager = {
  getStats: vi.fn(),
  getEntriesForSizeEstimation: vi.fn(),
};

// Mock response formatter
const mockResponseFormatter = {
  format: vi.fn((data) => JSON.stringify(data)),
};

// Mock process functions for testing
const mockProcess = {
  uptime: vi.fn(),
  memoryUsage: vi.fn(),
  env: {} as Record<string, string | undefined>,
  version: 'v18.0.0',
  platform: 'linux',
  arch: 'x64',
  pid: 12345,
  cwd: vi.fn(),
};

describe('diagnostics module', () => {
  let diagnosticManager: DiagnosticManager;
  let dependencies: DiagnosticDependencies;

  beforeEach(() => {
    vi.clearAllMocks();

    dependencies = {
      securityMiddleware: mockSecurityMiddleware as any,
      cacheManager: mockCacheManager as any,
      responseFormatter: mockResponseFormatter,
      serverVersion: '1.0.0',
    };

    diagnosticManager = new DiagnosticManager(dependencies);

    // Mock process methods
    vi.spyOn(process, 'uptime').mockImplementation(mockProcess.uptime);
    vi.spyOn(process, 'memoryUsage').mockImplementation(mockProcess.memoryUsage);
    vi.spyOn(process, 'cwd').mockImplementation(mockProcess.cwd);

    // Set up default mock values
    mockProcess.uptime.mockReturnValue(3661.5); // 1 hour, 1 minute, 1.5 seconds
    mockProcess.memoryUsage.mockReturnValue({
      rss: 100 * 1024 * 1024, // 100 MB
      heapUsed: 50 * 1024 * 1024, // 50 MB
      heapTotal: 80 * 1024 * 1024, // 80 MB
      external: 10 * 1024 * 1024, // 10 MB
      arrayBuffers: 5 * 1024 * 1024, // 5 MB
    });
    mockProcess.cwd.mockReturnValue('/test/directory');

    mockSecurityMiddleware.getSecurityStats.mockReturnValue({
      requests: 100,
      blocked: 5,
      rate_limited: 2,
    });

    mockCacheManager.getStats.mockReturnValue({
      size: 10,
      keys: ['key1', 'key2', 'key3'],
    });
    mockCacheManager.getEntriesForSizeEstimation.mockReturnValue({
      key1: 'value1',
      key2: 'value2',
    });
  });

  describe('DiagnosticManager', () => {
    describe('constructor', () => {
      it('should initialize with dependencies', () => {
        expect(diagnosticManager).toBeInstanceOf(DiagnosticManager);
      });
    });

    describe('collectDiagnostics', () => {
      it('should always include timestamp', async () => {
        const options: DiagnosticOptions = {};
        const result = await diagnosticManager.collectDiagnostics(options);

        expect(mockResponseFormatter.format).toHaveBeenCalledWith(
          expect.objectContaining({
            timestamp: expect.any(String),
          }),
        );

        expect(result).toEqual({
          content: [{ type: 'text', text: expect.any(String) }],
        });
      });

      describe('server diagnostics', () => {
        it('should include server information when include_server is true', async () => {
          const options: DiagnosticOptions = { include_server: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              server: {
                name: 'ynab-mcp-server',
                version: '1.0.0',
                node_version: 'v18.0.0',
                platform: 'linux',
                arch: 'x64',
                pid: 12345,
                uptime_ms: 3661500,
                uptime_readable: '1h 1m 1s',
                env: {
                  node_env: 'development',
                  minify_output: 'true',
                },
              },
            }),
          );
        });

        it('should exclude server information when include_server is false', async () => {
          const options: DiagnosticOptions = { include_server: false };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.not.objectContaining({
              server: expect.anything(),
            }),
          );
        });

        it('should handle custom NODE_ENV', async () => {
          const originalEnv = process.env.NODE_ENV;
          process.env.NODE_ENV = 'production';

          try {
            const options: DiagnosticOptions = { include_server: true };
            await diagnosticManager.collectDiagnostics(options);

            expect(mockResponseFormatter.format).toHaveBeenCalledWith(
              expect.objectContaining({
                server: expect.objectContaining({
                  env: expect.objectContaining({
                    node_env: 'production',
                  }),
                }),
              }),
            );
          } finally {
            process.env.NODE_ENV = originalEnv;
          }
        });
      });

      describe('memory diagnostics', () => {
        it('should include memory information when include_memory is true', async () => {
          const options: DiagnosticOptions = { include_memory: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              memory: {
                rss_mb: 100,
                heap_used_mb: 50,
                heap_total_mb: 80,
                external_mb: 10,
                array_buffers_mb: 5,
                description: {
                  rss: 'Resident Set Size - total memory allocated for the process',
                  heap_used: 'Used heap memory (objects, closures, etc.)',
                  heap_total: 'Total heap memory allocated',
                  external: 'Memory used by C++ objects bound to JavaScript objects',
                  array_buffers: 'Memory allocated for ArrayBuffer and SharedArrayBuffer',
                },
              },
            }),
          );
        });

        it('should exclude memory information when include_memory is false', async () => {
          const options: DiagnosticOptions = { include_memory: false };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.not.objectContaining({
              memory: expect.anything(),
            }),
          );
        });

        it('should handle undefined arrayBuffers', async () => {
          mockProcess.memoryUsage.mockReturnValue({
            rss: 100 * 1024 * 1024,
            heapUsed: 50 * 1024 * 1024,
            heapTotal: 80 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: undefined,
          });

          const options: DiagnosticOptions = { include_memory: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              memory: expect.objectContaining({
                array_buffers_mb: 0,
              }),
            }),
          );
        });
      });

      describe('environment diagnostics', () => {
        it('should include environment information when include_environment is true', async () => {
          const originalEnv = process.env;
          process.env = {
            ...originalEnv,
            YNAB_ACCESS_TOKEN: 'test-token-123456',
            YNAB_MCP_DEBUG: 'true',
            OTHER_VAR: 'value',
          };

          try {
            const options: DiagnosticOptions = { include_environment: true };
            await diagnosticManager.collectDiagnostics(options);

            expect(mockResponseFormatter.format).toHaveBeenCalledWith(
              expect.objectContaining({
                environment: {
                  token_present: true,
                  token_length: 18,
                  token_preview: 'test...3456',
                  ynab_env_keys_present: ['YNAB_ACCESS_TOKEN', 'YNAB_MCP_DEBUG'],
                  working_directory: '/test/directory',
                },
              }),
            );
          } finally {
            process.env = originalEnv;
          }
        });

        it('should handle missing token', async () => {
          const originalEnv = process.env;
          process.env = { ...originalEnv };
          delete process.env.YNAB_ACCESS_TOKEN;

          try {
            const options: DiagnosticOptions = { include_environment: true };
            await diagnosticManager.collectDiagnostics(options);

            expect(mockResponseFormatter.format).toHaveBeenCalledWith(
              expect.objectContaining({
                environment: expect.objectContaining({
                  token_present: false,
                  token_length: 0,
                  token_preview: null,
                }),
              }),
            );
          } finally {
            process.env = originalEnv;
          }
        });
      });

      describe('security diagnostics', () => {
        it('should include security information when include_security is true', async () => {
          const options: DiagnosticOptions = { include_security: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockSecurityMiddleware.getSecurityStats).toHaveBeenCalledOnce();
          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              security: {
                requests: 100,
                blocked: 5,
                rate_limited: 2,
              },
            }),
          );
        });

        it('should exclude security information when include_security is false', async () => {
          const options: DiagnosticOptions = { include_security: false };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockSecurityMiddleware.getSecurityStats).not.toHaveBeenCalled();
          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.not.objectContaining({
              security: expect.anything(),
            }),
          );
        });
      });

      describe('cache diagnostics', () => {
        it('should include cache information when include_cache is true', async () => {
          const options: DiagnosticOptions = { include_cache: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockCacheManager.getStats).toHaveBeenCalledOnce();
          expect(mockCacheManager.getEntriesForSizeEstimation).toHaveBeenCalledOnce();
          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              cache: {
                entries: 10,
                estimated_size_kb: expect.any(Number),
                keys: ['key1', 'key2', 'key3'],
              },
            }),
          );
        });

        it('should handle cache serialization errors gracefully', async () => {
          mockCacheManager.getEntriesForSizeEstimation.mockImplementation(() => {
            const circular: any = {};
            circular.self = circular;
            return circular;
          });

          const options: DiagnosticOptions = { include_cache: true };
          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              cache: expect.objectContaining({
                estimated_size_kb: 0,
              }),
            }),
          );
        });
      });

      describe('combined diagnostics', () => {
        it('should include all diagnostics when all options are true', async () => {
          const options: DiagnosticOptions = {
            include_server: true,
            include_memory: true,
            include_environment: true,
            include_security: true,
            include_cache: true,
          };

          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith(
            expect.objectContaining({
              timestamp: expect.any(String),
              server: expect.any(Object),
              memory: expect.any(Object),
              environment: expect.any(Object),
              security: expect.any(Object),
              cache: expect.any(Object),
            }),
          );
        });

        it('should include only timestamp when all options are false', async () => {
          const options: DiagnosticOptions = {
            include_server: false,
            include_memory: false,
            include_environment: false,
            include_security: false,
            include_cache: false,
          };

          await diagnosticManager.collectDiagnostics(options);

          expect(mockResponseFormatter.format).toHaveBeenCalledWith({
            timestamp: expect.any(String),
          });
        });
      });
    });
  });

  describe('utility functions', () => {
    describe('formatUptime', () => {
      it('should format seconds only', () => {
        expect(formatUptime(5000)).toBe('5s');
        expect(formatUptime(59000)).toBe('59s');
      });

      it('should format minutes and seconds', () => {
        expect(formatUptime(60000)).toBe('1m 0s');
        expect(formatUptime(90000)).toBe('1m 30s');
        expect(formatUptime(3540000)).toBe('59m 0s');
      });

      it('should format hours, minutes, and seconds', () => {
        expect(formatUptime(3600000)).toBe('1h 0m 0s');
        expect(formatUptime(3661000)).toBe('1h 1m 1s');
        expect(formatUptime(86340000)).toBe('23h 59m 0s');
      });

      it('should format days, hours, minutes, and seconds', () => {
        expect(formatUptime(86400000)).toBe('1d 0h 0m 0s');
        expect(formatUptime(90061000)).toBe('1d 1h 1m 1s');
        expect(formatUptime(172800000)).toBe('2d 0h 0m 0s');
      });

      it('should handle zero uptime', () => {
        expect(formatUptime(0)).toBe('0s');
      });

      it('should handle fractional milliseconds', () => {
        expect(formatUptime(1500.7)).toBe('1s');
        expect(formatUptime(59999.9)).toBe('59s');
      });
    });

    describe('formatBytes', () => {
      it('should format bytes to MB with proper rounding', () => {
        expect(formatBytes(0)).toBe(0);
        expect(formatBytes(1024)).toBe(0);
        expect(formatBytes(1024 * 1024)).toBe(1);
        expect(formatBytes(1024 * 1024 * 1.5)).toBe(1.5);
        expect(formatBytes(1024 * 1024 * 100.123)).toBe(100.12);
      });

      it('should handle large values', () => {
        expect(formatBytes(1024 * 1024 * 1000)).toBe(1000);
        expect(formatBytes(1024 * 1024 * 1024)).toBe(1024);
      });
    });

    describe('maskToken', () => {
      it('should return null for undefined token', () => {
        expect(maskToken(undefined)).toBeNull();
      });

      it('should return null for empty token', () => {
        expect(maskToken('')).toBeNull();
      });

      it('should mask tokens with 8+ characters', () => {
        expect(maskToken('12345678')).toBe('1234...5678');
        expect(maskToken('abcdefghijklmnop')).toBe('abcd...mnop');
        expect(maskToken('very-long-token-with-many-chars')).toBe('very...-chars');
      });

      it('should mask short tokens differently', () => {
        expect(maskToken('a')).toBe('a***');
        expect(maskToken('ab')).toBe('a***');
        expect(maskToken('abc')).toBe('a***');
        expect(maskToken('1234567')).toBe('1***');
      });
    });
  });

  describe('dependency injection', () => {
    it('should use injected security middleware', async () => {
      const customSecurityMiddleware = {
        getSecurityStats: vi.fn().mockReturnValue({ custom: 'stats' }),
      };

      const customDependencies = {
        ...dependencies,
        securityMiddleware: customSecurityMiddleware as any,
      };

      const customDiagnosticManager = new DiagnosticManager(customDependencies);
      await customDiagnosticManager.collectDiagnostics({ include_security: true });

      expect(customSecurityMiddleware.getSecurityStats).toHaveBeenCalledOnce();
      expect(mockSecurityMiddleware.getSecurityStats).not.toHaveBeenCalled();
    });

    it('should use injected cache manager', async () => {
      const customCacheManager = {
        getStats: vi.fn().mockReturnValue({ size: 5, keys: ['custom'] }),
        getEntriesForSizeEstimation: vi.fn().mockReturnValue({ custom: 'data' }),
      };

      const customDependencies = {
        ...dependencies,
        cacheManager: customCacheManager as any,
      };

      const customDiagnosticManager = new DiagnosticManager(customDependencies);
      await customDiagnosticManager.collectDiagnostics({ include_cache: true });

      expect(customCacheManager.getStats).toHaveBeenCalledOnce();
      expect(customCacheManager.getEntriesForSizeEstimation).toHaveBeenCalledOnce();
      expect(mockCacheManager.getStats).not.toHaveBeenCalled();
      expect(mockCacheManager.getEntriesForSizeEstimation).not.toHaveBeenCalled();
    });

    it('should use injected response formatter', async () => {
      const customFormatter = {
        format: vi.fn().mockReturnValue('custom-formatted'),
      };

      const customDependencies = {
        ...dependencies,
        responseFormatter: customFormatter,
      };

      const customDiagnosticManager = new DiagnosticManager(customDependencies);
      const result = await customDiagnosticManager.collectDiagnostics({});

      expect(customFormatter.format).toHaveBeenCalled();
      expect(mockResponseFormatter.format).not.toHaveBeenCalled();
      expect(result.content[0].text).toBe('custom-formatted');
    });

    it('should use injected server version', async () => {
      const customDependencies = {
        ...dependencies,
        serverVersion: '2.0.0-beta',
      };

      const customDiagnosticManager = new DiagnosticManager(customDependencies);
      await customDiagnosticManager.collectDiagnostics({ include_server: true });

      expect(mockResponseFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          server: expect.objectContaining({
            version: '2.0.0-beta',
          }),
        }),
      );
    });
  });
});
