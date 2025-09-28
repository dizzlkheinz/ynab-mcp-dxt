import { describe, expect, test, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import {
  formatCurrency,
  calculateBudgetUtilization,
  formatAccountBalances,
  formatSpendingTrends,
  formatHealthMetrics,
  formatInsights,
  buildFinancialOverviewResponse,
  buildSpendingAnalysisResponse,
  buildBudgetHealthResponse,
  performDetailedSpendingAnalysis,
  performBudgetHealthCheck,
} from '../../financialOverview/formatter.js';
import type {
  SpendingTrend,
  BudgetInsight,
  HealthSubScores,
  MonthData,
} from '../../financialOverview/schemas.js';

// Mock the responseFormatter
vi.mock('../../../server/responseFormatter.js', () => ({
  responseFormatter: {
    format: vi.fn((data) => JSON.stringify(data, null, 2)),
  },
}));

// Mock data factories
function createMockAccountBalances() {
  return {
    liquidNetWorth: 10000,
    liquidAssets: 12000,
    totalDebt: 2000,
    totalNetWorth: 50000,
    totalAssets: 75000,
    totalLiabilities: 25000,
    checkingBalance: 2000,
    savingsBalance: 10000,
    creditCardBalance: -500,
    investmentBalance: 40000,
    realEstateBalance: 200000,
    mortgageBalance: -150000,
    otherAssetBalance: 5000,
    otherLiabilityBalance: -3000,
  };
}

function createMockSpendingTrend(category: string): SpendingTrend {
  return {
    category,
    categoryId: `cat-${category.toLowerCase()}`,
    currentPeriod: 400,
    previousPeriod: 350,
    percentChange: 14.3,
    trend: 'increasing',
    significance: 'medium',
    explanation: `Spending in ${category} has increased moderately`,
    data_points: 6,
    reliability_score: 80,
  };
}

function createMockBudgetInsight(): BudgetInsight {
  return {
    type: 'warning',
    category: 'spending',
    title: 'Test Insight',
    description: 'This is a test insight description',
    impact: 'medium',
    actionable: true,
    suggestions: ['Review your spending', 'Adjust budget allocation'],
  };
}

function createMockHealthSubScores(): HealthSubScores {
  return {
    spending_health: 85,
    debt_health: 90,
    emergency_fund_health: 75,
    budget_discipline: 80,
  };
}

function createMockMonthDetail(): ynab.MonthDetail {
  return {
    month: '2024-01-01',
    note: null,
    income: 5000000, // $5000 in milliunits
    budgeted: 4500000, // $4500 in milliunits
    activity: -4200000, // -$4200 in milliunits
    to_be_budgeted: 300000, // $300 in milliunits
    age_of_money: 15,
    deleted: false,
    categories: [
      {
        id: 'cat-1',
        category_group_id: 'group-1',
        category_group_name: 'Monthly Bills',
        name: 'Rent',
        hidden: false,
        original_category_group_id: null,
        note: null,
        budgeted: 2000000, // $2000
        activity: -2000000, // -$2000
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
      },
    ],
  };
}

function createMockMonthData(
  month: string,
  categories: { id: string; budgeted: number; activity: number; balance: number }[],
): MonthData {
  return {
    data: {
      month: {
        month,
        to_be_budgeted: 0,
        categories: categories.map((cat) => ({
          id: cat.id,
          budgeted: cat.budgeted * 1000, // Convert to milliunits
          activity: cat.activity * 1000,
          balance: cat.balance * 1000,
        })),
      },
    },
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

describe('formatCurrency', () => {
  test('should format positive amounts correctly', () => {
    expect(formatCurrency(1000000)).toBe('1000.00'); // $1000 in milliunits
    expect(formatCurrency(500000)).toBe('500.00'); // $500 in milliunits
    expect(formatCurrency(1)).toBe('0.00'); // $0.001 rounds to $0.00
  });

  test('should format negative amounts correctly', () => {
    expect(formatCurrency(-1000000)).toBe('-1000.00');
    expect(formatCurrency(-500000)).toBe('-500.00');
  });

  test('should handle zero amount', () => {
    expect(formatCurrency(0)).toBe('0.00');
  });

  test('should handle very large amounts', () => {
    expect(formatCurrency(1000000000)).toBe('1000000.00'); // $1M
  });
});

describe('calculateBudgetUtilization', () => {
  test('should calculate utilization correctly', () => {
    const month = createMockMonthDetail();
    month.budgeted = 4000000; // $4000
    month.activity = -3600000; // -$3600

    const utilization = calculateBudgetUtilization(month);
    expect(utilization).toBe(90); // 3600/4000 * 100
  });

  test('should handle zero budget', () => {
    const month = createMockMonthDetail();
    month.budgeted = 0;
    month.activity = -1000000;

    const utilization = calculateBudgetUtilization(month);
    expect(utilization).toBe(0);
  });

  test('should handle positive activity (income)', () => {
    const month = createMockMonthDetail();
    month.budgeted = 4000000;
    month.activity = 500000; // Income

    const utilization = calculateBudgetUtilization(month);
    expect(utilization).toBe(12.5); // 500/4000 * 100
  });
});

describe('formatAccountBalances', () => {
  test('should format account balances correctly', () => {
    const balances = createMockAccountBalances();
    const formatted = formatAccountBalances(balances);

    expect(formatted.checking_balance).toBe(2000);
    expect(formatted.savings_balance).toBe(10000);
    expect(formatted.credit_card_balance).toBe(-500);
    expect(formatted.investment_balance).toBe(40000);
    expect(formatted.real_estate_balance).toBe(200000);
    expect(formatted.mortgage_balance).toBe(-150000);
  });

  test('should include placeholder values for account counts', () => {
    const balances = createMockAccountBalances();
    const formatted = formatAccountBalances(balances, 0, 0);

    expect(formatted.total_accounts).toBe(0); // Placeholder
    expect(formatted.on_budget_accounts).toBe(0); // Placeholder
  });
});

describe('formatSpendingTrends', () => {
  test('should format trends with metadata', () => {
    const trends = [createMockSpendingTrend('Groceries'), createMockSpendingTrend('Dining Out')];

    const formatted = formatSpendingTrends(trends);

    expect(formatted.analysis_method).toContain('Statistical anomaly detection');
    expect(formatted.explanation).toContain('Z-score anomaly detection');
    expect(formatted.confidence_levels).toHaveProperty('high');
    expect(formatted.confidence_levels).toHaveProperty('medium');
    expect(formatted.confidence_levels).toHaveProperty('low');
    expect(formatted.trends).toHaveLength(2);
    expect(formatted.trends[0].category).toBe('Groceries');
  });
});

describe('formatHealthMetrics', () => {
  test('should format health metrics correctly', () => {
    const subScores = createMockHealthSubScores();
    const recommendations = ['Test recommendation 1', 'Test recommendation 2'];
    const analysisDate = 'January 2024';

    const formatted = formatHealthMetrics(
      85,
      subScores,
      'Good financial health',
      recommendations,
      analysisDate,
    );

    expect(formatted.analysis_period).toBe(analysisDate);
    expect(formatted.health_score).toBe(85);
    expect(formatted.sub_scores).toEqual(subScores);
    expect(formatted.score_explanation).toBe('Good financial health');
    expect(formatted.recommendations).toEqual(recommendations);
    expect(formatted.last_assessment).toBeDefined();
    expect(new Date(formatted.last_assessment)).toBeInstanceOf(Date);
  });
});

describe('formatInsights', () => {
  test('should ensure all insights have suggestions array', () => {
    const insights = [
      createMockBudgetInsight(),
      { ...createMockBudgetInsight(), suggestions: undefined },
    ];

    const formatted = formatInsights(insights);

    expect(formatted).toHaveLength(2);
    expect(formatted[0].suggestions).toEqual(['Review your spending', 'Adjust budget allocation']);
    expect(formatted[1].suggestions).toEqual([]); // Should add empty array
  });

  test('should preserve existing insight properties', () => {
    const insight = createMockBudgetInsight();
    const formatted = formatInsights([insight]);

    expect(formatted[0].type).toBe(insight.type);
    expect(formatted[0].category).toBe(insight.category);
    expect(formatted[0].title).toBe(insight.title);
    expect(formatted[0].description).toBe(insight.description);
    expect(formatted[0].impact).toBe(insight.impact);
    expect(formatted[0].actionable).toBe(insight.actionable);
  });
});

describe('Response Building Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildFinancialOverviewResponse', () => {
    test('should build complete response structure', () => {
      const data = {
        overview: { budgetName: 'Test Budget' },
        summary: { period: '3 months' },
        current_month: { month: '2024-01' },
        account_overview: { total_accounts: 5 },
        category_performance: [{ category_name: 'Test' }],
        net_worth_trend: { direction: 'increasing' },
        spending_trends: { trends: [] },
        insights: [createMockBudgetInsight()],
      };

      const response = buildFinancialOverviewResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toBeDefined();
    });

    test('should handle cached response', () => {
      const data = {
        overview: {},
        summary: {},
        current_month: null,
        account_overview: {},
        category_performance: [],
        net_worth_trend: {},
        spending_trends: {},
        insights: [],
        cached: true,
      };

      const response = buildFinancialOverviewResponse(data);
      expect(response.content[0].text).toContain('"cached": true');
    });
  });

  describe('buildSpendingAnalysisResponse', () => {
    test('should build spending analysis response', () => {
      const analysis = {
        analysis_period: 'January 2024 - June 2024 (6 months)',
        category_analysis: [
          {
            category_name: 'Groceries',
            total_spent: 2400,
            average_monthly: 400,
          },
        ],
        balance_insights: {
          top_unused_balances: [],
          under_budgeted_categories: [],
        },
      };

      const response = buildSpendingAnalysisResponse(analysis);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('analysis_period');
    });
  });

  describe('buildBudgetHealthResponse', () => {
    test('should build health check response', () => {
      const healthCheck = {
        analysis_period: 'January 2024',
        health_score: 85,
        sub_scores: createMockHealthSubScores(),
        score_explanation: 'Good financial health',
        metrics: {
          budget_utilization: 95,
          overspent_categories: 1,
        },
        recommendations: ['Test recommendation'],
        last_assessment: new Date().toISOString(),
      };

      const response = buildBudgetHealthResponse(healthCheck);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('health_score');
    });
  });
});

describe('Analysis Functions', () => {
  describe('performDetailedSpendingAnalysis', () => {
    test('should analyze spending patterns correctly', () => {
      const months = [
        createMockMonthData('2024-01', [
          { id: 'cat-1', budgeted: 400, activity: -350, balance: 50 },
          { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 },
        ]),
        createMockMonthData('2024-02', [
          { id: 'cat-1', budgeted: 400, activity: -420, balance: 30 },
          { id: 'cat-2', budgeted: 200, activity: -150, balance: 50 },
        ]),
        createMockMonthData('2024-03', [
          { id: 'cat-1', budgeted: 400, activity: -380, balance: 50 },
          { id: 'cat-2', budgeted: 200, activity: -190, balance: 30 },
        ]),
      ];

      const categories = [
        createMockCategory('cat-1', 'Groceries'),
        createMockCategory('cat-2', 'Dining Out'),
      ];

      const analysis = performDetailedSpendingAnalysis(months, categories);

      expect(analysis.analysis_period).toContain('3 months');
      expect(analysis.category_analysis).toHaveLength(2);

      const groceries = analysis.category_analysis.find((cat) => cat.category_name === 'Groceries');
      expect(groceries).toBeDefined();
      expect(groceries?.total_budgeted).toBe(1200); // 400 * 3
      expect(groceries?.total_spent).toBe(1150); // 350 + 420 + 380
      expect(groceries?.average_monthly).toBeCloseTo(383.33, 1);
    });

    test('should filter categories by ID when specified', () => {
      const months = [
        createMockMonthData('2024-01', [
          { id: 'cat-1', budgeted: 400, activity: -350, balance: 50 },
          { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 },
        ]),
      ];

      const categories = [
        createMockCategory('cat-1', 'Groceries'),
        createMockCategory('cat-2', 'Dining Out'),
      ];

      const analysis = performDetailedSpendingAnalysis(months, categories, 'cat-1');

      expect(analysis.category_analysis).toHaveLength(1);
      expect(analysis.category_analysis[0].category_name).toBe('Groceries');
    });

    test('should calculate variability correctly', () => {
      const months = [
        createMockMonthData('2024-01', [
          { id: 'cat-1', budgeted: 400, activity: -100, balance: 300 }, // Low spending
        ]),
        createMockMonthData('2024-02', [
          { id: 'cat-1', budgeted: 400, activity: -500, balance: -100 }, // High spending
        ]),
        createMockMonthData('2024-03', [
          { id: 'cat-1', budgeted: 400, activity: -300, balance: 100 }, // Medium spending
        ]),
      ];

      const categories = [createMockCategory('cat-1', 'Variable Category')];
      const analysis = performDetailedSpendingAnalysis(months, categories);

      const category = analysis.category_analysis[0];
      expect(category.variability).toBeGreaterThan(30); // Should have high variability
      expect(category.max_monthly).toBe(500);
      expect(category.min_monthly).toBe(100);
    });

    test('should identify unused balances and under-budgeted categories', () => {
      const months = [
        createMockMonthData('2024-01', [
          { id: 'cat-1', budgeted: 400, activity: -50, balance: 500 }, // Large unused balance
          { id: 'cat-2', budgeted: 200, activity: -250, balance: -50 }, // Under-budgeted
        ]),
      ];

      const categories = [
        createMockCategory('cat-1', 'Emergency Fund'),
        createMockCategory('cat-2', 'Groceries'),
      ];

      const analysis = performDetailedSpendingAnalysis(months, categories);

      expect(analysis.balance_insights.top_unused_balances).toHaveLength(1);
      expect(analysis.balance_insights.top_unused_balances[0].category_name).toBe('Emergency Fund');
      expect(analysis.balance_insights.top_unused_balances[0].unused_balance).toBe(500);

      expect(analysis.balance_insights.under_budgeted_categories).toHaveLength(1);
      expect(analysis.balance_insights.under_budgeted_categories[0].category_name).toBe(
        'Groceries',
      );
      expect(analysis.balance_insights.under_budgeted_categories[0].shortage).toBe(50);
    });
  });

  describe('performBudgetHealthCheck', () => {
    test('should return formatted health check with all parameters', () => {
      const mockBudget: ynab.BudgetDetail = {
        id: 'budget-1',
        name: 'Test Budget',
        last_modified_on: new Date().toISOString(),
        first_month: '2024-01-01',
        last_month: '2024-12-01',
        date_format: { format: 'MM/DD/YYYY' },
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
        categories: [],
        months: [],
        transactions: [],
        subtransactions: [],
        scheduled_transactions: [],
        scheduled_subtransactions: [],
      };

      const month = createMockMonthDetail();
      const metrics = { budget_utilization: 95 };
      const subScores = createMockHealthSubScores();

      const result = performBudgetHealthCheck(
        mockBudget,
        month,
        true,
        'January 2024',
        metrics,
        85,
        subScores,
        'Good health',
        ['Test recommendation'],
      );

      expect(result.analysis_period).toBe('January 2024');
      expect(result.health_score).toBe(85);
      expect(result.sub_scores).toEqual(subScores);
      expect(result.score_explanation).toBe('Good health');
      expect(result.metrics).toEqual(metrics);
      expect(result.recommendations).toEqual(['Test recommendation']);
      expect(result.last_assessment).toBeDefined();
    });

    test('should exclude recommendations when not requested', () => {
      const mockBudget = {} as ynab.BudgetDetail;
      const month = createMockMonthDetail();

      const result = performBudgetHealthCheck(
        mockBudget,
        month,
        false, // Don't include recommendations
      );

      expect(result.recommendations).toEqual([]);
    });

    test('should use default analysis period when not provided', () => {
      const mockBudget = {} as ynab.BudgetDetail;
      const month = createMockMonthDetail();

      const result = performBudgetHealthCheck(mockBudget, month, true);

      expect(result.analysis_period).toMatch(/\w+ \d{4}/); // Should be a month and year
    });
  });
});

describe('Error Handling and Edge Cases', () => {
  test('should handle empty data gracefully', () => {
    const emptyTrends = formatSpendingTrends([]);
    expect(emptyTrends.trends).toHaveLength(0);

    const emptyInsights = formatInsights([]);
    expect(emptyInsights).toHaveLength(0);

    const emptyAnalysis = performDetailedSpendingAnalysis([], []);
    expect(emptyAnalysis.category_analysis).toHaveLength(0);
  });

  test('should handle missing optional data', () => {
    const partialData = {
      overview: {},
      summary: {},
      current_month: null,
      account_overview: {},
      category_performance: [],
      net_worth_trend: {},
      spending_trends: {},
      insights: [],
    };

    const response = buildFinancialOverviewResponse(partialData);
    expect(response.content[0].text).toContain('"current_month": null');
  });
});

describe('Backward Compatibility', () => {
  test('should maintain response structure compatibility', () => {
    const data = {
      overview: { budgetName: 'Test' },
      summary: { period: '3 months' },
      current_month: { month: '2024-01' },
      account_overview: { total_accounts: 5 },
      category_performance: [],
      net_worth_trend: { direction: 'stable' },
      spending_trends: { trends: [] },
      insights: [],
    };

    const response = buildFinancialOverviewResponse(data);
    const parsedResponse = JSON.parse(response.content[0].text);

    // Verify key structure elements exist
    expect(parsedResponse).toHaveProperty('overview');
    expect(parsedResponse).toHaveProperty('summary');
    expect(parsedResponse).toHaveProperty('current_month');
    expect(parsedResponse).toHaveProperty('account_overview');
    expect(parsedResponse).toHaveProperty('category_performance');
    expect(parsedResponse).toHaveProperty('net_worth_trend');
    expect(parsedResponse).toHaveProperty('spending_trends');
    expect(parsedResponse).toHaveProperty('insights');
  });
});
