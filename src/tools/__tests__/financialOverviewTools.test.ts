import { describe, it, expect, vi } from 'vitest';
import * as ynab from 'ynab';
import { 
  FinancialOverviewSchema, 
  SpendingAnalysisSchema, 
  CashFlowForecastSchema, 
  BudgetHealthSchema 
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

    it('should validate CashFlowForecastSchema with defaults', () => {
      const result = CashFlowForecastSchema.parse({});
      expect(result).toEqual({
        forecast_months: 3,
      });
    });

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
      expect(module.handleCashFlowForecast).toBeDefined();
      expect(module.handleBudgetHealthCheck).toBeDefined();
    });
  });
});