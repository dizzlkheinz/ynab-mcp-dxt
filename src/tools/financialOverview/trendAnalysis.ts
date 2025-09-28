import * as ynab from 'ynab';
import { mean, deviation, quantile } from 'd3-array';
import type { SpendingTrend, MonthData } from './schemas.js';

/**
 * Calculate comprehensive account balance metrics including liquid and total net worth
 * Categorizes accounts by type and computes both on-budget and total financial positions
 */
export function calculateAccountBalances(accounts: ynab.Account[]) {
  const balances = {
    // On-budget (liquid) net worth - only accounts that can be budgeted
    liquidNetWorth: 0,
    liquidAssets: 0,
    totalDebt: 0,

    // True total net worth including all assets and liabilities
    totalNetWorth: 0,
    totalAssets: 0,
    totalLiabilities: 0,

    // Account type breakdowns
    checkingBalance: 0,
    savingsBalance: 0,
    creditCardBalance: 0,
    investmentBalance: 0,
    realEstateBalance: 0,
    mortgageBalance: 0,
    otherAssetBalance: 0,
    otherLiabilityBalance: 0,
  };

  accounts.forEach((account) => {
    const balance = ynab.utils.convertMilliUnitsToCurrencyAmount(account.balance);

    // Calculate liquid/on-budget net worth (budgetable money)
    if (account.on_budget) {
      balances.liquidNetWorth += balance;
    }

    // Calculate total net worth (all assets minus all liabilities)
    if (balance > 0) {
      balances.totalAssets += balance;
    } else {
      balances.totalLiabilities += Math.abs(balance);
    }

    switch (account.type) {
      case ynab.AccountType.Checking:
        balances.checkingBalance += balance;
        balances.liquidAssets += balance;
        break;
      case ynab.AccountType.Savings:
        balances.savingsBalance += balance;
        balances.liquidAssets += balance;
        break;
      case ynab.AccountType.CreditCard:
        balances.creditCardBalance += balance;
        if (balance < 0) balances.totalDebt += Math.abs(balance);
        break;
      case ynab.AccountType.Mortgage:
        balances.mortgageBalance += balance; // Will be negative
        break;
      case ynab.AccountType.OtherAsset:
        // Check if this looks like real estate based on balance size or name
        if (
          balance > 100000 &&
          (account.name.toLowerCase().includes('house') ||
            account.name.toLowerCase().includes('condo') ||
            account.name.toLowerCase().includes('property') ||
            account.name.toLowerCase().includes('laguna'))
        ) {
          balances.realEstateBalance += balance;
        } else {
          // Likely investments (RRSP, TFSA, etc.)
          balances.investmentBalance += balance;
        }
        balances.otherAssetBalance += balance;
        break;
      case ynab.AccountType.OtherLiability:
        balances.otherLiabilityBalance += balance;
        break;
      default:
        if (account.type.toString().toLowerCase().includes('investment')) {
          balances.investmentBalance += balance;
        }
        break;
    }
  });

  // Calculate total net worth
  balances.totalNetWorth = balances.totalAssets - balances.totalLiabilities;

  return balances;
}

/**
 * Analyze category performance across multiple months
 * Calculates average spending, budgeting, and utilization rates for each category
 */
export function analyzeCategoryPerformance(months: MonthData[], categories: ynab.Category[]) {
  // Filter out inflow categories that shouldn't be treated as spending categories
  const spendingCategories = categories.filter(
    (category) =>
      !category.name.toLowerCase().includes('inflow:') &&
      !category.name.toLowerCase().includes('ready to assign'),
  );

  const performance = spendingCategories.map((category) => {
    const monthlyData = months
      .map((monthData) => {
        const monthCategory = monthData?.data?.month?.categories?.find((c) => c.id === category.id);
        return monthCategory
          ? {
              month: monthData.data.month.month,
              budgeted: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted),
              activity: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity),
              balance: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.balance),
            }
          : null;
      })
      .filter((data): data is NonNullable<typeof data> => data !== null);

    const avgBudgeted =
      monthlyData.reduce((sum, data) => sum + data.budgeted, 0) / (monthlyData.length || 1);
    const avgActivity =
      monthlyData.reduce((sum, data) => sum + Math.abs(data.activity), 0) /
      (monthlyData.length || 1);
    const utilizationRate = avgBudgeted > 0 ? (avgActivity / avgBudgeted) * 100 : 0;

    // Get current balance from the most recent month to determine true overspending vs using accumulated funds
    const mostRecentMonth = monthlyData.sort(
      (a, b) => new Date(b.month).getTime() - new Date(a.month).getTime(),
    )[0];
    const currentBalance = mostRecentMonth?.balance || 0;

    return {
      category_name: category.name,
      category_id: category.id,
      average_budgeted: avgBudgeted,
      average_spent: avgActivity,
      utilization_rate: utilizationRate,
      current_balance: currentBalance,
      monthly_data: monthlyData,
    };
  });

  return performance;
}

/**
 * @description Calculate net worth trend progression over time.
 * Provides trend analysis with direction, change amounts, and percentages.
 *
 * @important This is a simplified implementation that uses a linear projection based on the current total net worth.
 * It provides a basic trend direction but does not reflect actual historical net worth fluctuations.
 * The YNAB API does not provide historical account balances directly, so a true historical calculation
 * would require iterating through transactions, which is a much more complex and expensive operation.
 *
 * @todo Implement a more accurate historical net worth calculation by processing transactions
 * on a month-by-month basis. This would involve fetching all transactions for the period and
 * reconstructing the balance of each account at the end of each month.
 * See: https://github.com/K-Sut/ynab-mcp-dxt/issues/123
 */
export function calculateNetWorthTrend(
  months: MonthData[],
  accountBalances: ReturnType<typeof calculateAccountBalances>,
) {
  if (months.length === 0) {
    return {
      direction: 'stable' as const,
      change_amount: 0,
      change_percentage: 0,
      monthly_values: [],
      analysis: 'Insufficient data to calculate net worth trend',
    };
  }

  // For a simplified implementation, we'll use the current balances as baseline
  // In a full implementation, this would calculate historical net worth for each month
  const monthlyNetWorth = months.map((monthData, index) => {
    // Simplified: assume linear progression based on current state
    // In reality, you'd want historical account balance data
    const progressFactor = (index + 1) / months.length;
    return {
      month: monthData?.data.month.month || new Date().toISOString().slice(0, 7),
      net_worth: accountBalances.totalNetWorth * progressFactor,
    };
  });

  const firstValue = monthlyNetWorth[0]?.net_worth || 0;
  const lastValue = monthlyNetWorth[monthlyNetWorth.length - 1]?.net_worth || 0;
  const changeAmount = lastValue - firstValue;
  const changePercentage = firstValue !== 0 ? (changeAmount / Math.abs(firstValue)) * 100 : 0;

  let direction: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(changePercentage) < 1) {
    direction = 'stable';
  } else if (changeAmount > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  return {
    direction,
    change_amount: changeAmount,
    change_percentage: changePercentage,
    monthly_values: monthlyNetWorth,
    analysis: `Net worth has ${direction === 'stable' ? 'remained stable' : direction === 'increasing' ? 'increased' : 'decreased'} by ${Math.abs(changePercentage).toFixed(1)}% over the analysis period`,
  };
}

/**
 * Analyze spending trends using statistical methods to detect significant changes
 * Uses Z-score anomaly detection and percentile analysis for reliable trend identification
 */
export function analyzeSpendingTrends(
  months: MonthData[],
  categories: ynab.Category[],
): SpendingTrend[] {
  const trends: SpendingTrend[] = [];

  // Filter out inflow categories from spending analysis
  const spendingCategories = categories.filter(
    (category) =>
      !category.name.toLowerCase().includes('inflow:') &&
      !category.name.toLowerCase().includes('ready to assign'),
  );

  spendingCategories.forEach((category) => {
    // Get spending data for all available months
    const monthlySpending = months
      .map((monthData, index) => {
        const monthCategory = monthData?.data.month.categories.find((c) => c.id === category.id);
        const spending = monthCategory
          ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity))
          : 0;
        return { month: index, spending };
      })
      .filter((data) => data.spending > 0); // Only include months with spending

    // Need at least 3 months of data to calculate meaningful analysis
    if (monthlySpending.length >= 3) {
      const spendingValues = monthlySpending.map((d) => d.spending);
      const n = monthlySpending.length;

      // Statistical measures using d3-array
      const avgSpending = mean(spendingValues) || 0;
      const stdDev = deviation(spendingValues) || 0;

      // Current vs previous period for comparison
      const currentPeriod = monthlySpending[0]?.spending || 0; // Most recent month
      const previousPeriod = monthlySpending[1]?.spending || 0; // Adjacent prior month

      // Z-score anomaly detection for current month
      const currentZScore = stdDev > 0 ? Math.abs((currentPeriod - avgSpending) / stdDev) : 0;

      // Percentile-based analysis
      const sortedSpending = [...spendingValues].sort((a, b) => a - b);
      const p90 = quantile(sortedSpending, 0.9) || 0;
      const p95 = quantile(sortedSpending, 0.95) || 0;

      // Calculate coefficient of variation for variability assessment
      const coefficientOfVariation = avgSpending > 0 ? (stdDev / avgSpending) * 100 : 0;

      // Simple trend direction based on recent vs older spending
      const simplePercentChange =
        previousPeriod > 0 ? ((currentPeriod - previousPeriod) / previousPeriod) * 100 : 0;

      // Determine significance based on statistical measures, not linear regression
      let significance: 'high' | 'medium' | 'low' = 'low';
      let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';

      // Only flag as significant if it's a real anomaly
      if (coefficientOfVariation < 20) {
        // Low variability categories
        if (currentZScore > 2 || currentPeriod > p95) {
          significance = 'high';
          trendDirection = currentPeriod > avgSpending ? 'increasing' : 'decreasing';
        } else if (currentZScore > 1.5 || currentPeriod > p90) {
          significance = 'medium';
          trendDirection = currentPeriod > avgSpending ? 'increasing' : 'decreasing';
        }
      } else if (coefficientOfVariation < 50) {
        // Medium variability categories
        if (currentZScore > 2.5 || currentPeriod > p95) {
          significance = 'high';
          trendDirection = currentPeriod > avgSpending ? 'increasing' : 'decreasing';
        } else if (currentZScore > 2 || currentPeriod > p90) {
          significance = 'medium';
          trendDirection = currentPeriod > avgSpending ? 'increasing' : 'decreasing';
        }
      } else {
        // High variability categories - very conservative
        if (currentZScore > 3 || currentPeriod > p95 * 1.2) {
          significance = 'high';
          trendDirection = currentPeriod > avgSpending ? 'increasing' : 'decreasing';
        }
      }

      // Generate realistic explanation
      let explanation = `Based on ${n} months of data, `;
      if (trendDirection === 'stable') {
        explanation += `spending in ${category.name} is within normal variation (${coefficientOfVariation.toFixed(0)}% variability).`;
      } else if (trendDirection === 'increasing') {
        explanation += `current spending in ${category.name} is ${currentZScore.toFixed(1)} standard deviations above average, suggesting a potential increase.`;
      } else {
        explanation += `current spending in ${category.name} is ${currentZScore.toFixed(1)} standard deviations below average, suggesting a decrease.`;
      }

      if (significance === 'high') {
        explanation += ` This is statistically significant and worth investigating.`;
      } else if (significance === 'medium') {
        explanation += ` This is a moderate deviation that may be worth monitoring.`;
      } else {
        explanation += ` This appears to be normal spending variation.`;
      }

      trends.push({
        category: category.name,
        categoryId: category.id,
        currentPeriod,
        previousPeriod,
        percentChange: simplePercentChange,
        trend: trendDirection,
        significance,
        explanation,
        data_points: n,
        reliability_score: Math.round((1 - coefficientOfVariation / 100) * 100), // Higher score for less variable categories
      });
    }
  });

  // Sort by significance first, then by z-score magnitude
  return trends.sort((a, b) => {
    const significanceOrder = { high: 3, medium: 2, low: 1 };
    const sigDiff = significanceOrder[b.significance] - significanceOrder[a.significance];
    if (sigDiff !== 0) return sigDiff;
    return Math.abs(b.percentChange) - Math.abs(a.percentChange);
  });
}

/**
 * Calculate consistency score using coefficient of variation
 * Lower CV = higher consistency = higher score
 */
export function calculateConsistencyScore(values: number[]): number {
  if (values.length < 2) return 100;

  const avg = mean(values);
  const std = deviation(values) || 0;

  if (avg === 0) return 100;

  const coefficientOfVariation = (std / Math.abs(avg || 1)) * 100;

  // Lower CV = higher consistency = higher score
  if (coefficientOfVariation < 10) return 100;
  if (coefficientOfVariation < 25) return 80;
  if (coefficientOfVariation < 50) return 60;
  if (coefficientOfVariation < 75) return 40;
  return 20;
}

/**
 * Calculate confidence intervals using percentile analysis
 * Provides upper and lower bounds for score reliability
 */
export function calculateScoreConfidence(scores: number[]): { lower: number; upper: number } {
  if (scores.length < 3) {
    return { lower: scores[0] || 0, upper: scores[0] || 100 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  return {
    lower: Math.round(quantile(sorted, 0.25) || 0), // 25th percentile
    upper: Math.round(quantile(sorted, 0.75) || 100), // 75th percentile
  };
}
