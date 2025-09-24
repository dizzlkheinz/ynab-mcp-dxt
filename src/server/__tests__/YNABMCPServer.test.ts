import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { YNABMCPServer } from '../YNABMCPServer.js';
import { AuthenticationError, ConfigurationError } from '../../types/index.js';
import { ToolRegistry } from '../toolRegistry.js';
import { cacheManager } from '../../server/cacheManager.js';
import { responseFormatter } from '../../server/responseFormatter.js';

/**
 * Real YNAB API tests using token from .env (YNAB_ACCESS_TOKEN)
 */
describe('YNABMCPServer', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    if (!process.env['YNAB_ACCESS_TOKEN']) {
      throw new Error(
        'YNAB_ACCESS_TOKEN is required. Set it in your .env file to run integration tests.',
      );
    }
  });

  afterEach(() => {
    // Don't restore env completely, keep the API key loaded
    Object.keys(process.env).forEach((key) => {
      if (key !== 'YNAB_ACCESS_TOKEN' && key !== 'YNAB_BUDGET_ID') {
        if (originalEnv[key] !== undefined) {
          process.env[key] = originalEnv[key];
        } else {
          process.env[key] = undefined;
        }
      }
    });
  });

  describe('Constructor and Environment Validation', () => {
    it('should create server instance with valid access token', () => {
      const server = new YNABMCPServer();
      expect(server).toBeInstanceOf(YNABMCPServer);
      expect(server.getYNABAPI()).toBeDefined();
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is missing', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      delete process.env['YNAB_ACCESS_TOKEN'];

      expect(() => new YNABMCPServer()).toThrow(ConfigurationError);
      expect(() => new YNABMCPServer()).toThrow(
        'YNAB_ACCESS_TOKEN environment variable is required but not set',
      );

      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is empty string', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = '';

      expect(() => new YNABMCPServer()).toThrow(ConfigurationError);
      expect(() => new YNABMCPServer()).toThrow('YNAB_ACCESS_TOKEN must be a non-empty string');

      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is only whitespace', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = '   ';

      expect(() => new YNABMCPServer()).toThrow(ConfigurationError);
      expect(() => new YNABMCPServer()).toThrow('YNAB_ACCESS_TOKEN must be a non-empty string');

      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });

    it('should trim whitespace from access token', () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = `  ${originalToken}  `;

      const server = new YNABMCPServer();
      expect(server).toBeInstanceOf(YNABMCPServer);

      // Restore token
      process.env['YNAB_ACCESS_TOKEN'] = originalToken;
    });
  });

  describe('Real YNAB API Integration', () => {
    let server: YNABMCPServer;

    beforeEach(() => {
      server = new YNABMCPServer(false); // Don't exit on error in tests
    });

    it('should successfully validate real YNAB token', async () => {
      const isValid = await server.validateToken();
      expect(isValid).toBe(true);
    });

    it('should successfully get user information', async () => {
      // Verify we can get user info
      const ynabAPI = server.getYNABAPI();
      const userResponse = await ynabAPI.user.getUser();

      expect(userResponse.data.user).toBeDefined();
      expect(userResponse.data.user.id).toBeDefined();
      console.warn(`✅ Connected to YNAB user: ${userResponse.data.user.id}`);
    });

    it('should successfully get budgets', async () => {
      const ynabAPI = server.getYNABAPI();
      const budgetsResponse = await ynabAPI.budgets.getBudgets();

      expect(budgetsResponse.data.budgets).toBeDefined();
      expect(Array.isArray(budgetsResponse.data.budgets)).toBe(true);
      expect(budgetsResponse.data.budgets.length).toBeGreaterThan(0);

      console.warn(`✅ Found ${budgetsResponse.data.budgets.length} budget(s)`);
      budgetsResponse.data.budgets.forEach((budget) => {
        console.warn(`   - ${budget.name} (${budget.id})`);
      });
    });

    it('should handle invalid token gracefully', async () => {
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      process.env['YNAB_ACCESS_TOKEN'] = 'invalid-token-format';

      try {
        const invalidServer = new YNABMCPServer(false);
        await expect(invalidServer.validateToken()).rejects.toThrow(AuthenticationError);
      } finally {
        // Restore original token
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });

    it('should successfully start and connect MCP server', async () => {
      // This test verifies the full server startup process
      // Note: We can't fully test the stdio connection in a test environment,
      // but we can verify the server initializes without errors

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation for testing
      });

      try {
        // The run method will validate the token and attempt to connect
        // In a test environment, the stdio connection will fail, but token validation should succeed
        await server.run();
      } catch (error) {
        // Expected to fail on stdio connection in test environment
        // But should not fail on token validation
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect(error).not.toBeInstanceOf(ConfigurationError);
      }

      consoleSpy.mockRestore();
    });

    it('should handle multiple rapid API calls without rate limiting issues', async () => {
      // Make multiple validation calls to test rate limiting behavior
      const promises = Array(3)
        .fill(null)
        .map(() => server.validateToken());

      // All should succeed (YNAB API is generally permissive for user info calls)
      const results = await Promise.all(promises);
      results.forEach((result) => expect(result).toBe(true));
    });
  });

  describe('MCP Server Functionality', () => {
    let server: YNABMCPServer;
    let registry: ToolRegistry;

    const accessToken = () => {
      const token = process.env['YNAB_ACCESS_TOKEN'];
      if (!token) {
        throw new Error('YNAB_ACCESS_TOKEN must be defined for integration tests');
      }
      return token;
    };

    beforeEach(() => {
      server = new YNABMCPServer(false);
      registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
    });

    it('should expose registered tools via the registry', () => {
      const tools = registry.listTools();
      expect(tools.length).toBeGreaterThan(0);
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('list_budgets');
      expect(names).toContain('diagnostic_info');
    });

    it('should execute get_user tool via the registry', async () => {
      const result = await registry.executeTool({
        name: 'get_user',
        accessToken: accessToken(),
        arguments: {},
      });
      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.user?.id).toBeDefined();
    });

    it('should set and retrieve default budget using tools', async () => {
      const budgetsResult = await registry.executeTool({
        name: 'list_budgets',
        accessToken: accessToken(),
        arguments: {},
      });
      const budgetsPayload = JSON.parse(budgetsResult.content?.[0]?.text ?? '{}');
      const firstBudget = budgetsPayload.budgets?.[0];
      expect(firstBudget).toBeDefined();

      await registry.executeTool({
        name: 'set_default_budget',
        accessToken: accessToken(),
        arguments: { budget_id: firstBudget.id },
      });

      const defaultResult = await registry.executeTool({
        name: 'get_default_budget',
        accessToken: accessToken(),
        arguments: {},
      });
      const defaultPayload = JSON.parse(defaultResult.content?.[0]?.text ?? '{}');
      expect(defaultPayload.default_budget_id).toBe(firstBudget.id);
      expect(defaultPayload.has_default).toBe(true);
    });

    it('should provide diagnostic info with requested sections', async () => {
      const diagResult = await registry.executeTool({
        name: 'diagnostic_info',
        accessToken: accessToken(),
        arguments: {
          include_server: true,
          include_security: true,
          include_cache: true,
          include_memory: false,
          include_environment: false,
        },
      });
      const diagnostics = JSON.parse(diagResult.content?.[0]?.text ?? '{}');
      expect(diagnostics.timestamp).toBeDefined();
      expect(diagnostics.server).toBeDefined();
      expect(diagnostics.security).toBeDefined();
      expect(diagnostics.cache).toBeDefined();
      expect(diagnostics.memory).toBeUndefined();
      expect(diagnostics.environment).toBeUndefined();
    });

    it('should clear cache using the clear_cache tool', async () => {
      cacheManager.set('test:key', { value: 1 }, 1000);
      expect(cacheManager.getStats().size).toBeGreaterThan(0);

      await registry.executeTool({
        name: 'clear_cache',
        accessToken: accessToken(),
        arguments: {},
      });

      expect(cacheManager.getStats().size).toBe(0);
    });

    it('should configure output formatter via set_output_format tool', async () => {
      const baseline = responseFormatter.format({ probe: true });

      try {
        await registry.executeTool({
          name: 'set_output_format',
          accessToken: accessToken(),
          arguments: { default_minify: false, pretty_spaces: 4 },
        });

        const formatted = responseFormatter.format({ probe: true });
        expect(formatted).not.toBe(baseline);
        expect(formatted).toContain('\n');
      } finally {
        await registry.executeTool({
          name: 'set_output_format',
          accessToken: accessToken(),
          arguments: { default_minify: true, pretty_spaces: 2 },
        });
      }
    });

    it('should surface validation errors for invalid inputs', async () => {
      const result = await registry.executeTool({
        name: 'get_budget',
        accessToken: accessToken(),
        arguments: {} as Record<string, unknown>,
      });
      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeDefined();
      expect(payload.error.code).toBe('VALIDATION_ERROR');
    });
  });

});
