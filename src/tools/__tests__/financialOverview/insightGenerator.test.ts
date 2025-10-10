import { describe, expect, test } from 'vitest';
import * as ynab from 'ynab';
import {
  generateFinancialInsights,
  generateBudgetOptimizationInsights,
  calculateOverallHealthScore,
  calculateSpendingScore,
  calculateDebtScore,
  calculateEmergencyFundScore,
  calculateBudgetDisciplineScore,
  calculateEmergencyFundStatus,
  calculateDebtToAssetRatio,
  getHealthScoreExplanation,
  generateHealthRecommendations,
} from '../../financialOverview/insightGenerator.js';
import type {
  MonthData,
  SpendingTrend,
  FinancialMetrics,
  HealthSubScores,
} from '../../financialOverview/schemas.js';

// Mock data factories
function createMockMonthData(
  month: string,
  categories: { id: string; budgeted: number; activity: number; balance: number }[],
  toBeBudgeted: number = 0,
): MonthData {
  return {
    data: {
      month: {
        month,
        to_be_budgeted: toBeBudgeted * 1000, // Convert to milliunits
        categories: categories.map((cat) => ({
          id: cat.id,
          budgeted: cat.budgeted * 1000,
          activity: cat.activity * 1000,
          balance: cat.balance * 1000,
        })),
      },
    },
  };
}

function createMockBudgetDetail(categories: ynab.Category[]): ynab.BudgetDetail {
  return {
    id: 'budget-1',
    name: 'Test Budget',
    last_modified_on: new Date().toISOString(),
    first_month: '2024-01-01',
    last_month: '2024-12-01',
    date_format: {
      format: 'MM/DD/YYYY',
    },
    currency_format: {
      iso_code: 'USD',
      example_format: '123,456.78',
      decimal_digits: 2,
      decimal_separator: '.',
      symbol_first: true,
      group_separator: ',',
      currency_symbol: '$',
      display_symbol: true,
    },
    accounts: [],
    payees: [],
    payee_locations: [],
    category_groups: [],
    categories,
    months: [],
    transactions: [],
    subtransactions: [],
    scheduled_transactions: [],
    scheduled_subtransactions: [],
  };
}

function createMockCategory(id: string, name: string): ynab.Category {
  return {
    id,
    category_group_id: 'group-1',
    category_group_name: 'Test Group',
    name,
    hidden: false,
    original_category_group_id: null,
    note: null,
    budgeted: 0,
    activity: 0,
    balance: 0,
    goal_type: null,
    goal_day: null,
    goal_cadence: null,
    goal_cadence_frequency: null,
    goal_creation_month: null,
    goal_target: null,
    goal_target_month: null,
    goal_percentage_complete: null,
    goal_months_to_budget: null,
    goal_under_funded: null,
    goal_overall_funded: null,
    goal_overall_left: null,
    deleted: false,
  };
}

function createMockSpendingTrend(
  category: string,
  trend: 'increasing' | 'decreasing' | 'stable',
  significance: 'high' | 'medium' | 'low',
): SpendingTrend {
  return {
    category,
    categoryId: `cat-${category.toLowerCase()}`,
    currentPeriod: 100,
    previousPeriod: trend === 'increasing' ? 80 : trend === 'decreasing' ? 120 : 100,
    percentChange: trend === 'increasing' ? 25 : trend === 'decreasing' ? -16.7 : 0,
    trend,
    significance,
    explanation: `Test explanation for ${category}`,
    data_points: 6,
    reliability_score: 85,
  };
}

function createMockFinancialMetrics(overrides: Partial<FinancialMetrics> = {}): FinancialMetrics {
  const { emergency_fund_status: emergencyFundOverride, ...otherOverrides } = overrides;

  return {
    emergency_fund_status: {
      current_amount: 5000,
      recommended_minimum: 1000,
      status: 'adequate',
      ...emergencyFundOverride,
    },
    budget_utilization: 95,
    overspent_categories: 0,
    underfunded_categories: 0,
    debt_to_asset_ratio: 15,
    unallocated_funds: 0,
    ...otherOverrides,
  };
}

function createMockAccount(type: ynab.AccountType, balance: number): ynab.Account {
  return {
    id: `account-${Math.random()}`,
    name: 'Test Account',
    type,
    on_budget: true,
    closed: false,
    note: null,
    balance: balance * 1000, // Convert to milliunits
    cleared_balance: balance * 1000,
    uncleared_balance: 0,
    transfer_payee_id: null,
    direct_import_linked: false,
    direct_import_in_error: false,
    last_reconciled_at: null,
    debt_original_balance: null,
    debt_interest_rates: {},
    debt_minimum_payments: {},
    debt_escrow_amounts: {},
    deleted: false,
  };
}

describe('generateFinancialInsights', () => {
  const mockCategories = [
    createMockCategory('cat-1', 'Groceries'),
    createMockCategory('cat-2', 'Dining Out'),
    createMockCategory('cat-3', 'Transportation'),
  ];

  test('should generate insight for unallocated funds', () => {
    const months = [
      createMockMonthData('2024-01', [], 500), // $500 to be budgeted
    ];
    const budget = createMockBudgetDetail(mockCategories);
    const trends: SpendingTrend[] = [];

    const insights = generateFinancialInsights(months, budget, trends);

    const unallocatedInsight = insights.find(
      (insight) => insight.title === 'Unallocated Funds Available',
    );
    expect(unallocatedInsight).toBeDefined();
    expect(unallocatedInsight?.type).toBe('info');
    expect(unallocatedInsight?.description).toContain('$500.00');
    expect(unallocatedInsight?.actionable).toBe(true);
  });

  test('should generate insights for high increasing trends', () => {
    const months = [createMockMonthData('2024-01', [])];
    const budget = createMockBudgetDetail(mockCategories);
    const trends = [createMockSpendingTrend('Groceries', 'increasing', 'high')];

    const insights = generateFinancialInsights(months, budget, trends);

    const trendInsight = insights.find(
      (insight) => insight.title === 'Significant Increase in Groceries',
    );
    expect(trendInsight).toBeDefined();
    expect(trendInsight?.type).toBe('warning');
    expect(trendInsight?.impact).toBe('high');
    expect(trendInsight?.suggestions).toBeDefined();
  });

  test('should identify truly overspent categories', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -500, balance: -100 }, // Overspent
        { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 }, // Fine
      ]),
    ];
    const budget = createMockBudgetDetail(mockCategories);

    const insights = generateFinancialInsights(months, budget, []);

    const overspentInsight = insights.find(
      (insight) => insight.title === 'Truly Overspent Categories',
    );
    expect(overspentInsight).toBeDefined();
    expect(overspentInsight?.type).toBe('warning');
    expect(overspentInsight?.impact).toBe('high');
    expect(overspentInsight?.description).toContain('1 categories');
  });

  test('should identify categories that exceeded monthly budget but used accumulated funds', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -500, balance: 50 }, // Used accumulated funds
      ]),
    ];
    const budget = createMockBudgetDetail(mockCategories);

    const insights = generateFinancialInsights(months, budget, []);

    const exceededInsight = insights.find(
      (insight) => insight.title === 'Categories That Exceeded Monthly Budget Assignment',
    );
    expect(exceededInsight).toBeDefined();
    expect(exceededInsight?.type).toBe('info');
    expect(exceededInsight?.impact).toBe('low');
    expect(exceededInsight?.description).toContain('healthy YNAB behavior');
  });

  test('should filter out inflow categories from analysis', () => {
    const inflowCategories = [
      createMockCategory('inflow-1', 'Inflow: Ready to Assign'),
      createMockCategory('cat-1', 'Regular Category'),
    ];
    const months = [
      createMockMonthData('2024-01', [
        { id: 'inflow-1', budgeted: 0, activity: 1000, balance: 1000 },
        { id: 'cat-1', budgeted: 400, activity: -500, balance: 50 },
      ]),
    ];
    const budget = createMockBudgetDetail(inflowCategories);

    const insights = generateFinancialInsights(months, budget, []);

    // Should not include inflow categories in exceeded budget analysis
    const exceededInsight = insights.find(
      (insight) => insight.title === 'Categories That Exceeded Monthly Budget Assignment',
    );
    expect(exceededInsight?.description).toContain('1 categories'); // Only regular category
  });
});

describe('generateBudgetOptimizationInsights', () => {
  test('should identify consistently under-spent categories', () => {
    const months = [createMockMonthData('2024-01', [])];
    const trends = [createMockSpendingTrend('Utilities', 'decreasing', 'high')];
    trends[0].reliability_score = 75; // High reliability
    trends[0].data_points = 5; // Sufficient data

    const budget = createMockBudgetDetail([]);

    const insights = generateBudgetOptimizationInsights(months, trends, budget);

    const underSpentInsight = insights.find(
      (insight) => insight.title === 'Consistently Under-Spent Categories (Historical Pattern)',
    );
    expect(underSpentInsight).toBeDefined();
    expect(underSpentInsight?.type).toBe('success');
    expect(underSpentInsight?.category).toBe('efficiency');
  });

  test('should identify large unused balances', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 200, activity: -50, balance: 500 }, // Large unused balance
        { id: 'cat-2', budgeted: 100, activity: -90, balance: 10 }, // Normal
      ]),
    ];
    const budget = createMockBudgetDetail([
      createMockCategory('cat-1', 'Emergency Fund'),
      createMockCategory('cat-2', 'Regular Category'),
    ]);

    const insights = generateBudgetOptimizationInsights(months, [], budget);

    const unusedBalanceInsight = insights.find(
      (insight) => insight.title === 'Large Unused Category Balances',
    );
    expect(unusedBalanceInsight).toBeDefined();
    expect(unusedBalanceInsight?.type).toBe('recommendation');
    expect(unusedBalanceInsight?.description).toContain('$500.00');
  });

  test('should handle empty current month gracefully', () => {
    const insights = generateBudgetOptimizationInsights([], [], createMockBudgetDetail([]));
    expect(insights).toHaveLength(0);
  });
});

describe('Health Scoring Functions', () => {
  describe('calculateOverallHealthScore', () => {
    test('should calculate weighted average correctly', () => {
      const metrics = createMockFinancialMetrics({
        overspent_categories: 0,
        underfunded_categories: 0,
        emergency_fund_status: { current_amount: 10000 },
        debt_to_asset_ratio: 10,
        budget_utilization: 90,
        unallocated_funds: 100,
      });

      const score = calculateOverallHealthScore(metrics);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThan(80); // Should be high with good metrics
    });

    test('should handle poor financial health', () => {
      const metrics = createMockFinancialMetrics({
        overspent_categories: 5,
        underfunded_categories: 3,
        emergency_fund_status: { current_amount: 500 },
        debt_to_asset_ratio: 70,
        budget_utilization: 120,
        unallocated_funds: -500,
      });

      const score = calculateOverallHealthScore(metrics);
      expect(score).toBeLessThan(50); // Should be low with poor metrics
    });
  });

  describe('calculateSpendingScore', () => {
    test('should penalize overspent categories exponentially', () => {
      const noOverspendingScore = calculateSpendingScore({
        overspent_categories: 0,
      } as FinancialMetrics);
      const oneOverspentScore = calculateSpendingScore({
        overspent_categories: 1,
      } as FinancialMetrics);
      const threeOverspentScore = calculateSpendingScore({
        overspent_categories: 3,
      } as FinancialMetrics);

      expect(noOverspendingScore).toBe(100);
      expect(oneOverspentScore).toBeLessThan(noOverspendingScore);
      expect(threeOverspentScore).toBeLessThan(oneOverspentScore);

      // Should be exponential penalty
      const oneDecrease = noOverspendingScore - oneOverspentScore;
      const threeDecrease = noOverspendingScore - threeOverspentScore;
      expect(threeDecrease).toBeGreaterThan(oneDecrease * 2);
    });

    test('should penalize underfunded categories', () => {
      const noUnderfundedScore = calculateSpendingScore({
        underfunded_categories: 0,
      } as FinancialMetrics);
      const underfundedScore = calculateSpendingScore({
        underfunded_categories: 2,
      } as FinancialMetrics);

      expect(underfundedScore).toBeLessThan(noUnderfundedScore);
      expect(underfundedScore).toBe(92); // 100 - (2 * 4)
    });
  });

  describe('calculateDebtScore', () => {
    test('should score debt ratios correctly', () => {
      const lowDebtScore = calculateDebtScore({ debt_to_asset_ratio: 10 } as FinancialMetrics);
      const mediumDebtScore = calculateDebtScore({ debt_to_asset_ratio: 30 } as FinancialMetrics);
      const highDebtScore = calculateDebtScore({ debt_to_asset_ratio: 70 } as FinancialMetrics);

      expect(lowDebtScore).toBe(100); // Under 20% is healthy
      expect(mediumDebtScore).toBe(90); // 20-40% gets 10 point penalty
      expect(highDebtScore).toBe(60); // Over 60% gets 40 point penalty
    });

    test('should handle zero debt', () => {
      const score = calculateDebtScore({ debt_to_asset_ratio: 0 } as FinancialMetrics);
      expect(score).toBe(100);
    });
  });

  describe('calculateEmergencyFundScore', () => {
    test('should score emergency fund amounts correctly', () => {
      const noFundScore = calculateEmergencyFundScore({
        emergency_fund_status: { current_amount: 500 },
      } as FinancialMetrics);

      const basicFundScore = calculateEmergencyFundScore({
        emergency_fund_status: { current_amount: 1500 },
      } as FinancialMetrics);

      const goodFundScore = calculateEmergencyFundScore({
        emergency_fund_status: { current_amount: 10000 },
      } as FinancialMetrics);

      const excellentFundScore = calculateEmergencyFundScore({
        emergency_fund_status: { current_amount: 20000 },
      } as FinancialMetrics);

      expect(noFundScore).toBe(20); // Under $1000
      expect(basicFundScore).toBe(50); // $1000-2500
      expect(goodFundScore).toBe(85); // $7500-15000
      expect(excellentFundScore).toBe(100); // Over $15000
    });
  });

  describe('calculateBudgetDisciplineScore', () => {
    test('should penalize over-budget spending', () => {
      const perfectScore = calculateBudgetDisciplineScore({
        budget_utilization: 90,
        unallocated_funds: 0,
      } as FinancialMetrics);

      const overBudgetScore = calculateBudgetDisciplineScore({
        budget_utilization: 110,
        unallocated_funds: 0,
      } as FinancialMetrics);

      expect(perfectScore).toBe(100);
      expect(overBudgetScore).toBe(70); // 30 point penalty for significantly over
    });

    test('should penalize negative unallocated funds', () => {
      const positiveScore = calculateBudgetDisciplineScore({
        budget_utilization: 90,
        unallocated_funds: 100,
      } as FinancialMetrics);

      const negativeScore = calculateBudgetDisciplineScore({
        budget_utilization: 90,
        unallocated_funds: -300,
      } as FinancialMetrics);

      expect(negativeScore).toBeLessThan(positiveScore);
      expect(negativeScore).toBe(85); // 15 point penalty for large negative
    });
  });
});

describe('Helper Functions', () => {
  describe('calculateEmergencyFundStatus', () => {
    test('should calculate savings balance correctly', () => {
      const accounts = [
        createMockAccount(ynab.AccountType.Checking, 2000),
        createMockAccount(ynab.AccountType.Savings, 5000),
        createMockAccount(ynab.AccountType.Savings, 3000),
        createMockAccount(ynab.AccountType.CreditCard, -500),
      ];

      const status = calculateEmergencyFundStatus(accounts);

      expect(status.current_amount).toBe(8000); // 5000 + 3000
      expect(status.recommended_minimum).toBe(1000);
      expect(status.status).toBe('adequate');
    });

    test('should mark insufficient funds', () => {
      const accounts = [createMockAccount(ynab.AccountType.Savings, 500)];

      const status = calculateEmergencyFundStatus(accounts);
      expect(status.status).toBe('needs_improvement');
    });
  });

  describe('calculateDebtToAssetRatio', () => {
    test('should calculate ratio correctly', () => {
      const accounts = [
        createMockAccount(ynab.AccountType.Checking, 5000), // Asset
        createMockAccount(ynab.AccountType.Savings, 10000), // Asset
        createMockAccount(ynab.AccountType.CreditCard, -2000), // Debt
        createMockAccount(ynab.AccountType.OtherLiability, -3000), // Debt
      ];

      const ratio = calculateDebtToAssetRatio(accounts);

      // Assets: 15000, Debt: 5000, Ratio: 5000/15000 = 33.33%
      expect(ratio).toBeCloseTo(33.33, 1);
    });

    test('should handle zero assets', () => {
      const accounts = [createMockAccount(ynab.AccountType.CreditCard, -1000)];

      const ratio = calculateDebtToAssetRatio(accounts);
      expect(ratio).toBe(0);
    });
  });
});

describe('Health Explanations and Recommendations', () => {
  describe('getHealthScoreExplanation', () => {
    test('should provide appropriate explanations for different score ranges', () => {
      const excellentExplanation = getHealthScoreExplanation(95);
      const goodExplanation = getHealthScoreExplanation(80);
      const fairExplanation = getHealthScoreExplanation(65);
      const poorExplanation = getHealthScoreExplanation(45);
      const criticalExplanation = getHealthScoreExplanation(25);

      expect(excellentExplanation).toContain('Excellent');
      expect(goodExplanation).toContain('Good');
      expect(fairExplanation).toContain('Fair');
      expect(poorExplanation).toContain('Poor');
      expect(criticalExplanation).toContain('Critical');
    });

    test('should identify weakest area when sub-scores provided', () => {
      const subScores: HealthSubScores = {
        spending_health: 90,
        debt_health: 85,
        emergency_fund_health: 45, // Weakest
        budget_discipline: 80,
      };

      const explanation = getHealthScoreExplanation(75, subScores);
      expect(explanation).toContain('emergency fund');
    });
  });

  describe('generateHealthRecommendations', () => {
    test('should prioritize recommendations by lowest sub-scores', () => {
      const metrics = createMockFinancialMetrics({
        overspent_categories: 3,
        emergency_fund_status: { current_amount: 500 },
        debt_to_asset_ratio: 50,
      });

      const subScores: HealthSubScores = {
        spending_health: 40, // Lowest - should be first
        debt_health: 50,
        emergency_fund_health: 60,
        budget_discipline: 80,
      };

      const recommendations = generateHealthRecommendations(metrics, subScores);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('overspent categories'); // Spending health first
    });

    test('should include positive reinforcement for high-performing areas', () => {
      const metrics = createMockFinancialMetrics();
      const subScores: HealthSubScores = {
        spending_health: 60,
        debt_health: 90, // Highest - should get positive reinforcement
        emergency_fund_health: 70,
        budget_discipline: 75,
      };

      const recommendations = generateHealthRecommendations(metrics, subScores);

      const positiveRecommendation = recommendations.find((rec) => rec.includes('✅'));
      expect(positiveRecommendation).toBeDefined();
      expect(positiveRecommendation).toContain('Strong debt performance');
    });

    test('should limit recommendations to 5', () => {
      const metrics = createMockFinancialMetrics({
        overspent_categories: 5,
        underfunded_categories: 3,
        emergency_fund_status: { current_amount: 200 },
        debt_to_asset_ratio: 80,
        budget_utilization: 150,
        unallocated_funds: -1000,
      });

      const subScores: HealthSubScores = {
        spending_health: 20,
        debt_health: 30,
        emergency_fund_health: 25,
        budget_discipline: 35,
      };

      const recommendations = generateHealthRecommendations(metrics, subScores);
      expect(recommendations.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('Integration Tests', () => {
  test('should handle comprehensive financial analysis', () => {
    const months = [
      createMockMonthData(
        '2024-01',
        [
          { id: 'housing', budgeted: 2000, activity: -1950, balance: 50 },
          { id: 'food', budgeted: 600, activity: -650, balance: -50 }, // Overspent
          { id: 'transport', budgeted: 400, activity: -250, balance: 150 },
        ],
        200,
      ), // $200 to be budgeted
    ];

    const budget = createMockBudgetDetail([
      createMockCategory('housing', 'Housing'),
      createMockCategory('food', 'Food'),
      createMockCategory('transport', 'Transportation'),
    ]);

    const trends = [
      createMockSpendingTrend('Food', 'increasing', 'high'),
      createMockSpendingTrend('Transportation', 'decreasing', 'high'),
    ];

    const insights = generateFinancialInsights(months, budget, trends);

    // Should generate multiple types of insights
    const insightTypes = insights.map((i) => i.type);
    expect(insightTypes).toContain('info'); // Unallocated funds
    expect(insightTypes).toContain('warning'); // Overspent and increasing trend
    expect(insightTypes).toContain('success'); // Under-spent transportation

    // Should be actionable
    const actionableInsights = insights.filter((i) => i.actionable);
    expect(actionableInsights.length).toBeGreaterThan(0);
  });
});
