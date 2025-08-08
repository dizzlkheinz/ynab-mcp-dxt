/**
 * Performance and load tests for YNAB MCP Server
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YNABMCPServer } from '../server/YNABMCPServer.js';
import { executeToolCall, parseToolResult, getTestConfig } from './testUtils.js';

// Mock the YNAB SDK for performance tests
vi.mock('ynab', () => {
  const mockAPI = {
    budgets: {
      getBudgets: vi.fn(),
      getBudgetById: vi.fn()
    },
    accounts: {
      getAccounts: vi.fn(),
      getAccountById: vi.fn()
    },
    transactions: {
      getTransactions: vi.fn(),
      getTransactionById: vi.fn(),
      createTransaction: vi.fn()
    },
    categories: {
      getCategories: vi.fn()
    },
    user: {
      getUser: vi.fn()
    }
  };

  return {
    API: vi.fn(() => mockAPI)
  };
});

describe('YNAB MCP Server - Performance Tests', () => {
  let server: YNABMCPServer;
  let mockYnabAPI: any;

  beforeEach(async () => {
    process.env['YNAB_ACCESS_TOKEN'] = 'test-token';
    server = new YNABMCPServer();
    
    const { API } = await import('ynab');
    mockYnabAPI = new (API as any)();
    
    vi.clearAllMocks();
  });

  describe('Response Time Performance', () => {
    it('should respond to budget listing within acceptable time', async () => {
      // Mock quick response
      mockYnabAPI.budgets.getBudgets.mockResolvedValue({
        data: {
          budgets: Array.from({ length: 5 }, (_, i) => ({
            id: `budget-${i}`,
            name: `Budget ${i}`,
            last_modified_on: '2024-01-01T00:00:00Z',
            first_month: '2024-01-01',
            last_month: '2024-12-01'
          }))
        }
      });

      const startTime = Date.now();
      const result = await executeToolCall(server, 'ynab:list_budgets');
      const endTime = Date.now();
      
      const responseTime = endTime - startTime;
      
      expect(result).toBeDefined();
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      
      const budgets = parseToolResult(result);
      expect(budgets.data.budgets).toHaveLength(5);
    });

    it('should handle large transaction lists efficiently', async () => {
      const largeTransactionList = Array.from({ length: 1000 }, (_, i) => ({
        id: `transaction-${i}`,
        date: '2024-01-01',
        amount: -1000 * (i + 1),
        memo: `Transaction ${i}`,
        cleared: 'cleared',
        approved: true,
        account_id: 'account-1',
        category_id: 'category-1'
      }));

      mockYnabAPI.transactions.getTransactions.mockResolvedValue({
        data: {
          transactions: largeTransactionList
        }
      });

      const startTime = Date.now();
      const result = await executeToolCall(server, 'ynab:list_transactions', {
        budget_id: 'test-budget'
      });
      const endTime = Date.now();
      
      const responseTime = endTime - startTime;
      
      expect(result).toBeDefined();
      expect(responseTime).toBeLessThan(2000); // Should handle large lists within 2 seconds
      
      const transactions = parseToolResult(result);
      expect(transactions.data.transactions).toHaveLength(1000);
    });

    it('should handle concurrent requests efficiently', async () => {
      // Mock responses for concurrent requests
      mockYnabAPI.budgets.getBudgets.mockResolvedValue({
        data: { budgets: [{ id: 'budget-1', name: 'Test Budget' }] }
      });
      
      mockYnabAPI.accounts.getAccounts.mockResolvedValue({
        data: { accounts: [{ id: 'account-1', name: 'Test Account', type: 'checking', balance: 0 }] }
      });
      
      mockYnabAPI.user.getUser.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } }
      });

      const startTime = Date.now();
      
      // Execute multiple concurrent requests
      const promises = [
        executeToolCall(server, 'ynab:list_budgets'),
        executeToolCall(server, 'ynab:list_accounts', { budget_id: 'test-budget' }),
        executeToolCall(server, 'ynab:get_user'),
        executeToolCall(server, 'ynab:list_budgets'),
        executeToolCall(server, 'ynab:list_accounts', { budget_id: 'test-budget' })
      ];
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toBeDefined());
      expect(totalTime).toBeLessThan(3000); // All concurrent requests within 3 seconds
    });
  });

  describe('Memory Usage Performance', () => {
    it('should handle memory efficiently with large datasets', async () => {
      // Create a large mock dataset
      const largeCategoryList = Array.from({ length: 100 }, (_, groupIndex) => ({
        id: `group-${groupIndex}`,
        name: `Category Group ${groupIndex}`,
        hidden: false,
        categories: Array.from({ length: 20 }, (_, catIndex) => ({
          id: `category-${groupIndex}-${catIndex}`,
          category_group_id: `group-${groupIndex}`,
          name: `Category ${groupIndex}-${catIndex}`,
          hidden: false,
          budgeted: 1000 * catIndex,
          activity: -500 * catIndex,
          balance: 500 * catIndex
        }))
      }));

      mockYnabAPI.categories.getCategories.mockResolvedValue({
        data: {
          category_groups: largeCategoryList
        }
      });

      const initialMemory = process.memoryUsage();
      
      // Process large dataset multiple times
      for (let i = 0; i < 10; i++) {
        const result = await executeToolCall(server, 'ynab:list_categories', {
          budget_id: 'test-budget'
        });
        
        const categories = parseToolResult(result);
        expect(categories.data.category_groups).toHaveLength(100);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory usage shouldn't grow excessively (allow for some variance)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors quickly without blocking', async () => {
      // Mock API errors
      const apiError = new Error('API Error');
      mockYnabAPI.budgets.getBudgets.mockRejectedValue(apiError);
      mockYnabAPI.accounts.getAccounts.mockRejectedValue(apiError);

      const startTime = Date.now();
      
      // Execute multiple failing requests
      const promises = [
        executeToolCall(server, 'ynab:list_budgets'),
        executeToolCall(server, 'ynab:list_accounts', { budget_id: 'test' }),
        executeToolCall(server, 'ynab:list_budgets')
      ];
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Check that all results are error responses
      results.forEach(result => {
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error).toBeDefined();
      });
      expect(totalTime).toBeLessThan(1000); // Errors should be handled quickly
    });

    it('should recover from rate limiting gracefully', async () => {
      let callCount = 0;
      
      // Mock rate limiting on first few calls, then success
      mockYnabAPI.budgets.getBudgets.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          const rateLimitError = new Error('Rate Limited');
          (rateLimitError as any).error = { id: '429', name: 'rate_limit' };
          return Promise.reject(rateLimitError);
        }
        return Promise.resolve({
          data: { budgets: [{ id: 'budget-1', name: 'Test Budget' }] }
        });
      });

      const startTime = Date.now();
      
      try {
        // This should fail due to rate limiting
        await executeToolCall(server, 'ynab:list_budgets');
        expect.fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      const endTime = Date.now();
      const errorTime = endTime - startTime;
      
      expect(errorTime).toBeLessThan(500); // Rate limit errors should be fast
      expect(callCount).toBe(1);
    });
  });

  describe('Validation Performance', () => {
    it('should validate input parameters quickly', async () => {
      const startTime = Date.now();
      
      // Test multiple validation scenarios
      const validationTests = [
        // Valid parameters
        executeToolCall(server, 'ynab:convert_amount', {
          amount: 25.50,
          to_milliunits: true
        }),
        
        // Invalid parameters (should fail quickly)
        executeToolCall(server, 'ynab:get_budget', {
          budget_id: '' // Empty string should fail validation
        }).catch(() => 'validation_error'),
        
        executeToolCall(server, 'ynab:create_transaction', {
          budget_id: 'test',
          account_id: 'test',
          amount: 'not-a-number', // Invalid type
          date: '2024-01-01'
        }).catch(() => 'validation_error')
      ];
      
      const results = await Promise.all(validationTests);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined(); // Valid call should succeed
      expect(results[1]).toBe('validation_error'); // Invalid calls should fail
      expect(results[2]).toBe('validation_error');
      expect(totalTime).toBeLessThan(1000); // Validation should be fast
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid sequential requests', async () => {
      mockYnabAPI.user.getUser.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } }
      });

      const startTime = Date.now();
      
      // Execute 50 rapid sequential requests
      const results = [];
      for (let i = 0; i < 50; i++) {
        const result = await executeToolCall(server, 'ynab:get_user');
        results.push(result);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / 50;
      
      expect(results).toHaveLength(50);
      results.forEach(result => expect(result).toBeDefined());
      expect(averageTime).toBeLessThan(100); // Average less than 100ms per request
      expect(totalTime).toBeLessThan(5000); // Total less than 5 seconds
    });

    it('should maintain performance under mixed workload', async () => {
      // Mock various endpoints
      mockYnabAPI.budgets.getBudgets.mockResolvedValue({
        data: { budgets: [{ id: 'budget-1', name: 'Test Budget' }] }
      });
      
      mockYnabAPI.accounts.getAccounts.mockResolvedValue({
        data: { accounts: [{ id: 'account-1', name: 'Test Account' }] }
      });
      
      mockYnabAPI.transactions.getTransactions.mockResolvedValue({
        data: { transactions: [] }
      });
      
      mockYnabAPI.categories.getCategories.mockResolvedValue({
        data: { category_groups: [] }
      });

      const startTime = Date.now();
      
      // Mixed workload: different tools with different complexities
      const mixedPromises = [];
      for (let i = 0; i < 20; i++) {
        mixedPromises.push(
          executeToolCall(server, 'ynab:list_budgets'),
          executeToolCall(server, 'ynab:list_accounts', { budget_id: 'test' }),
          executeToolCall(server, 'ynab:list_transactions', { budget_id: 'test' }),
          executeToolCall(server, 'ynab:list_categories', { budget_id: 'test' }),
          executeToolCall(server, 'ynab:convert_amount', { amount: i * 10, to_milliunits: true })
        );
      }
      
      const results = await Promise.all(mixedPromises);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      expect(results).toHaveLength(100); // 20 iterations × 5 tools
      results.forEach(result => expect(result).toBeDefined());
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});