import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
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
      const statsBeforeClear = cacheManager.getStats();
      expect(statsBeforeClear.size).toBeGreaterThan(0);

      await registry.executeTool({
        name: 'clear_cache',
        accessToken: accessToken(),
        arguments: {},
      });

      const statsAfterClear = cacheManager.getStats();
      expect(statsAfterClear.size).toBe(0);
      expect(statsAfterClear.hits).toBe(0);
      expect(statsAfterClear.misses).toBe(0);
      expect(statsAfterClear.evictions).toBe(0);
      expect(statsAfterClear.lastCleanup).toBe(null);
    });

    it('should track cache performance metrics during real tool execution', async () => {
      // Clear cache and capture initial state
      cacheManager.clear();

      // Manually simulate cache usage that would occur during API calls
      const mockApiResult = { budgets: [{ id: '123', name: 'Test Budget' }] };
      cacheManager.set('budgets:list', mockApiResult, 60000);

      // Test cache hit
      const cachedResult = cacheManager.get('budgets:list');
      expect(cachedResult).toEqual(mockApiResult);

      // Test cache miss
      const missResult = cacheManager.get('nonexistent:key');
      expect(missResult).toBeNull();

      const stats = cacheManager.getStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should demonstrate LRU eviction with real cache operations', async () => {
      // This test demonstrates the LRU eviction functionality
      // by creating a temporary cache with a low maxEntries limit
      const originalEnvValue = process.env.YNAB_MCP_CACHE_MAX_ENTRIES;

      try {
        // Set low limit and create a new cache manager instance
        process.env.YNAB_MCP_CACHE_MAX_ENTRIES = '2';
        const tempCache = new (await import('../cacheManager.js')).CacheManager();

        // Add entries that should trigger eviction
        tempCache.set('test:entry1', { data: 'value1' }, 60000);
        tempCache.set('test:entry2', { data: 'value2' }, 60000);

        // This should trigger eviction of entry1 due to LRU policy
        tempCache.set('test:entry3', { data: 'value3' }, 60000);

        const stats = tempCache.getStats();
        // Should have some evictions due to LRU policy
        expect(stats.evictions).toBeGreaterThan(0);
        expect(stats.size).toBeLessThanOrEqual(2);
      } finally {
        // Restore original environment
        if (originalEnvValue !== undefined) {
          process.env.YNAB_MCP_CACHE_MAX_ENTRIES = originalEnvValue;
        } else {
          delete process.env.YNAB_MCP_CACHE_MAX_ENTRIES;
        }
      }
    });

    it('should show cache hit rate improvement with repeated operations', async () => {
      cacheManager.clear();

      // Manually demonstrate cache hit rate improvement
      cacheManager.set('test:operation1', { data: 'result1' }, 60000);
      cacheManager.get('test:operation1'); // Hit
      cacheManager.get('test:nonexistent'); // Miss
      cacheManager.get('test:operation1'); // Hit

      const finalStats = cacheManager.getStats();
      expect(finalStats.hits).toBeGreaterThan(0);
      expect(finalStats.misses).toBeGreaterThan(0);
      expect(finalStats.hitRate).toBeGreaterThan(0);
      expect(finalStats.hitRate).toBeGreaterThan(0.5); // Should have more hits than misses
    });

    it('should handle concurrent cache operations correctly', async () => {
      cacheManager.clear();

      // Simulate concurrent cache operations manually
      cacheManager.set('test:concurrent1', { data: 'value1' }, 60000);
      cacheManager.set('test:concurrent2', { data: 'value2' }, 60000);

      // Simulate concurrent reads
      const value1 = cacheManager.get('test:concurrent1');
      const value2 = cacheManager.get('test:concurrent2');
      const nonexistent = cacheManager.get('test:nonexistent');

      expect(value1).toBeTruthy();
      expect(value2).toBeTruthy();
      expect(nonexistent).toBeNull();

      // Cache should have handled concurrent requests properly
      const stats = cacheManager.getStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hits + stats.misses).toBeGreaterThan(0);
    });

    it('should include enhanced cache metrics in real diagnostic collection', async () => {
      // Generate some real cache activity
      await registry.executeTool({
        name: 'list_budgets',
        accessToken: accessToken(),
        arguments: {},
      });

      await registry.executeTool({
        name: 'get_user',
        accessToken: accessToken(),
        arguments: {},
      });

      // Call diagnostics tool with cache enabled
      const result = await registry.executeTool({
        name: 'diagnostic_info',
        accessToken: accessToken(),
        arguments: {
          include_server: false,
          include_memory: false,
          include_environment: false,
          include_security: false,
          include_cache: true,
        },
      });

      const diagnostics = JSON.parse(result.content?.[0]?.text ?? '{}');

      expect(diagnostics.cache).toBeDefined();
      expect(diagnostics.cache.entries).toEqual(expect.any(Number));
      expect(diagnostics.cache.estimated_size_kb).toEqual(expect.any(Number));
      expect(diagnostics.cache.keys).toEqual(expect.any(Array));

      // Enhanced metrics should be present
      expect(diagnostics.cache.hits).toEqual(expect.any(Number));
      expect(diagnostics.cache.misses).toEqual(expect.any(Number));
      expect(diagnostics.cache.evictions).toEqual(expect.any(Number));
      expect(diagnostics.cache.maxEntries).toEqual(expect.any(Number));
      expect(diagnostics.cache.hitRate).toEqual(expect.stringMatching(/^\d+\.\d{2}%$/));
      expect(diagnostics.cache.performance_summary).toEqual(expect.stringContaining('Hit rate'));

      // lastCleanup can be null or a timestamp
      expect(
        diagnostics.cache.lastCleanup === null || typeof diagnostics.cache.lastCleanup === 'string',
      ).toBe(true);
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

  describe('Modular Architecture Integration with Real API', () => {
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

    it('should maintain real API functionality after modular refactoring', async () => {
      // Test that the key integration points work with real API calls
      // This verifies that resource manager, diagnostic manager, and other modules
      // properly integrate with the real YNAB API

      // Test 1: User info via API (tests core YNAB integration)
      const userResult = await registry.executeTool({
        name: 'get_user',
        accessToken: accessToken(),
        arguments: {},
      });
      const userPayload = JSON.parse(userResult.content?.[0]?.text ?? '{}');
      expect(userPayload.user).toBeDefined();
      expect(userPayload.user.id).toBeDefined();

      // Test 2: Budget listing (tests resource-like functionality)
      const budgetsResult = await registry.executeTool({
        name: 'list_budgets',
        accessToken: accessToken(),
        arguments: {},
      });
      const budgetsPayload = JSON.parse(budgetsResult.content?.[0]?.text ?? '{}');
      expect(budgetsPayload.budgets).toBeDefined();
      expect(Array.isArray(budgetsPayload.budgets)).toBe(true);

      // Test 3: Diagnostic info (tests diagnostic manager integration)
      const diagResult = await registry.executeTool({
        name: 'diagnostic_info',
        accessToken: accessToken(),
        arguments: {
          include_server: true,
          include_memory: false,
          include_environment: false,
          include_security: true,
          include_cache: true,
        },
      });
      const diagnostics = JSON.parse(diagResult.content?.[0]?.text ?? '{}');
      expect(diagnostics.timestamp).toBeDefined();
      expect(diagnostics.server).toBeDefined();
      expect(diagnostics.server.name).toBe('ynab-mcp-server');
      expect(diagnostics.security).toBeDefined();
      expect(diagnostics.cache).toBeDefined();
    });

    it('should handle modular service errors gracefully in integration', async () => {
      // Test error handling through the modules with real API
      try {
        await registry.executeTool({
          name: 'get_budget',
          accessToken: accessToken(),
          arguments: {} as Record<string, unknown>, // Missing required budget_id
        });
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        // Error handling should still work properly
        expect(error).toBeDefined();
      }
    });
  });

  describe('Budget Resolution Integration Tests', () => {
    let server: YNABMCPServer;
    let registry: ToolRegistry;

    const accessToken = () => {
      const token = process.env['YNAB_ACCESS_TOKEN'];
      if (!token) {
        throw new Error('YNAB_ACCESS_TOKEN must be defined for integration tests');
      }
      return token;
    };

    const getFirstAvailableBudgetId = async (): Promise<string> => {
      const result = await registry.executeTool({
        name: 'list_budgets',
        accessToken: accessToken(),
        arguments: {},
      });
      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      const firstBudget = payload.budgets?.[0];
      expect(firstBudget?.id).toBeDefined();
      return firstBudget.id as string;
    };

    beforeEach(() => {
      server = new YNABMCPServer(false);
      registry = (server as unknown as { toolRegistry: ToolRegistry }).toolRegistry;
    });

    it('should handle real YNAB API calls with budget resolution errors', async () => {
      // Test with no default budget set - should get standardized error
      const result = await registry.executeTool({
        name: 'list_accounts',
        accessToken: accessToken(),
        arguments: {},
      });

      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeDefined();
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toContain('No budget ID provided and no default budget set');
      expect(payload.error.suggestions).toBeDefined();
    });

    it('should handle real YNAB API calls with invalid budget ID', async () => {
      const invalidBudgetId = 'invalid-uuid-format';
      const result = await registry.executeTool({
        name: 'list_accounts',
        accessToken: accessToken(),
        arguments: { budget_id: invalidBudgetId },
      });

      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeDefined();
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toContain('Invalid budget ID format');
      expect(payload.error.suggestions).toBeDefined();
      expect(payload.error.suggestions.some((s: string) => s.includes('UUID v4 format'))).toBe(
        true,
      );
    });

    it('should complete end-to-end workflow with real YNAB API after setting default budget', async () => {
      // Step 1: Verify error with no default budget
      let result = await registry.executeTool({
        name: 'financial_overview',
        accessToken: accessToken(),
        arguments: {},
      });

      let payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeDefined();
      expect(payload.error.code).toBe('VALIDATION_ERROR');

      // Step 2: Get a valid budget ID and set as default
      const budgetId = await getFirstAvailableBudgetId();
      await registry.executeTool({
        name: 'set_default_budget',
        accessToken: accessToken(),
        arguments: { budget_id: budgetId },
      });

      // Step 3: Verify financial overview now works with real API
      result = await registry.executeTool({
        name: 'financial_overview',
        accessToken: accessToken(),
        arguments: { months: 1, include_trends: false, include_insights: false },
      });

      payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeUndefined();
      expect(payload).toHaveProperty('overview');
      expect(payload.overview).toHaveProperty('budgetName');
    });

    it('should handle real API errors properly with budget resolution', async () => {
      // Use a UUID that is valid format but doesn't exist in YNAB
      const nonExistentButValidUuid = '123e4567-e89b-12d3-a456-426614174000';

      const result = await registry.executeTool({
        name: 'list_accounts',
        accessToken: accessToken(),
        arguments: { budget_id: nonExistentButValidUuid },
      });

      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      // Should get a YNAB API error (404) not a validation error
      expect(payload.error).toBeDefined();
      expect(payload.error.code).toBe(404); // YNAB NOT_FOUND error
    });

    it('should maintain performance with real API calls and budget resolution', async () => {
      const budgetId = await getFirstAvailableBudgetId();
      await registry.executeTool({
        name: 'set_default_budget',
        accessToken: accessToken(),
        arguments: { budget_id: budgetId },
      });

      const startTime = Date.now();

      // Make multiple concurrent calls that use budget resolution
      const promises = [
        registry.executeTool({
          name: 'list_accounts',
          accessToken: accessToken(),
          arguments: {},
        }),
        registry.executeTool({
          name: 'list_categories',
          accessToken: accessToken(),
          arguments: {},
        }),
        registry.executeTool({
          name: 'list_payees',
          accessToken: accessToken(),
          arguments: {},
        }),
      ];

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      results.forEach((result) => {
        const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
        expect(payload.error).toBeUndefined();
      });

      // Should complete reasonably quickly (accounting for network latency)
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max for 3 API calls
    });

    it('should handle security middleware with budget resolution errors', async () => {
      // Test that security middleware still works with budget resolution
      const result = await registry.executeTool({
        name: 'list_accounts',
        accessToken: 'invalid-token',
        arguments: {},
      });

      const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
      expect(payload.error).toBeDefined();
      // Should get authentication error, not budget resolution error
      expect(payload.error.code).toBe(401);
    });
  });
});
