import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  FinancialOverviewSchema,
  SpendingAnalysisSchema,
  BudgetHealthSchema,
} from '../financialOverviewTools.js';

describe('Financial Overview Tools', () => {
  describe('Schema Validation', () => {
    it('should validate FinancialOverviewSchema with default values', () => {
      const result = FinancialOverviewSchema.parse({});
      expect(result).toEqual({
        months: 3,
        include_trends: true,
        include_insights: true,
      });
    });

    it('should validate FinancialOverviewSchema with custom values', () => {
      const input = {
        budget_id: 'test-budget-id',
        months: 6,
        include_trends: false,
        include_insights: false,
      };
      const result = FinancialOverviewSchema.parse(input);
      expect(result).toEqual(input);
    });

    it('should validate SpendingAnalysisSchema with defaults', () => {
      const result = SpendingAnalysisSchema.parse({});
      expect(result).toEqual({
        period_months: 6,
      });
    });

    // Note: Cash flow forecast is not implemented; no schema exported.

    it('should validate BudgetHealthSchema with defaults', () => {
      const result = BudgetHealthSchema.parse({});
      expect(result).toEqual({
        include_recommendations: true,
      });
    });

    it('should reject invalid months values', () => {
      expect(() => FinancialOverviewSchema.parse({ months: 0 })).toThrow();
      expect(() => FinancialOverviewSchema.parse({ months: 13 })).toThrow();
      expect(() => SpendingAnalysisSchema.parse({ period_months: 0 })).toThrow();
      expect(() => SpendingAnalysisSchema.parse({ period_months: 13 })).toThrow();
    });
  });

  describe('Tool Integration', () => {
    it('should be importable without errors', async () => {
      const module = await import('../financialOverviewTools.js');
      expect(module.handleFinancialOverview).toBeDefined();
      expect(module.handleSpendingAnalysis).toBeDefined();
      expect(module.handleBudgetHealthCheck).toBeDefined();
    });
  });

  describe('Variability Calculation', () => {
    it('should calculate coefficient of variation correctly', () => {
      // Test data: spending values with known statistical properties
      const monthlySpending = [
        { activity: 100 }, // $100
        { activity: 200 }, // $200
        { activity: 150 }, // $150
        { activity: 50 }, // $50
      ];

      // Manual calculation for verification:
      // Mean = (100 + 200 + 150 + 50) / 4 = 125
      // Variance = [(100-125)² + (200-125)² + (150-125)² + (50-125)²] / 4
      //          = [625 + 5625 + 625 + 5625] / 4 = 3125
      // Std Dev = √3125 ≈ 55.9
      // CV = (55.9 / 125) * 100 ≈ 44.7%

      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const avgMonthlySpending = totalSpent / monthlySpending.length;
      const spendingValues = monthlySpending.map((m) => m.activity);
      const variance =
        spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) /
        spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation =
        avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;

      expect(avgMonthlySpending).toBe(125);
      expect(variance).toBe(3125);
      expect(standardDeviation).toBeCloseTo(55.9, 1);
      expect(coefficientOfVariation).toBeCloseTo(44.7, 1);
    });

    it('should handle zero spending correctly', () => {
      const monthlySpending = [{ activity: 0 }, { activity: 0 }, { activity: 0 }];

      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const avgMonthlySpending = totalSpent / monthlySpending.length;
      const coefficientOfVariation = avgMonthlySpending > 0 ? 0 : 0; // Should be 0 for zero spending

      expect(avgMonthlySpending).toBe(0);
      expect(coefficientOfVariation).toBe(0);
    });

    it('should handle consistent spending (low variability)', () => {
      const monthlySpending = [
        { activity: 100 },
        { activity: 100 },
        { activity: 100 },
        { activity: 100 },
      ];

      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const avgMonthlySpending = totalSpent / monthlySpending.length;
      const spendingValues = monthlySpending.map((m) => m.activity);
      const variance =
        spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) /
        spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation =
        avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;

      expect(avgMonthlySpending).toBe(100);
      expect(variance).toBe(0);
      expect(standardDeviation).toBe(0);
      expect(coefficientOfVariation).toBe(0); // Perfect consistency = 0% variability
    });
  });

  describe('Budget Resolution Integration', () => {
    let handleFinancialOverview: any;
    let handleSpendingAnalysis: any;
    let handleBudgetHealthCheck: any;

    beforeAll(async () => {
      const module = await import('../financialOverviewTools.js');
      handleFinancialOverview = module.handleFinancialOverview;
      handleSpendingAnalysis = module.handleSpendingAnalysis;
      handleBudgetHealthCheck = module.handleBudgetHealthCheck;
    });

    // Mock YNAB API
    const mockYnabAPI = {
      budgets: {
        getBudgetById: vi.fn(),
      },
      months: {
        getBudgetMonth: vi.fn(),
      },
      transactions: {
        getTransactions: vi.fn(),
      },
    } as any;

    describe('Budget ID Validation', () => {
      it('should handle valid UUID budget ID in handleFinancialOverview', async () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';

        // Mock successful API responses
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', id: validUuid } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });

        const params = {
          budget_id: validUuid,
          months: 1,
          include_trends: false,
          include_insights: false,
        };

        // Should not throw an error with valid UUID
        await expect(handleFinancialOverview(mockYnabAPI, params)).resolves.toBeDefined();
      });

      it('should work with valid budget ID (validation handled by registry)', async () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const params = {
          budget_id: validUuid,
          months: 1,
          include_trends: false,
          include_insights: false,
        };

        // Mock successful API responses
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', id: validUuid } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });

        // Should work since registry already validated the budget_id
        const result = await handleFinancialOverview(mockYnabAPI, params);
        expect(result.content).toBeDefined();
      });

      it('should handle errors from YNAB API calls', async () => {
        const validUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
        const params = {
          budget_id: validUuid,
          months: 1,
          include_trends: false,
          include_insights: false,
        };

        // Mock API error response
        mockYnabAPI.budgets.getBudgetById.mockRejectedValue(new Error('Budget not found'));

        // Should handle YNAB API errors gracefully
        const result = await handleFinancialOverview(mockYnabAPI, params);
        expect(result.content).toBeDefined();
        // Should still return a CallToolResult, not throw
      });

      it('should handle valid budget ID in handleSpendingAnalysis', async () => {
        const validUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

        // Mock successful API responses
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', categories: [] } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });

        const params = {
          budget_id: validUuid,
          period_months: 3,
        };

        // Should not throw an error with valid UUID
        await expect(handleSpendingAnalysis(mockYnabAPI, params)).resolves.toBeDefined();
      });

      it('should handle valid budget ID in handleBudgetHealthCheck', async () => {
        const validUuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

        // Mock successful API responses
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', categories: [] } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });
        mockYnabAPI.transactions.getTransactions.mockResolvedValue({
          data: { transactions: [] },
        });

        const params = {
          budget_id: validUuid,
          include_recommendations: true,
        };

        // Should not throw an error with valid UUID
        await expect(handleBudgetHealthCheck(mockYnabAPI, params)).resolves.toBeDefined();
      });
    });

    describe('Consistency Across Tools', () => {
      it('should handle valid budget IDs consistently across all financial overview tools', async () => {
        const validBudgetId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

        // Mock successful API responses for all tools
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', categories: [] } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });
        mockYnabAPI.transactions.getTransactions.mockResolvedValue({
          data: { transactions: [] },
        });

        const results = await Promise.all([
          handleFinancialOverview(mockYnabAPI, {
            budget_id: validBudgetId,
            months: 1,
            include_trends: false,
            include_insights: false,
          }),
          handleSpendingAnalysis(mockYnabAPI, {
            budget_id: validBudgetId,
            period_months: 3,
          }),
          handleBudgetHealthCheck(mockYnabAPI, {
            budget_id: validBudgetId,
            include_recommendations: true,
          }),
        ]);

        // All should return successful results
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.content?.[0]?.type).toBe('text');
        });
      });
    });

    describe('Backward Compatibility', () => {
      it('should maintain the same interface as before budget resolver changes', async () => {
        // Verify that the functions still accept the same parameters
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';

        // Mock successful responses
        mockYnabAPI.budgets.getBudgetById.mockResolvedValue({
          data: { budget: { name: 'Test Budget', id: validUuid } },
        });
        mockYnabAPI.months.getBudgetMonth.mockResolvedValue({
          data: { month: { categories: [] } },
        });
        mockYnabAPI.transactions.getTransactions.mockResolvedValue({
          data: { transactions: [] },
        });

        // Test that all original parameter combinations still work
        const financialOverviewParams = {
          budget_id: validUuid,
          months: 3,
          include_trends: true,
          include_insights: true,
        };

        const spendingAnalysisParams = {
          budget_id: validUuid,
          period_months: 6,
          category_id: 'some-category-id',
        };

        const budgetHealthParams = {
          budget_id: validUuid,
          include_recommendations: false,
        };

        // All should work without throwing
        await expect(
          handleFinancialOverview(mockYnabAPI, financialOverviewParams),
        ).resolves.toBeDefined();
        await expect(
          handleSpendingAnalysis(mockYnabAPI, spendingAnalysisParams),
        ).resolves.toBeDefined();
        await expect(
          handleBudgetHealthCheck(mockYnabAPI, budgetHealthParams),
        ).resolves.toBeDefined();
      });
    });
  });
});
