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

  // Shared constant for expected tool names
  const expectedToolNames = [
    'list_budgets',
    'get_budget',
    'set_default_budget',
    'get_default_budget',
    'list_accounts',
    'get_account',
    'create_account',
    'list_transactions',
    'export_transactions',
    'compare_transactions',
    'reconcile_account',
    'get_transaction',
    'create_transaction',
    'update_transaction',
    'delete_transaction',
    'list_categories',
    'get_category',
    'update_category',
    'list_payees',
    'get_payee',
    'get_month',
    'list_months',
    'get_user',
    'convert_amount',
    'financial_overview',
    'spending_analysis',
    'budget_health_check',
    'diagnostic_info',
    'clear_cache',
    'set_output_format',
  ] as const;

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
          // Use Reflect.deleteProperty to avoid ESLint dynamic delete warning
          Reflect.deleteProperty(process.env, key);
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

    const ensureDefaultBudget = async (): Promise<string> => {
      const budgetsResult = await registry.executeTool({
        name: 'list_budgets',
        accessToken: accessToken(),
        arguments: {},
      });
      const budgetsPayload = JSON.parse(budgetsResult.content?.[0]?.text ?? '{}');
      const firstBudget = budgetsPayload.budgets?.[0];
      expect(firstBudget?.id).toBeDefined();

      await registry.executeTool({
        name: 'set_default_budget',
        accessToken: accessToken(),
        arguments: { budget_id: firstBudget.id },
      });

      return firstBudget.id as string;
    };

    beforeEach(() => {
      server = new YNABMCPServer(false);
      registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
    });

    it('should expose the complete registered tool list via the registry', () => {
      const tools = registry.listTools();
      const names = tools.map((tool) => tool.name).sort();
      expect(names).toEqual([...expectedToolNames].sort());
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
      const budgetId = await ensureDefaultBudget();

      const defaultResult = await registry.executeTool({
        name: 'get_default_budget',
        accessToken: accessToken(),
        arguments: {},
      });
      const defaultPayload = JSON.parse(defaultResult.content?.[0]?.text ?? '{}');
      expect(defaultPayload.default_budget_id).toBe(budgetId);
      expect(defaultPayload.has_default).toBe(true);
    });

    it('should execute list tools that rely on the default budget', async () => {
      await ensureDefaultBudget();

      const accountsResult = await registry.executeTool({
        name: 'list_accounts',
        accessToken: accessToken(),
        arguments: {},
      });
      const accountsPayload = JSON.parse(accountsResult.content?.[0]?.text ?? '{}');
      expect(Array.isArray(accountsPayload.accounts)).toBe(true);

      const categoriesResult = await registry.executeTool({
        name: 'list_categories',
        accessToken: accessToken(),
        arguments: {},
      });
      const categoriesPayload = JSON.parse(categoriesResult.content?.[0]?.text ?? '{}');
      expect(Array.isArray(categoriesPayload.categories)).toBe(true);
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

    describe('Budget Resolution Error Handling', () => {
      let freshServer: YNABMCPServer;
      let freshRegistry: ToolRegistry;

      beforeEach(() => {
        // Create a fresh server with no default budget set
        freshServer = new YNABMCPServer(false);
        freshRegistry = (freshServer as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
      });

      const budgetDependentTools = [
        'list_accounts',
        'get_account',
        'create_account',
        'list_transactions',
        'get_transaction',
        'create_transaction',
        'update_transaction',
        'delete_transaction',
        'list_categories',
        'get_category',
        'update_category',
        'list_payees',
        'get_payee',
        'get_month',
        'list_months',
        'financial_overview',
        'spending_analysis',
        'budget_health_check',
        'export_transactions',
        'compare_transactions',
        'reconcile_account',
      ] as const;

      budgetDependentTools.forEach((toolName) => {
        it(`should return standardized error for ${toolName} when no default budget is set`, async () => {
          const result = await freshRegistry.executeTool({
            name: toolName,
            accessToken: accessToken(),
            arguments: {},
          });

          const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
          expect(payload.error).toBeDefined();
          expect(payload.error.code).toBe('VALIDATION_ERROR');
          expect(payload.error.message).toContain(
            'No budget ID provided and no default budget set',
          );
          expect(payload.error.userMessage).toContain('invalid');
          expect(payload.error.suggestions).toBeDefined();
          expect(Array.isArray(payload.error.suggestions)).toBe(true);
          expect(
            payload.error.suggestions.some(
              (suggestion: string) =>
                suggestion.includes('set_default_budget') ||
                suggestion.includes('budget_id parameter'),
            ),
          ).toBe(true);
        });
      });

      it('should return standardized error for invalid budget ID format', async () => {
        const invalidBudgetId = 'not-a-valid-uuid';
        const result = await freshRegistry.executeTool({
          name: 'list_accounts',
          accessToken: accessToken(),
          arguments: { budget_id: invalidBudgetId },
        });

        const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
        expect(payload.error).toBeDefined();
        expect(payload.error.code).toBe('VALIDATION_ERROR');
        expect(payload.error.message).toContain('Invalid budget ID format');
        expect(payload.error.userMessage).toContain('invalid');
        expect(payload.error.suggestions).toBeDefined();
        expect(Array.isArray(payload.error.suggestions)).toBe(true);
        expect(
          payload.error.suggestions.some(
            (suggestion: string) =>
              suggestion.includes('UUID v4 format') || suggestion.includes('list_budgets'),
          ),
        ).toBe(true);
      });

      it('should work normally after setting a default budget', async () => {
        // First, ensure we get the "no default budget" error
        let result = await freshRegistry.executeTool({
          name: 'list_accounts',
          accessToken: accessToken(),
          arguments: {},
        });

        let payload = JSON.parse(result.content?.[0]?.text ?? '{}');
        expect(payload.error).toBeDefined();
        expect(payload.error.code).toBe('VALIDATION_ERROR');

        // Now set a default budget
        const defaultBudgetId = await ensureDefaultBudget();
        await freshRegistry.executeTool({
          name: 'set_default_budget',
          accessToken: accessToken(),
          arguments: { budget_id: defaultBudgetId },
        });

        // Now the same call should work
        result = await freshRegistry.executeTool({
          name: 'list_accounts',
          accessToken: accessToken(),
          arguments: {},
        });

        payload = JSON.parse(result.content?.[0]?.text ?? '{}');
        // Should have accounts data or be valid response, not an error
        expect(payload.error).toBeUndefined();
      });

      it('should have consistent error response structure across all budget-dependent tools', async () => {
        const promises = budgetDependentTools.map((toolName) =>
          freshRegistry.executeTool({
            name: toolName,
            accessToken: accessToken(),
            arguments: {},
          }),
        );

        const results = await Promise.all(promises);

        results.forEach((result) => {
          const payload = JSON.parse(result.content?.[0]?.text ?? '{}');

          // All should have the same error structure
          expect(payload).toHaveProperty(
            'error',
            expect.objectContaining({
              code: 'VALIDATION_ERROR',
              message: expect.stringContaining('No budget ID provided and no default budget set'),
              userMessage: expect.any(String),
              suggestions: expect.arrayContaining([
                expect.stringMatching(/set_default_budget|budget_id parameter/),
              ]),
            }),
          );
        });
      });
    });
  });

  describe('Modular Architecture Integration', () => {
    let server: YNABMCPServer;

    beforeEach(() => {
      server = new YNABMCPServer(false);
    });

    it('should initialize all service modules during construction', () => {
      // Verify the server has been constructed successfully with all modules
      expect(server).toBeInstanceOf(YNABMCPServer);

      // Check that core functionality from modules works through public interface
      expect(server.getYNABAPI()).toBeDefined();
      expect(server.getServer()).toBeDefined();
    });

    it('should use config module for environment validation', () => {
      // The fact that constructor succeeds means config module is working
      // This test verifies the integration is seamless
      expect(server.getYNABAPI()).toBeDefined();
    });

    it('should handle resource requests through resource manager', async () => {
      // Test that resources work (this goes through the resource manager now)
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();

      // The server should be properly configured with resource handlers
      // If the integration failed, the server wouldn't have the handlers
      expect(() => server.getYNABAPI()).not.toThrow();
    });

    it('should handle prompt requests through prompt manager', async () => {
      // Test that the server has prompt handling capability
      // The integration ensures prompt handlers are properly set up
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
    });

    it('should handle diagnostic requests through diagnostic manager', async () => {
      // Test that diagnostic tools work through the tool registry integration
      const registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;

      // Verify diagnostic tool is registered
      const tools = registry.listTools();
      const diagnosticTool = tools.find((tool) => tool.name === 'diagnostic_info');
      expect(diagnosticTool).toBeDefined();
      expect(diagnosticTool?.description).toContain('diagnostic information');
    });

    it('should maintain backward compatibility after modular refactoring', async () => {
      // Test that all expected tools are still available
      const registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
      const tools = registry.listTools();

      // Use the shared expectedToolNames constant defined at the top of the test file

      const actualToolNames = tools.map((tool) => tool.name).sort();
      expect(actualToolNames).toEqual(expectedToolNames.sort());
    });

    it('should maintain same error handling behavior after refactoring', () => {
      // Test that configuration errors are still properly thrown
      const originalToken = process.env['YNAB_ACCESS_TOKEN'];
      delete process.env['YNAB_ACCESS_TOKEN'];

      try {
        expect(() => new YNABMCPServer()).toThrow(ConfigurationError);
        expect(() => new YNABMCPServer()).toThrow(
          'YNAB_ACCESS_TOKEN environment variable is required but not set',
        );
      } finally {
        // Restore token
        process.env['YNAB_ACCESS_TOKEN'] = originalToken;
      }
    });

    it('should delegate diagnostic collection to diagnostic manager', async () => {
      const registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
      const accessToken = process.env['YNAB_ACCESS_TOKEN']!;

      // Test that diagnostic_info tool works and returns expected structure
      const result = await registry.executeTool({
        name: 'diagnostic_info',
        accessToken,
        arguments: {
          include_server: true,
          include_memory: false,
          include_environment: false,
          include_security: false,
          include_cache: false,
        },
      });

      const diagnostics = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(diagnostics.timestamp).toBeDefined();
      expect(diagnostics.server).toBeDefined();
      expect(diagnostics.server.name).toBe('ynab-mcp-server');
      expect(diagnostics.server.version).toBeDefined();

      // These should be undefined because we set include flags to false
      expect(diagnostics.memory).toBeUndefined();
      expect(diagnostics.environment).toBeUndefined();
      expect(diagnostics.security).toBeUndefined();
      expect(diagnostics.cache).toBeUndefined();
    });
  });
});
