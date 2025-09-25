/**
 * Diagnostics module for YNAB MCP Server
 *
 * Handles comprehensive system diagnostics collection.
 * Extracted from YNABMCPServer to provide focused, testable diagnostics management.
 */

import type { CacheManager } from './cacheManager.js';

/**
 * Security stats provider interface
 */
export interface SecurityStatsProvider {
  getSecurityStats(): unknown;
}

/**
 * Response formatter interface to avoid direct dependency on concrete implementation
 */
interface ResponseFormatter {
  format(data: unknown): string;
}

/**
 * Diagnostic options for configuring what diagnostics to include
 */
export interface DiagnosticOptions {
  include_server?: boolean;
  include_memory?: boolean;
  include_environment?: boolean;
  include_security?: boolean;
  include_cache?: boolean;
}

/**
 * Diagnostic data structure
 */
export interface DiagnosticData {
  timestamp: string;
  server?: {
    name: string;
    version: string;
    node_version: string;
    platform: string;
    arch: string;
    pid: number;
    uptime_ms: number;
    uptime_readable: string;
    env: {
      node_env: string;
      minify_output: string;
    };
  };
  memory?: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
    array_buffers_mb: number;
    description: {
      rss: string;
      heap_used: string;
      heap_total: string;
      external: string;
      array_buffers: string;
    };
  };
  environment?: {
    token_present: boolean;
    token_length: number;
    token_preview: string | null;
    ynab_env_keys_present: string[];
    working_directory: string;
  };
  security?: unknown;
  cache?: {
    entries: number;
    estimated_size_kb: number;
    keys: string[];
    hits?: number;
    misses?: number;
    evictions?: number;
    lastCleanup?: string | null;
    maxEntries?: number;
    hitRate?: string;
    performance_summary?: string;
  };
}

/**
 * Injectable dependencies for diagnostic manager
 */
export interface DiagnosticDependencies {
  securityMiddleware: SecurityStatsProvider;
  cacheManager: CacheManager;
  responseFormatter: ResponseFormatter;
  serverVersion: string;
}

/**
 * Utility functions for formatting diagnostic data
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function formatBytes(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

export function maskToken(token: string | undefined): string | null {
  if (!token) return null;

  if (token.length < 8) {
    return `${token.slice(0, 1)}***`;
  }

  const firstPart = token.slice(0, 4);
  let lastPart = token.slice(-4);

  const trailingHyphenIndex = token.lastIndexOf('-');
  if (trailingHyphenIndex !== -1 && token.length - trailingHyphenIndex <= 6) {
    lastPart = token.slice(trailingHyphenIndex);
  }

  return `${firstPart}...${lastPart}`;
}

/**
 * DiagnosticManager class that handles diagnostic data collection
 */
export class DiagnosticManager {
  private dependencies: DiagnosticDependencies;

  constructor(dependencies: DiagnosticDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Collects comprehensive diagnostic information
   */
  async collectDiagnostics(options: DiagnosticOptions): Promise<{
    content: { type: 'text'; text: string }[];
  }> {
    const diagnostics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    if (options.include_server) {
      const uptimeMs = Math.round(process.uptime() * 1000);
      diagnostics['server'] = {
        name: 'ynab-mcp-server',
        version: this.dependencies.serverVersion,
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime_ms: uptimeMs,
        uptime_readable: formatUptime(uptimeMs),
        env: {
          node_env: process.env['NODE_ENV'] || 'development',
          minify_output: process.env['YNAB_MCP_MINIFY_OUTPUT'] ?? 'true',
        },
      };
    }

    if (options.include_memory) {
      const memUsage = process.memoryUsage();
      diagnostics['memory'] = {
        rss_mb: formatBytes(memUsage.rss),
        heap_used_mb: formatBytes(memUsage.heapUsed),
        heap_total_mb: formatBytes(memUsage.heapTotal),
        external_mb: formatBytes(memUsage.external),
        array_buffers_mb: formatBytes(memUsage.arrayBuffers ?? 0),
        description: {
          rss: 'Resident Set Size - total memory allocated for the process',
          heap_used: 'Used heap memory (objects, closures, etc.)',
          heap_total: 'Total heap memory allocated',
          external: 'Memory used by C++ objects bound to JavaScript objects',
          array_buffers: 'Memory allocated for ArrayBuffer and SharedArrayBuffer',
        },
      };
    }

    if (options.include_environment) {
      const token = process.env['YNAB_ACCESS_TOKEN'];
      const envKeys = Object.keys(process.env ?? {});
      const ynabEnvKeys = envKeys.filter((key) => key.toUpperCase().includes('YNAB'));
      const rawTokenLength = token?.length ?? 0;
      // Round masked token lengths up to the nearest even value to avoid leaking exact size
      const reportedTokenLength =
        token && token.length >= 8 ? rawTokenLength + (rawTokenLength % 2) : rawTokenLength;

      diagnostics['environment'] = {
        token_present: !!token,
        token_length: reportedTokenLength,
        token_preview: maskToken(token),
        ynab_env_keys_present: ynabEnvKeys,
        working_directory: process.cwd(),
      };
    }

    if (options.include_security) {
      diagnostics['security'] = this.dependencies.securityMiddleware.getSecurityStats();
    }

    if (options.include_cache) {
      const cacheStats = this.dependencies.cacheManager.getStats();
      const estimateCacheSize = () => {
        try {
          const serialized = JSON.stringify(
            this.dependencies.cacheManager.getEntriesForSizeEstimation(),
          );
          return Math.round(Buffer.byteLength(serialized, 'utf8') / 1024);
        } catch {
          return 0;
        }
      };

      // Build performance summary
      const performanceParts = [];
      if ('hitRate' in cacheStats) {
        const hitRatePercent = (cacheStats.hitRate * 100).toFixed(1);
        performanceParts.push(
          `Hit rate: ${hitRatePercent}% (${cacheStats.hits} hits, ${cacheStats.misses} misses)`,
        );
      }
      if ('evictions' in cacheStats && cacheStats.evictions > 0) {
        performanceParts.push(`LRU evictions: ${cacheStats.evictions}`);
      }
      if ('lastCleanup' in cacheStats && cacheStats.lastCleanup) {
        const lastCleanupDate = new Date(cacheStats.lastCleanup);
        const minutesAgo = Math.round((Date.now() - lastCleanupDate.getTime()) / (60 * 1000));
        performanceParts.push(`Last cleanup: ${minutesAgo} minutes ago`);
      }

      const cacheData: {
        entries: number;
        estimated_size_kb: number;
        keys: string[];
        hits?: number;
        misses?: number;
        evictions?: number;
        lastCleanup?: string | null;
        maxEntries?: number;
        hitRate?: string;
        performance_summary?: string;
      } = {
        entries: cacheStats.size,
        estimated_size_kb: estimateCacheSize(),
        keys: cacheStats.keys,
      };

      // Add enhanced metrics if available
      if ('hits' in cacheStats) {
        cacheData.hits = cacheStats.hits;
        cacheData.misses = cacheStats.misses;
        cacheData.evictions = cacheStats.evictions;
        cacheData.lastCleanup = cacheStats.lastCleanup
          ? new Date(cacheStats.lastCleanup).toISOString()
          : null;
        cacheData.maxEntries = cacheStats.maxEntries;
        cacheData.hitRate = `${(cacheStats.hitRate * 100).toFixed(2)}%`;

        if (performanceParts.length > 0) {
          cacheData.performance_summary = performanceParts.join(', ');
        }
      }

      diagnostics['cache'] = cacheData;
    }

    return {
      content: [{ type: 'text', text: this.dependencies.responseFormatter.format(diagnostics) }],
    };
  }
}
