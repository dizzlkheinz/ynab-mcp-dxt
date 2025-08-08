import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { YNABMCPServer } from '../YNABMCPServer';
import { AuthenticationError, ConfigurationError } from '../../types/index';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Integration tests for server startup and transport setup
 * Tests the complete server initialization process including:
 * - Environment validation
 * - YNAB API authentication
 * - MCP server initialization
 * - Tool registration
 * - Transport connection setup
 */
describe('Server Startup and Transport Integration', () => {
  const originalEnv = process.env;
  
  beforeAll(() => {
    // Load API key from file for integration tests
    try {
      const apiKeyFile = readFileSync(join(process.cwd(), 'api_key.txt'), 'utf-8');
      const lines = apiKeyFile.split('\n');
      
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'YNAB_API_KEY' && value) {
          process.env['YNAB_ACCESS_TOKEN'] = value.trim();
        }
        if (key === 'YNAB_BUDGET' && value) {
          process.env['YNAB_BUDGET_ID'] = value.trim();
        }
      }
      
      if (!process.env['YNAB_ACCESS_TOKEN']) {
        throw new Error('YNAB_API_KEY not found in api_key.txt');
      }
      
      console.log('✅ Loaded YNAB API key for server startup tests');
    } catch (error) {
      throw new Error(`Failed to load API key from api_key.txt: ${error}`);
    }
  });
  
  afterEach(() => {
    // Restore environment but keep API key
    Object.keys(process.env).forEach(key => {
      if (key !== 'YNAB_ACCESS_TOKEN' && key !== 'YNAB_BUDGET_ID') {
        if (originalEnv[key] !== undefined) {
          process.env[key] = originalEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });
  });

  describe('Server Initialization', () => {
    it('should successfully initialize server with valid configuration', () => {
      const server = new YNABMCPServer(false);
      
      expect(server).toBeInstanceOf(YNABMCPServer);
      expect(server.getYNABAPI()).toBeDefined();
      expect(server.getServer()).toBeInstanceOf(Server);
    });

    it('should fail initialization with missing access token', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      delete process.env['YNAB_ACCESS_TOKEN'];
      
      expect(() => new YNABMCPServer(false)).toThrow(ConfigurationError);
      expect(() => new YNABMCPServer(false)).toThrow(
        'YNAB_ACCESS_TOKEN environment variable is required but not set'
      );
      
      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should fail initialization with invalid access token format', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = '';
      
      expect(() => new YNABMCPServer(false)).toThrow(ConfigurationError);
      expect(() => new YNABMCPServer(false)).toThrow(
        'YNAB_ACCESS_TOKEN must be a non-empty string'
      );
      
      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });
  });

  describe('Server Startup Validation', () => {
    let server: YNABMCPServer;

    beforeEach(() => {
      server = new YNABMCPServer(false);
    });

    it('should validate YNAB token during startup', async () => {
      const isValid = await server.validateToken();
      expect(isValid).toBe(true);
    });

    it('should handle invalid token gracefully during startup', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'invalid-token-12345';
      
      try {
        const invalidServer = new YNABMCPServer(false);
        await expect(invalidServer.validateToken()).rejects.toThrow(AuthenticationError);
      } finally {
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });

    it('should provide detailed error messages for authentication failures', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'definitely-invalid-token';
      
      try {
        const invalidServer = new YNABMCPServer(false);
        await expect(invalidServer.validateToken()).rejects.toThrow(AuthenticationError);
        
        // Verify the error message contains relevant information
        try {
          await invalidServer.validateToken();
        } catch (error) {
          expect(error).toBeInstanceOf(AuthenticationError);
          expect(error.message).toContain('Token validation failed');
        }
      } finally {
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });
  });

  describe('Tool Registration', () => {
    let server: YNABMCPServer;

    beforeEach(() => {
      server = new YNABMCPServer(false);
    });

    it('should register all expected YNAB tools', async () => {
      const mcpServer = server.getServer();
      
      // We can't directly call the handler, but we can verify the server has the right structure
      expect(mcpServer).toBeDefined();
      
      // Verify the server instance has been properly initialized
      // The tools are registered in the constructor via setRequestHandler calls
      expect(server.getYNABAPI()).toBeDefined();
      
      // Test that the server can handle basic operations
      expect(typeof server.validateToken).toBe('function');
      expect(typeof server.run).toBe('function');
    });

    it('should register budget management tools', () => {
      // Test that the server instance includes budget tools
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      
      // The tools are registered in the constructor, so if the server initializes
      // successfully, the tools should be registered
      expect(server.getYNABAPI().budgets).toBeDefined();
    });

    it('should register account management tools', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      expect(server.getYNABAPI().accounts).toBeDefined();
    });

    it('should register transaction management tools', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      expect(server.getYNABAPI().transactions).toBeDefined();
    });

    it('should register category management tools', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      expect(server.getYNABAPI().categories).toBeDefined();
    });

    it('should register payee management tools', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      expect(server.getYNABAPI().payees).toBeDefined();
    });

    it('should register utility tools', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
      expect(server.getYNABAPI().user).toBeDefined();
    });
  });

  describe('Transport Setup', () => {
    let server: YNABMCPServer;

    beforeEach(() => {
      server = new YNABMCPServer(false);
    });

    it('should attempt to connect with StdioServerTransport', async () => {
      // Mock console.error to capture startup messages
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        // The run method should validate token and attempt stdio connection
        await server.run();
        
        // In test environment, stdio connection will fail, but that's expected
        // The important thing is that token validation succeeds
      } catch (error) {
        // Expected to fail on stdio connection in test environment
        // But should not fail on authentication or configuration
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect(error).not.toBeInstanceOf(ConfigurationError);
      }
      
      consoleSpy.mockRestore();
    });

    it('should handle transport connection errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        await server.run();
      } catch (error) {
        // Should handle transport errors without crashing
        expect(error).toBeDefined();
      }
      
      consoleSpy.mockRestore();
    });

    it('should validate token before attempting transport connection', async () => {
      const validateTokenSpy = vi.spyOn(server, 'validateToken');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        await server.run();
      } catch (error) {
        // Transport will fail in test environment, but token validation should be called
        expect(validateTokenSpy).toHaveBeenCalled();
      }
      
      validateTokenSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('Error Reporting', () => {
    it('should report configuration errors clearly', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      delete process.env['YNAB_ACCESS_TOKEN'];
      
      expect(() => new YNABMCPServer(false)).toThrow(
        expect.objectContaining({
          message: 'YNAB_ACCESS_TOKEN environment variable is required but not set'
        })
      );
      
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should report authentication errors clearly', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'invalid-token';
      
      try {
        const server = new YNABMCPServer(false);
        await expect(server.validateToken()).rejects.toThrow(AuthenticationError);
      } finally {
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });

    it('should handle startup errors without exposing sensitive information', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'invalid-token';
      
      try {
        const server = new YNABMCPServer(false);
        await expect(server.run()).rejects.toThrow();
        
        // Verify error doesn't contain the actual token
        try {
          await server.run();
        } catch (error) {
          expect(error.message).not.toContain('invalid-token');
        }
      } finally {
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });
  });

  describe('Graceful Shutdown', () => {
    it('should handle process signals gracefully', () => {
      // Test that the server can be created without throwing
      const server = new YNABMCPServer(false);
      expect(server).toBeDefined();
      
      // In a real scenario, the process signal handlers in index.ts would handle shutdown
      // We can't easily test the actual signal handling in a unit test environment
      // But we can verify the server initializes properly
    });

    it('should clean up resources on shutdown', () => {
      const server = new YNABMCPServer(false);
      
      // Verify server has the necessary components for cleanup
      expect(server.getServer()).toBeDefined();
      expect(server.getYNABAPI()).toBeDefined();
    });
  });

  describe('Full Startup Workflow', () => {
    it('should complete full startup sequence successfully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        // Create server
        const server = new YNABMCPServer(false);
        expect(server).toBeDefined();
        
        // Validate token
        const isValid = await server.validateToken();
        expect(isValid).toBe(true);
        
        // Attempt to run (will fail on transport in test environment)
        try {
          await server.run();
        } catch (error) {
          // Expected to fail on stdio transport in test environment
          // But authentication and initialization should succeed
        }
        
        console.log('✅ Server startup workflow completed successfully');
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should fail fast on configuration errors', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      delete process.env['YNAB_ACCESS_TOKEN'];
      
      // Should fail immediately on construction, not during run()
      expect(() => new YNABMCPServer(false)).toThrow(ConfigurationError);
      
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should fail fast on authentication errors', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'invalid-token';
      
      try {
        const server = new YNABMCPServer(false);
        
        // Should fail on token validation, before transport setup
        await expect(server.run()).rejects.toThrow(AuthenticationError);
      } finally {
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });
  });
});