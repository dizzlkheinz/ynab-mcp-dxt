import { describe, expect, test } from 'vitest';
import {
  FinancialOverviewSchema,
  SpendingAnalysisSchema,
  BudgetHealthSchema,
  type FinancialOverviewParams,
  type SpendingAnalysisParams,
  type BudgetHealthParams,
  type SpendingTrend,
  type BudgetInsight,
  type HealthSubScores,
} from '../../financialOverview/schemas.js';

describe('FinancialOverviewSchema', () => {
  test('should parse valid input with defaults', () => {
    const input = { budget_id: 'test-budget' };
    const result = FinancialOverviewSchema.parse(input);

    expect(result).toEqual({
      budget_id: 'test-budget',
      months: 3,
      include_insights: true,
    });
  });

  test('should parse custom values', () => {
    const input = {
      budget_id: 'test-budget',
      months: 6,
      include_insights: false,
    };
    const result = FinancialOverviewSchema.parse(input);

    expect(result).toEqual(input);
  });

  test('should validate months range', () => {
    expect(() => FinancialOverviewSchema.parse({ budget_id: 'test-budget', months: 0 })).toThrow();
    expect(() => FinancialOverviewSchema.parse({ budget_id: 'test-budget', months: 13 })).toThrow();
    expect(() =>
      FinancialOverviewSchema.parse({ budget_id: 'test-budget', months: 1 }),
    ).not.toThrow();
    expect(() =>
      FinancialOverviewSchema.parse({ budget_id: 'test-budget', months: 12 }),
    ).not.toThrow();
  });

  test('should reject extra properties', () => {
    const input = {
      budget_id: 'test-budget',
      months: 3,
      invalid_property: 'should fail',
    };
    expect(() => FinancialOverviewSchema.parse(input)).toThrow();
  });

  test('should validate type compatibility', () => {
    const parsed: FinancialOverviewParams = FinancialOverviewSchema.parse({
      budget_id: 'test-budget',
    });
    expect(parsed.months).toBe(3);
    expect(parsed.include_insights).toBe(true);
  });
});

describe('SpendingAnalysisSchema', () => {
  test('should parse valid input with defaults', () => {
    const input = { budget_id: 'test-budget' };
    const result = SpendingAnalysisSchema.parse(input);

    expect(result).toEqual({
      budget_id: 'test-budget',
      period_months: 6,
    });
  });

  test('should parse custom values', () => {
    const input = {
      budget_id: 'test-budget',
      period_months: 12,
      category_id: 'test-category',
    };
    const result = SpendingAnalysisSchema.parse(input);

    expect(result).toEqual(input);
  });

  test('should validate period_months range', () => {
    expect(() =>
      SpendingAnalysisSchema.parse({ budget_id: 'test-budget', period_months: 0 }),
    ).toThrow();
    expect(() =>
      SpendingAnalysisSchema.parse({ budget_id: 'test-budget', period_months: 13 }),
    ).toThrow();
    expect(() =>
      SpendingAnalysisSchema.parse({ budget_id: 'test-budget', period_months: 1 }),
    ).not.toThrow();
    expect(() =>
      SpendingAnalysisSchema.parse({ budget_id: 'test-budget', period_months: 12 }),
    ).not.toThrow();
  });

  test('should handle optional fields', () => {
    const input = { budget_id: 'test' };
    const result = SpendingAnalysisSchema.parse(input);

    expect(result.budget_id).toBe('test');
    expect(result.period_months).toBe(6);
    expect(result.category_id).toBeUndefined();
  });

  test('should validate type compatibility', () => {
    const parsed: SpendingAnalysisParams = SpendingAnalysisSchema.parse({
      budget_id: 'test-budget',
    });
    expect(parsed.period_months).toBe(6);
  });
});

describe('BudgetHealthSchema', () => {
  test('should parse valid input with defaults', () => {
    const input = { budget_id: 'test-budget' };
    const result = BudgetHealthSchema.parse(input);

    expect(result).toEqual({
      budget_id: 'test-budget',
      include_recommendations: true,
    });
  });

  test('should parse custom values', () => {
    const input = {
      budget_id: 'test-budget',
      include_recommendations: false,
    };
    const result = BudgetHealthSchema.parse(input);

    expect(result).toEqual(input);
  });

  test('should validate boolean type', () => {
    expect(() =>
      BudgetHealthSchema.parse({ budget_id: 'test-budget', include_recommendations: 'true' }),
    ).toThrow();
    expect(() =>
      BudgetHealthSchema.parse({ budget_id: 'test-budget', include_recommendations: 1 }),
    ).toThrow();
    expect(() =>
      BudgetHealthSchema.parse({ budget_id: 'test-budget', include_recommendations: true }),
    ).not.toThrow();
    expect(() =>
      BudgetHealthSchema.parse({ budget_id: 'test-budget', include_recommendations: false }),
    ).not.toThrow();
  });

  test('should validate type compatibility', () => {
    const parsed: BudgetHealthParams = BudgetHealthSchema.parse({ budget_id: 'test-budget' });
    expect(parsed.include_recommendations).toBe(true);
  });
});

describe('Type Definitions', () => {
  test('SpendingTrend interface should have correct structure', () => {
    const trend: SpendingTrend = {
      category: 'Test Category',
      categoryId: 'test-id',
      currentPeriod: 100,
      previousPeriod: 80,
      percentChange: 25,
      trend: 'increasing',
      significance: 'high',
      explanation: 'Test explanation',
      data_points: 6,
      reliability_score: 85,
    };

    expect(trend.category).toBe('Test Category');
    expect(trend.trend).toBe('increasing');
    expect(trend.significance).toBe('high');
  });

  test('BudgetInsight interface should have correct structure', () => {
    const insight: BudgetInsight = {
      type: 'warning',
      category: 'spending',
      title: 'Test Insight',
      description: 'Test description',
      impact: 'high',
      actionable: true,
      suggestions: ['Suggestion 1', 'Suggestion 2'],
    };

    expect(insight.type).toBe('warning');
    expect(insight.category).toBe('spending');
    expect(insight.actionable).toBe(true);
    expect(insight.suggestions).toHaveLength(2);
  });

  test('HealthSubScores interface should have correct structure', () => {
    const scores: HealthSubScores = {
      spending_health: 85,
      debt_health: 90,
      emergency_fund_health: 70,
      budget_discipline: 80,
    };

    expect(scores.spending_health).toBe(85);
    expect(scores.debt_health).toBe(90);
    expect(scores.emergency_fund_health).toBe(70);
    expect(scores.budget_discipline).toBe(80);
  });
});

describe('Edge Cases and Error Handling', () => {
  test('should handle null and undefined inputs', () => {
    expect(() => FinancialOverviewSchema.parse(null)).toThrow();
    expect(() => FinancialOverviewSchema.parse(undefined)).toThrow();
    expect(() => SpendingAnalysisSchema.parse(null)).toThrow();
    expect(() => BudgetHealthSchema.parse(null)).toThrow();
  });

  test('should handle invalid types', () => {
    expect(() => FinancialOverviewSchema.parse('string')).toThrow();
    expect(() => FinancialOverviewSchema.parse(123)).toThrow();
    expect(() => FinancialOverviewSchema.parse([])).toThrow();
  });

  test('should provide meaningful error messages', () => {
    try {
      FinancialOverviewSchema.parse({ months: 15 });
    } catch (error) {
      expect(error).toBeDefined();
      // Zod provides detailed error information
    }
  });
});

describe('Backward Compatibility', () => {
  test('schemas should work identically to original implementation', () => {
    // Test that default values match original behavior
    const financial = FinancialOverviewSchema.parse({ budget_id: 'test-budget' });
    expect(financial.months).toBe(3);
    expect(financial.include_insights).toBe(true);

    const spending = SpendingAnalysisSchema.parse({ budget_id: 'test-budget' });
    expect(spending.period_months).toBe(6);

    const health = BudgetHealthSchema.parse({ budget_id: 'test-budget' });
    expect(health.include_recommendations).toBe(true);
  });

  test('should accept all previously valid inputs', () => {
    // These were valid inputs in the original implementation
    const inputs = [
      { budget_id: 'test', months: 1 },
      { budget_id: 'test', months: 12, include_insights: false },
      { budget_id: 'test', period_months: 3, category_id: 'cat-123' },
      { budget_id: 'test', include_recommendations: false },
    ];

    expect(() => {
      FinancialOverviewSchema.parse(inputs[0]);
      FinancialOverviewSchema.parse(inputs[1]);
      SpendingAnalysisSchema.parse(inputs[2]);
      BudgetHealthSchema.parse(inputs[3]);
    }).not.toThrow();
  });
});
