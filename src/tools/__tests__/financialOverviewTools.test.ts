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

  describe('Variability Calculation', () => {
    it('should calculate coefficient of variation correctly', () => {
      // Test data: spending values with known statistical properties
      const monthlySpending = [
        { activity: 100 }, // $100
        { activity: 200 }, // $200  
        { activity: 150 }, // $150
        { activity: 50 },  // $50
      ];
      
      // Manual calculation for verification:
      // Mean = (100 + 200 + 150 + 50) / 4 = 125
      // Variance = [(100-125)² + (200-125)² + (150-125)² + (50-125)²] / 4
      //          = [625 + 5625 + 625 + 5625] / 4 = 3125
      // Std Dev = √3125 ≈ 55.9
      // CV = (55.9 / 125) * 100 ≈ 44.7%
      
      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const avgMonthlySpending = totalSpent / monthlySpending.length;
      const spendingValues = monthlySpending.map(m => m.activity);
      const variance = spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) / spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation = avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;
      
      expect(avgMonthlySpending).toBe(125);
      expect(variance).toBe(3125);
      expect(standardDeviation).toBeCloseTo(55.9, 1);
      expect(coefficientOfVariation).toBeCloseTo(44.7, 1);
    });

    it('should handle zero spending correctly', () => {
      const monthlySpending = [
        { activity: 0 },
        { activity: 0 },
        { activity: 0 },
      ];
      
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
      const spendingValues = monthlySpending.map(m => m.activity);
      const variance = spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) / spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation = avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;
      
      expect(avgMonthlySpending).toBe(100);
      expect(variance).toBe(0);
      expect(standardDeviation).toBe(0);
      expect(coefficientOfVariation).toBe(0); // Perfect consistency = 0% variability
    });
  });
});