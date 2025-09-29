import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { responseFormatter } from '../../server/responseFormatter.js';
import type { SpendingTrend, BudgetInsight, HealthSubScores, MonthData } from './schemas.js';

interface AccountBalances {
  liquidNetWorth: number;
  liquidAssets: number;
  totalDebt: number;
  totalNetWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  checkingBalance: number;
  savingsBalance: number;
  creditCardBalance: number;
  investmentBalance: number;
  realEstateBalance: number;
  mortgageBalance: number;
  otherAssetBalance: number;
  otherLiabilityBalance: number;
}

/**
 * Utility function to format milliunit amounts as currency
 * Uses YNAB's built-in conversion for consistency
 */
export function formatCurrency(milliunits: number): string {
  return ynab.utils.convertMilliUnitsToCurrencyAmount(milliunits).toFixed(2);
}

/**
 * Calculate budget utilization percentage for a given month
 * Returns percentage of budget actually spent
 */
export function calculateBudgetUtilization(month: ynab.MonthDetail): number {
  if (!month.budgeted || month.budgeted === 0) return 0;
  return (Math.abs(month.activity) / month.budgeted) * 100;
}

/**
 * Format account balances data for display
 * Structures balance information with proper currency formatting
 */
export function formatAccountBalances(
  balances: AccountBalances,
  totalAccounts: number,
  onBudgetAccounts: number,
) {
  return {
    total_accounts: totalAccounts,
    on_budget_accounts: onBudgetAccounts,
    checking_balance: balances.checkingBalance,
    savings_balance: balances.savingsBalance,
    credit_card_balance: balances.creditCardBalance,
    investment_balance: balances.investmentBalance,
    real_estate_balance: balances.realEstateBalance,
    mortgage_balance: balances.mortgageBalance,
  };
}

/**
 * Format spending trends data with proper currency and percentage formatting
 * Ensures consistent display of trend analysis results
 */
export function formatSpendingTrends(trends: SpendingTrend[]) {
  return {
    analysis_method: 'Statistical anomaly detection using Z-score and percentile analysis',
    explanation:
      'Trends are calculated using Z-score anomaly detection and percentile analysis to identify genuinely unusual spending patterns. Categories need at least 3 months of data. Higher variability categories require stronger deviations to trigger alerts, reducing false alarms.',
    confidence_levels: {
      high: 'Statistically significant anomaly - strong evidence of unusual spending',
      medium: 'Moderate deviation - worth monitoring',
      low: 'Within normal variation - no concern needed',
    },
    trends: trends,
  };
}

/**
 * Format health metrics for consistent display
 * Structures health scores and explanations for readability
 */
export function formatHealthMetrics(
  healthScore: number,
  subScores: HealthSubScores,
  explanation: string,
  recommendations: string[],
  analysisDateRange: string,
) {
  return {
    analysis_period: analysisDateRange,
    health_score: healthScore,
    sub_scores: subScores,
    score_explanation: explanation,
    recommendations: recommendations,
    last_assessment: new Date().toISOString(),
  };
}

/**
 * Format insights and recommendations for readability
 * Ensures consistent structure for actionable insights
 */
export function formatInsights(insights: BudgetInsight[]) {
  return insights.map((insight) => ({
    ...insight,
    // Ensure all insights have proper structure
    suggestions: insight.suggestions || [],
  }));
}

/**
 * Build complete financial overview response with all data components
 * Combines all analysis results into a structured CallToolResult
 */
export function buildFinancialOverviewResponse(data: {
  overview: Record<string, unknown>;
  summary: Record<string, unknown>;
  current_month: Record<string, unknown> | null;
  account_overview: Record<string, unknown>;
  category_performance: Record<string, unknown>[];
  net_worth_trend: Record<string, unknown>;
  spending_trends: Record<string, unknown>;
  insights: BudgetInsight[];
  cached?: boolean;
}): CallToolResult {
  const result = {
    overview: data.overview,
    summary: data.summary,
    current_month: data.current_month,
    account_overview: data.account_overview,
    category_performance: data.category_performance,
    net_worth_trend: data.net_worth_trend,
    spending_trends: data.spending_trends,
    insights: formatInsights(data.insights),
  };

  return {
    content: [
      {
        type: 'text',
        text: responseFormatter.format({ ...result, cached: data.cached || false }),
      },
    ],
  };
}

/**
 * Build spending analysis response with formatted results
 * Structures spending analysis data for consistent output
 */
export function buildSpendingAnalysisResponse(analysis: {
  analysis_period: string;
  category_analysis: Record<string, unknown>[];
  balance_insights: Record<string, unknown>;
}): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: responseFormatter.format(analysis),
      },
    ],
  };
}

/**
 * Build budget health check response with health metrics
 * Formats health check results with scores and recommendations
 */
export function buildBudgetHealthResponse(healthCheck: {
  analysis_period: string;
  health_score: number;
  sub_scores: HealthSubScores;
  score_explanation: string;
  metrics: Record<string, unknown>;
  recommendations: string[];
  last_assessment: string;
}): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: responseFormatter.format(healthCheck),
      },
    ],
  };
}

/**
 * Format detailed spending analysis results
 * Used by spending analysis handler to structure category data
 */
export function performDetailedSpendingAnalysis(
  months: MonthData[],
  categories: ynab.Category[],
  categoryId?: string,
) {
  const targetCategories = categoryId ? categories.filter((c) => c.id === categoryId) : categories;

  // Generate clear date range
  const sortedMonths = [...months].sort(
    (a, b) =>
      new Date(b.data.month.month || '').getTime() - new Date(a.data.month.month || '').getTime(),
  );

  // Bail out early if there are no valid month entries
  if (!sortedMonths.length) {
    return {
      analysis_period: 'No data available',
      category_analysis: [],
      balance_insights: {
        top_unused_balances: [],
        under_budgeted_categories: [],
      },
    };
  }

  // Helper to safely parse and format an ISO month string
  const formatMonth = (isoMonth?: string) => {
    if (!isoMonth) return null;
    const parsed = new Date(isoMonth);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const startLabel = formatMonth(sortedMonths[sortedMonths.length - 1]?.data.month.month);
  const endLabel = formatMonth(sortedMonths[0]?.data.month.month);
  const dateRange =
    startLabel && endLabel
      ? `${startLabel} - ${endLabel} (${months.length} months)`
      : `(${months.length} months)`;
  const categoryAnalysis = targetCategories
    .map((category) => {
      const monthlySpending = months.map((monthData) => {
        const monthCategory = monthData?.data.month.categories.find((c) => c.id === category.id);
        return {
          month: monthData?.data.month.month || '',
          budgeted: monthCategory
            ? ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted)
            : 0,
          activity: monthCategory
            ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity))
            : 0,
          balance: monthCategory
            ? ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.balance)
            : 0,
        };
      });

      const latest = [...monthlySpending].sort(
        (a, b) => new Date(b.month).getTime() - new Date(a.month).getTime(),
      )[0];
      const current_balance = latest ? latest.balance : 0;

      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const totalBudgeted = monthlySpending.reduce((sum, month) => sum + month.budgeted, 0);
      const avgMonthlySpending = totalSpent / months.length;
      const maxSpending = Math.max(...monthlySpending.map((m) => m.activity));
      const minSpending = Math.min(...monthlySpending.map((m) => m.activity));

      // Calculate coefficient of variation (CV) as a proper measure of variability
      const spendingValues = monthlySpending.map((m) => m.activity);
      const variance =
        spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) /
        spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation =
        avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;

      return {
        category_name: category.name,
        total_budgeted: totalBudgeted,
        total_spent: totalSpent,
        average_monthly: avgMonthlySpending,
        max_monthly: maxSpending,
        min_monthly: minSpending,
        variability: coefficientOfVariation,
        current_balance: current_balance, // Most recent month's balance
        monthly_breakdown: monthlySpending,
      };
    })
    .filter((analysis) => analysis.total_spent > 0 || analysis.total_budgeted > 0);

  // Find categories with largest unused balances (top 5)
  const unusedBalances = categoryAnalysis
    .filter((cat) => cat.current_balance > 100)
    .sort((a, b) => b.current_balance - a.current_balance)
    .slice(0, 5)
    .map((cat) => ({
      category_name: cat.category_name,
      unused_balance: cat.current_balance,
    }));

  // Find under-budgeted categories (negative balances)
  const underBudgeted = categoryAnalysis
    .filter((cat) => cat.current_balance < 0)
    .map((cat) => ({
      category_name: cat.category_name,
      shortage: Math.abs(cat.current_balance),
    }));

  return {
    analysis_period: dateRange,
    category_analysis: categoryAnalysis,
    balance_insights: {
      top_unused_balances: unusedBalances,
      under_budgeted_categories: underBudgeted,
    },
  };
}

/**
 * Perform budget health check with comprehensive metrics calculation
 * Used by health check handler to assess current financial health
 */
export function performBudgetHealthCheck(
  includeRecommendations: boolean,
  analysisDateRange?: string,
  healthMetrics?: Record<string, unknown>,
  healthScore?: number,
  subScores?: HealthSubScores,
  scoreExplanation?: string,
  recommendations?: string[],
) {
  return {
    analysis_period:
      analysisDateRange ||
      new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    health_score: healthScore || 0,
    sub_scores: subScores || {
      spending_health: 0,
      debt_health: 0,
      emergency_fund_health: 0,
      budget_discipline: 0,
    },
    score_explanation: scoreExplanation || '',
    metrics: healthMetrics || {},
    recommendations: includeRecommendations ? recommendations || [] : [],
    last_assessment: new Date().toISOString(),
  };
}
