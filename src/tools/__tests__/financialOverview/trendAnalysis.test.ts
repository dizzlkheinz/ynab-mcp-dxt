import { describe, expect, test } from 'vitest';
import * as ynab from 'ynab';
import {
  calculateAccountBalances,
  analyzeCategoryPerformance,
  calculateNetWorthTrend,
  analyzeSpendingTrends,
  calculateConsistencyScore,
  calculateScoreConfidence,
} from '../../financialOverview/trendAnalysis.js';
import type { MonthData } from '../../financialOverview/schemas.js';

// Mock data factories
function createMockAccount(
  type: ynab.AccountType,
  balance: number,
  name: string = 'Test Account',
  onBudget: boolean = true,
): ynab.Account {
  return {
    id: `account-${Math.random()}`,
    name,
    type,
    on_budget: onBudget,
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

function createMockMonthData(
  month: string,
  categories: { id: string; budgeted: number; activity: number; balance: number }[],
  toBeBudgeted: number = 0,
): MonthData {
  return {
    data: {
      month: {
        month,
        to_be_budgeted: toBeBudgeted,
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

describe('calculateAccountBalances', () => {
  test('should calculate basic account balances correctly', () => {
    const accounts = [
      createMockAccount(ynab.AccountType.Checking, 1000),
      createMockAccount(ynab.AccountType.Savings, 5000),
      createMockAccount(ynab.AccountType.CreditCard, -500),
    ];

    const result = calculateAccountBalances(accounts);

    expect(result.liquidNetWorth).toBe(5500); // 1000 + 5000 + (-500)
    expect(result.liquidAssets).toBe(6000); // 1000 + 5000
    expect(result.checkingBalance).toBe(1000);
    expect(result.savingsBalance).toBe(5000);
    expect(result.creditCardBalance).toBe(-500);
    expect(result.totalDebt).toBe(500);
  });

  test('should handle different account types correctly', () => {
    const accounts = [
      createMockAccount(ynab.AccountType.OtherAsset, 150000, 'House Property'),
      createMockAccount(ynab.AccountType.Mortgage, -120000),
      createMockAccount(ynab.AccountType.OtherAsset, 25000, 'Investment Account'),
    ];

    const result = calculateAccountBalances(accounts);

    expect(result.realEstateBalance).toBe(150000);
    expect(result.mortgageBalance).toBe(-120000);
    expect(result.investmentBalance).toBe(25000);
    expect(result.totalNetWorth).toBe(55000); // 175000 - 120000
  });

  test('should distinguish between on-budget and off-budget accounts', () => {
    const accounts = [
      createMockAccount(ynab.AccountType.Checking, 1000, 'On-Budget Checking', true),
      createMockAccount(ynab.AccountType.OtherAsset, 50000, 'Off-Budget Investment', false),
    ];

    const result = calculateAccountBalances(accounts);

    expect(result.liquidNetWorth).toBe(1000); // Only on-budget
    expect(result.totalNetWorth).toBe(51000); // All accounts
  });

  test('should handle empty account array', () => {
    const result = calculateAccountBalances([]);

    expect(result.liquidNetWorth).toBe(0);
    expect(result.totalNetWorth).toBe(0);
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
  });

  test('should calculate assets and liabilities correctly', () => {
    const accounts = [
      createMockAccount(ynab.AccountType.Checking, 2000),
      createMockAccount(ynab.AccountType.CreditCard, -1500),
      createMockAccount(ynab.AccountType.OtherAsset, 10000),
      createMockAccount(ynab.AccountType.OtherLiability, -3000),
    ];

    const result = calculateAccountBalances(accounts);

    expect(result.totalAssets).toBe(12000); // 2000 + 10000
    expect(result.totalLiabilities).toBe(4500); // 1500 + 3000
    expect(result.totalNetWorth).toBe(7500); // 12000 - 4500
  });
});

describe('analyzeCategoryPerformance', () => {
  const mockCategories = [
    createMockCategory('cat-1', 'Groceries'),
    createMockCategory('cat-2', 'Dining Out'),
    createMockCategory('cat-3', 'Inflow: Ready to Assign'), // Should be filtered out
  ];

  test('should analyze category performance across months', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -350, balance: 50 },
        { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 },
      ]),
      createMockMonthData('2024-02', [
        { id: 'cat-1', budgeted: 400, activity: -420, balance: 30 },
        { id: 'cat-2', budgeted: 200, activity: -150, balance: 50 },
      ]),
    ];

    const result = analyzeCategoryPerformance(months, mockCategories);

    expect(result).toHaveLength(2); // Should exclude inflow category

    const groceries = result.find((cat) => cat.category_name === 'Groceries');
    expect(groceries).toBeDefined();
    expect(groceries?.average_budgeted).toBe(400);
    expect(groceries?.average_spent).toBe(385); // (350 + 420) / 2
    expect(groceries?.utilization_rate).toBeCloseTo(96.25); // 385/400 * 100
  });

  test('should filter out inflow categories', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -350, balance: 50 },
        { id: 'cat-3', budgeted: 0, activity: 1000, balance: 1000 },
      ]),
    ];

    const result = analyzeCategoryPerformance(months, mockCategories);

    expect(result).toHaveLength(1);
    expect(result[0].category_name).toBe('Groceries');
  });

  test('should handle missing category data gracefully', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -350, balance: 50 },
        // cat-2 missing
      ]),
    ];

    const result = analyzeCategoryPerformance(months, mockCategories);

    const diningOut = result.find((cat) => cat.category_name === 'Dining Out');
    expect(diningOut?.average_budgeted).toBe(0);
    expect(diningOut?.average_spent).toBe(0);
  });
});

describe('calculateNetWorthTrend', () => {
  const mockAccountBalances = {
    liquidNetWorth: 10000,
    totalNetWorth: 50000,
    liquidAssets: 12000,
    totalAssets: 75000,
    totalLiabilities: 25000,
    totalDebt: 5000,
    checkingBalance: 2000,
    savingsBalance: 10000,
    creditCardBalance: -500,
    investmentBalance: 40000,
    realEstateBalance: 0,
    mortgageBalance: 0,
    otherAssetBalance: 0,
    otherLiabilityBalance: 0,
  };

  test('should calculate net worth trend progression', () => {
    const months = [
      createMockMonthData('2024-01', []),
      createMockMonthData('2024-02', []),
      createMockMonthData('2024-03', []),
    ];

    const result = calculateNetWorthTrend(months, mockAccountBalances);

    expect(result.direction).toBeOneOf(['increasing', 'decreasing', 'stable']);
    expect(result.monthly_values).toHaveLength(3);
    expect(result.analysis).toContain('Net worth has');
  });

  test('should handle empty months array', () => {
    const result = calculateNetWorthTrend([], mockAccountBalances);

    expect(result.direction).toBe('stable');
    expect(result.change_amount).toBe(0);
    expect(result.change_percentage).toBe(0);
    expect(result.monthly_values).toHaveLength(0);
    expect(result.analysis).toBe('Insufficient data to calculate net worth trend');
  });

  test('should calculate direction correctly', () => {
    const months = [createMockMonthData('2024-01', []), createMockMonthData('2024-02', [])];

    const result = calculateNetWorthTrend(months, mockAccountBalances);

    // With simplified implementation, last value should be higher than first
    expect(result.change_amount).toBeGreaterThan(0);
    expect(result.direction).toBe('increasing');
  });
});

describe('analyzeSpendingTrends', () => {
  const mockCategories = [
    createMockCategory('cat-1', 'Groceries'),
    createMockCategory('cat-2', 'Dining Out'),
    createMockCategory('cat-3', 'Utilities'),
  ];

  test('should detect significant spending trends', () => {
    // Create data with clear increasing trend in groceries
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -300, balance: 100 },
        { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 },
      ]),
      createMockMonthData('2024-02', [
        { id: 'cat-1', budgeted: 400, activity: -320, balance: 80 },
        { id: 'cat-2', budgeted: 200, activity: -190, balance: 10 },
      ]),
      createMockMonthData('2024-03', [
        { id: 'cat-1', budgeted: 400, activity: -450, balance: -50 }, // Significant increase
        { id: 'cat-2', budgeted: 200, activity: -185, balance: 15 },
      ]),
    ];

    const result = analyzeSpendingTrends(months, mockCategories);

    expect(result.length).toBeGreaterThan(0);

    const groceries = result.find((trend) => trend.category === 'Groceries');
    expect(groceries?.data_points).toBe(3);
    expect(groceries?.explanation).toContain('months of data');
  });

  test('should require minimum data points', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: -300, balance: 100 },
      ]),
      createMockMonthData('2024-02', [{ id: 'cat-1', budgeted: 400, activity: -320, balance: 80 }]),
    ];

    const result = analyzeSpendingTrends(months, mockCategories);

    // Should not include categories with less than 3 months of data
    expect(result).toHaveLength(0);
  });

  test('should filter out categories with no spending', () => {
    const months = [
      createMockMonthData('2024-01', [
        { id: 'cat-1', budgeted: 400, activity: 0, balance: 400 }, // No spending
        { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 },
      ]),
      createMockMonthData('2024-02', [
        { id: 'cat-1', budgeted: 400, activity: 0, balance: 800 },
        { id: 'cat-2', budgeted: 200, activity: -190, balance: 10 },
      ]),
      createMockMonthData('2024-03', [
        { id: 'cat-1', budgeted: 400, activity: 0, balance: 1200 },
        { id: 'cat-2', budgeted: 200, activity: -185, balance: 15 },
      ]),
    ];

    const result = analyzeSpendingTrends(months, mockCategories);

    // Should only include categories with actual spending
    const trends = result.map((t) => t.category);
    expect(trends).not.toContain('Groceries'); // No spending
    expect(trends).toContain('Dining Out'); // Has spending
  });

  test('should sort trends by significance', () => {
    const months = Array.from({ length: 6 }, (_, i) =>
      createMockMonthData(`2024-${String(i + 1).padStart(2, '0')}`, [
        { id: 'cat-1', budgeted: 400, activity: -300 - i * 20, balance: 100 }, // Increasing trend
        { id: 'cat-2', budgeted: 200, activity: -180, balance: 20 }, // Stable
      ]),
    );

    const result = analyzeSpendingTrends(months, mockCategories);

    if (result.length > 1) {
      // First result should have higher or equal significance
      const significanceOrder = { high: 3, medium: 2, low: 1 };
      expect(significanceOrder[result[0].significance]).toBeGreaterThanOrEqual(
        significanceOrder[result[1].significance],
      );
    }
  });
});

describe('calculateConsistencyScore', () => {
  test('should return 100 for identical values', () => {
    const values = [100, 100, 100, 100];
    const score = calculateConsistencyScore(values);
    expect(score).toBe(100);
  });

  test('should return 100 for single value', () => {
    const values = [100];
    const score = calculateConsistencyScore(values);
    expect(score).toBe(100);
  });

  test('should return lower scores for higher variability', () => {
    const lowVariability = [95, 100, 105, 98, 102]; // CV ~3%
    const highVariability = [50, 150, 75, 125, 100]; // CV ~30%

    const lowScore = calculateConsistencyScore(lowVariability);
    const highScore = calculateConsistencyScore(highVariability);

    expect(lowScore).toBeGreaterThan(highScore);
    expect(lowScore).toBeGreaterThan(80);
    expect(highScore).toBeLessThan(80);
  });

  test('should handle edge cases', () => {
    expect(calculateConsistencyScore([])).toBe(100);
    expect(calculateConsistencyScore([0, 0, 0])).toBe(100);
  });
});

describe('calculateScoreConfidence', () => {
  test('should calculate confidence intervals correctly', () => {
    const scores = [70, 75, 80, 85, 90];
    const confidence = calculateScoreConfidence(scores);

    expect(confidence.lower).toBeLessThanOrEqual(confidence.upper);
    expect(confidence.lower).toBeGreaterThanOrEqual(0);
    expect(confidence.upper).toBeLessThanOrEqual(100);
  });

  test('should handle small datasets', () => {
    const scores = [80, 90];
    const confidence = calculateScoreConfidence(scores);

    expect(confidence.lower).toBe(80);
    expect(confidence.upper).toBe(80);
  });

  test('should handle single score', () => {
    const scores = [85];
    const confidence = calculateScoreConfidence(scores);

    expect(confidence.lower).toBe(85);
    expect(confidence.upper).toBe(85);
  });
});

describe('Integration Tests', () => {
  test('should handle realistic financial data', () => {
    const accounts = [
      createMockAccount(ynab.AccountType.Checking, 2500),
      createMockAccount(ynab.AccountType.Savings, 15000),
      createMockAccount(ynab.AccountType.CreditCard, -850),
      createMockAccount(ynab.AccountType.OtherAsset, 200000, 'House'),
      createMockAccount(ynab.AccountType.Mortgage, -150000),
    ];

    const categories = [
      createMockCategory('housing', 'Housing'),
      createMockCategory('food', 'Food'),
      createMockCategory('transport', 'Transportation'),
    ];

    const months = Array.from({ length: 6 }, (_, i) =>
      createMockMonthData(`2024-${String(i + 1).padStart(2, '0')}`, [
        { id: 'housing', budgeted: 2000, activity: -1950, balance: 50 },
        { id: 'food', budgeted: 600, activity: -580 - i * 10, balance: 20 },
        { id: 'transport', budgeted: 400, activity: -380, balance: 20 },
      ]),
    );

    const balances = calculateAccountBalances(accounts);
    const performance = analyzeCategoryPerformance(months, categories);
    const trends = analyzeSpendingTrends(months, categories);
    const netWorth = calculateNetWorthTrend(months, balances);

    expect(balances.liquidNetWorth).toBe(16650); // 2500 + 15000 - 850
    expect(balances.totalNetWorth).toBe(66650); // Include house and mortgage
    expect(performance).toHaveLength(3);
    expect(trends.length).toBeLessThanOrEqual(3);
    expect(netWorth.direction).toBeOneOf(['increasing', 'decreasing', 'stable']);
  });
});
