import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { cacheManager, CACHE_TTLS } from '../server/cacheManager.js';
import { getHistoricalMonths } from '../utils/dateUtils.js';
import { mean, deviation, quantile } from 'd3-array';

/**
 * Utility function to format milliunit amounts as currency
 */
function formatCurrency(milliunits: number): string {
  return ynab.utils.convertMilliUnitsToCurrencyAmount(milliunits).toFixed(2);
}

export const FinancialOverviewSchema = z.object({
  budget_id: z.string().optional(),
  months: z.number().min(1).max(12).default(3),
  include_trends: z.boolean().default(true),
  include_insights: z.boolean().default(true),
});

export const SpendingAnalysisSchema = z.object({
  budget_id: z.string().optional(),
  period_months: z.number().min(1).max(12).default(6),
  category_id: z.string().optional(),
});

export const BudgetHealthSchema = z.object({
  budget_id: z.string().optional(),
  include_recommendations: z.boolean().default(true),
});

export type FinancialOverviewParams = z.infer<typeof FinancialOverviewSchema>;
export type SpendingAnalysisParams = z.infer<typeof SpendingAnalysisSchema>;
export type BudgetHealthParams = z.infer<typeof BudgetHealthSchema>;

interface SpendingTrend {
  category: string;
  categoryId: string;
  currentPeriod: number;
  previousPeriod: number;
  percentChange: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  significance: 'high' | 'medium' | 'low';
  explanation: string;
  data_points: number;
  reliability_score: number;
}

interface MonthData {
  data: {
    month: {
      month: string;
      to_be_budgeted?: number;
      categories: {
        id: string;
        budgeted: number;
        activity: number;
        balance: number;
      }[];
    };
  };
}

interface FinancialMetrics {
  emergency_fund_status: {
    current_amount: number;
    recommended_minimum?: number;
    status?: string;
  };
  overspending?: {
    total_amount: number;
  };
  budget_variance?: {
    variance_percentage: number;
  };
  debt_metrics?: {
    total_debt: number;
  };
  budget_utilization?: number;
  overspent_categories?: number;
  underfunded_categories?: number;
  debt_to_asset_ratio?: number;
  unallocated_funds?: number;
}

interface HealthSubScores {
  spending_health: number;
  debt_health: number;
  emergency_fund_health: number;
  budget_discipline: number;
}

interface AccountBalance {
  liquidNetWorth: number;
  totalNetWorth?: number;
}

interface BudgetInsight {
  type: 'warning' | 'success' | 'info' | 'recommendation';
  category: 'spending' | 'budgeting' | 'goals' | 'efficiency';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  suggestions?: string[];
}

export async function handleFinancialOverview(
  ynabAPI: ynab.API,
  params: FinancialOverviewParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const budgetId = params.budget_id!; // Will always be provided by the server
      const cacheKey = `financial-overview:${budgetId}:${params.months}:${params.include_trends}:${params.include_insights}`;

      const cached = cacheManager.get<CallToolResult>(cacheKey);
      if (cached) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...cached, cached: true }, null, 2),
            },
          ],
        };
      }

      const monthsToFetch = getHistoricalMonths(params.months);

      const [budget, transactions, months] = await Promise.all([
        ynabAPI.budgets.getBudgetById(budgetId),
        ynabAPI.transactions.getTransactions(budgetId, monthsToFetch[0]),
        Promise.all(
          monthsToFetch.map((month) =>
            ynabAPI.months.getBudgetMonth(budgetId, month).catch(() => null),
          ),
        ),
      ]);

      const validMonths = months.filter((m) => m !== null);
      const accountBalances = calculateAccountBalances(budget.data.budget.accounts || []);
      const categoryAnalysis = analyzeCategoryPerformance(
        validMonths,
        budget.data.budget.categories || [],
      );
      const netWorthTrend = calculateNetWorthTrend(validMonths, accountBalances);

      let trends: SpendingTrend[] = [];
      let insights: BudgetInsight[] = [];

      if (params.include_trends) {
        trends = analyzeSpendingTrends(validMonths, budget.data.budget.categories || []);
      }

      if (params.include_insights) {
        insights = generateFinancialInsights(
          validMonths,
          budget.data.budget,
          transactions.data.transactions,
          trends,
        );
      }

      // Generate clear date range for summary
      const sortedMonths = validMonths.sort(
        (a, b) => new Date(b.data.month.month).getTime() - new Date(a.data.month.month).getTime(),
      );
      let analysisDateRange = `${params.months} months`; // fallback
      if (
        sortedMonths.length > 0 &&
        sortedMonths[0]?.data?.month?.month &&
        sortedMonths[sortedMonths.length - 1]?.data?.month?.month
      ) {
        const startDate = new Date(sortedMonths[sortedMonths.length - 1]!.data.month.month);
        const endDate = new Date(sortedMonths[0]!.data.month.month);
        analysisDateRange = `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (${validMonths.length} months)`;
      }

      const overview = {
        summary: {
          analysis_period: analysisDateRange,
          period: `${params.months} months`, // Keep for backward compatibility
          last_updated: new Date().toISOString(),
          budget_name: budget.data.budget.name,
          liquid_net_worth: accountBalances.liquidNetWorth,
          total_net_worth: accountBalances.totalNetWorth,
          liquid_assets: accountBalances.liquidAssets,
          total_assets: accountBalances.totalAssets,
          total_liabilities: accountBalances.totalLiabilities,
          debt: accountBalances.totalDebt,
        },
        current_month: validMonths[0]
          ? {
              month: validMonths[0].data.month.month,
              income: ynab.utils.convertMilliUnitsToCurrencyAmount(
                validMonths[0].data.month.income,
              ),
              budgeted: ynab.utils.convertMilliUnitsToCurrencyAmount(
                validMonths[0].data.month.budgeted,
              ),
              activity: ynab.utils.convertMilliUnitsToCurrencyAmount(
                validMonths[0].data.month.activity,
              ),
              to_be_budgeted: ynab.utils.convertMilliUnitsToCurrencyAmount(
                validMonths[0].data.month.to_be_budgeted,
              ),
              budget_utilization: calculateBudgetUtilization(validMonths[0].data.month),
            }
          : null,
        account_overview: {
          total_accounts: budget.data.budget.accounts?.length || 0,
          on_budget_accounts: budget.data.budget.accounts?.filter((a) => a.on_budget).length || 0,
          checking_balance: accountBalances.checkingBalance,
          savings_balance: accountBalances.savingsBalance,
          credit_card_balance: accountBalances.creditCardBalance,
          investment_balance: accountBalances.investmentBalance,
          real_estate_balance: accountBalances.realEstateBalance,
          mortgage_balance: accountBalances.mortgageBalance,
        },
        category_performance: categoryAnalysis,
        net_worth_trend: netWorthTrend,
        spending_trends: {
          analysis_method: 'Statistical anomaly detection using Z-score and percentile analysis',
          explanation:
            'Trends are calculated using Z-score anomaly detection and percentile analysis to identify genuinely unusual spending patterns. Categories need at least 3 months of data. Higher variability categories require stronger deviations to trigger alerts, reducing false alarms.',
          confidence_levels: {
            high: 'Statistically significant anomaly - strong evidence of unusual spending',
            medium: 'Moderate deviation - worth monitoring',
            low: 'Within normal variation - no concern needed',
          },
          trends: trends,
        },
        insights: insights,
      };

      cacheManager.set(cacheKey, overview, CACHE_TTLS.MONTHS);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(overview, null, 2),
          },
        ],
      };
    },
    'ynab:financial-overview',
    'generating financial overview',
  );
}

export async function handleSpendingAnalysis(
  ynabAPI: ynab.API,
  params: SpendingAnalysisParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const budgetId = params.budget_id!; // Will always be provided by the server

      const monthsToAnalyze = getHistoricalMonths(params.period_months);

      const [budget, monthsData] = await Promise.all([
        ynabAPI.budgets.getBudgetById(budgetId),
        Promise.all(
          monthsToAnalyze.map((month) =>
            ynabAPI.months.getBudgetMonth(budgetId, month).catch(() => null),
          ),
        ),
      ]);

      const validMonths = monthsData.filter((m) => m !== null);
      const analysis = performDetailedSpendingAnalysis(
        validMonths,
        budget.data.budget.categories || [],
        params.category_id,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    },
    'ynab:spending-analysis',
    'analyzing spending patterns',
  );
}

export async function handleBudgetHealthCheck(
  ynabAPI: ynab.API,
  params: BudgetHealthParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const budgetId = params.budget_id!; // Will always be provided by the server

      const currentMonth = ynab.utils.getCurrentMonthInISOFormat();
      const [budget, currentMonthData, recentTransactions] = await Promise.all([
        ynabAPI.budgets.getBudgetById(budgetId),
        ynabAPI.months.getBudgetMonth(budgetId, currentMonth),
        ynabAPI.transactions.getTransactions(budgetId, currentMonth),
      ]);

      // Generate clear date range for the analysis period
      const analysisDate = new Date(currentMonthData.data.month.month);
      const analysisDateRange = analysisDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      const healthCheck = performBudgetHealthCheck(
        budget.data.budget,
        currentMonthData.data.month,
        recentTransactions.data.transactions,
        params.include_recommendations,
        analysisDateRange,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(healthCheck, null, 2),
          },
        ],
      };
    },
    'ynab:budget-health-check',
    'performing budget health check',
  );
}

function calculateAccountBalances(accounts: ynab.Account[]) {
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

function analyzeCategoryPerformance(months: MonthData[], categories: ynab.Category[]) {
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

    // Get current balance to determine true overspending vs using accumulated funds
    const currentBalance = monthlyData[0]?.balance || 0;

    // Determine performance based on both utilization and available balance
    let performance: 'overspent' | 'exceeded_monthly_budget' | 'on_track' | 'under_budget';

    if (currentBalance < 0) {
      performance = 'overspent'; // Actually overspent (negative balance - true overspending)
    } else if (utilizationRate > 100 && currentBalance > 0) {
      performance = 'exceeded_monthly_budget'; // Spent more than monthly assignment but covered by accumulated funds
    } else if (utilizationRate > 100 && currentBalance === 0) {
      performance = 'on_track'; // Spent more than budgeted but ended at exactly 0
    } else if (utilizationRate === 100 && currentBalance === 0) {
      performance = 'on_track'; // Spent exactly what was budgeted (balance = 0)
    } else if (utilizationRate > 80) {
      performance = 'on_track';
    } else {
      performance = 'under_budget';
    }

    return {
      category_name: category.name,
      category_id: category.id,
      average_budgeted: avgBudgeted,
      average_spent: avgActivity,
      utilization_rate: utilizationRate,
      performance,
      current_balance: currentBalance,
      monthly_data: monthlyData,
    };
  });

  return performance.filter(
    (p) =>
      (p.average_budgeted > 0 || p.average_spent > 0) &&
      !p.category_name.toLowerCase().includes('inflow:') &&
      !p.category_name.toLowerCase().includes('ready to assign'),
  );
}

function calculateNetWorthTrend(months: MonthData[], currentBalances: AccountBalance) {
  return {
    liquid_net_worth: currentBalances.liquidNetWorth,
    total_net_worth: currentBalances.totalNetWorth,
    historical: months.map((monthData, index) => ({
      month: monthData?.data.month.month,
      liquid_net_worth: currentBalances.liquidNetWorth,
      total_net_worth: currentBalances.totalNetWorth,
      change_from_previous: index < months.length - 1 ? 0 : 0,
    })),
    trend: 'stable',
  };
}

function analyzeSpendingTrends(months: MonthData[], categories: ynab.Category[]): SpendingTrend[] {
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
      const previousPeriod = monthlySpending[monthlySpending.length - 1]?.spending || 0; // Oldest month

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

function generateFinancialInsights(
  months: MonthData[],
  budget: ynab.BudgetDetail,
  _transactions: ynab.TransactionDetail[],
  trends: SpendingTrend[],
): BudgetInsight[] {
  const insights: BudgetInsight[] = [];

  if (months[0]) {
    const currentMonth = months[0].data.month;
    if ((currentMonth.to_be_budgeted ?? 0) > 0) {
      insights.push({
        type: 'info',
        category: 'budgeting',
        title: 'Unallocated Funds Available',
        description: `You have $${ynab.utils.convertMilliUnitsToCurrencyAmount(currentMonth.to_be_budgeted ?? 0).toFixed(2)} ready to be budgeted.`,
        impact: 'medium',
        actionable: true,
        suggestions: [
          'Allocate funds to priority categories',
          'Build your emergency fund',
          'Increase savings goals',
        ],
      });
    }
  }

  const highIncreasingTrends = trends.filter(
    (t) => t.trend === 'increasing' && t.significance === 'high',
  );
  highIncreasingTrends.forEach((trend) => {
    insights.push({
      type: 'warning',
      category: 'spending',
      title: `Significant Increase in ${trend.category}`,
      description: `Spending in ${trend.category} has increased by ${trend.percentChange.toFixed(1)}% compared to previous periods.`,
      impact: 'high',
      actionable: true,
      suggestions: [
        'Review recent transactions in this category',
        'Consider adjusting the budget allocation',
        'Look for subscription changes or one-time expenses',
      ],
    });
  });

  // Check for truly overspent categories (negative balance)
  const overspentCategories =
    budget.categories?.filter((category) => {
      const monthCategory = months[0]?.data?.month?.categories?.find((c) => c.id === category.id);
      return monthCategory && monthCategory.balance < 0;
    }) || [];

  if (overspentCategories.length > 0) {
    insights.push({
      type: 'warning',
      category: 'budgeting',
      title: 'Truly Overspent Categories',
      description: `${overspentCategories.length} categories have negative balances, indicating actual overspending beyond available funds.`,
      impact: 'high',
      actionable: true,
      suggestions: [
        'Move money from other categories immediately',
        'Reduce spending in overspent categories',
        'Adjust budget allocations for next month',
      ],
    });
  }

  // Check for categories that exceeded monthly budget but used accumulated funds (different from overspending)
  // Filter out inflow categories from this analysis
  const exceededMonthlyBudget =
    budget.categories?.filter((category) => {
      if (
        category.name.toLowerCase().includes('inflow:') ||
        category.name.toLowerCase().includes('ready to assign')
      ) {
        return false;
      }

      const monthCategory = months[0]?.data?.month?.categories?.find((c) => c.id === category.id);
      if (!monthCategory) return false;

      const budgeted = ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted);
      const activity = Math.abs(
        ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity),
      );
      const balance = ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.balance);

      return budgeted > 0 && activity > budgeted && balance >= 0;
    }) || [];

  if (exceededMonthlyBudget.length > 0) {
    const totalOverAssignment = exceededMonthlyBudget.reduce((sum, category) => {
      const monthCategory = months[0]?.data?.month?.categories?.find((c) => c.id === category.id);
      if (!monthCategory) return sum;

      const budgeted = ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted);
      const activity = Math.abs(
        ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity),
      );

      return sum + (activity - budgeted);
    }, 0);

    insights.push({
      type: 'info',
      category: 'budgeting',
      title: 'Categories That Exceeded Monthly Budget Assignment',
      description: `${exceededMonthlyBudget.length} categories spent more than this period's budget assignment but were covered by funds accumulated from previous months. Total: $${totalOverAssignment.toFixed(2)} over monthly assignments.`,
      impact: 'low',
      actionable: true,
      suggestions: [
        'This is healthy YNAB behavior - using accumulated funds for variable expenses',
        'Consider if monthly assignments should be increased for regular patterns',
        'These categories had sufficient funds to cover the spending',
        `Categories: ${exceededMonthlyBudget
          .slice(0, 3)
          .map((c) => c.name)
          .join(', ')}${exceededMonthlyBudget.length > 3 ? '...' : ''}`,
      ],
    });
  }

  // Generate budget optimization insights
  const budgetOptimization = generateBudgetOptimizationInsights(months, trends, budget);
  insights.push(...budgetOptimization);

  return insights;
}

function generateBudgetOptimizationInsights(
  months: MonthData[],
  trends: SpendingTrend[],
  budget: ynab.BudgetDetail,
): BudgetInsight[] {
  const insights: BudgetInsight[] = [];
  const currentMonth = months[0]?.data.month;

  if (!currentMonth) return insights;

  // Analysis 1: Categories consistently under-spending (historical pattern)
  const consistentlyUnderSpent = trends.filter(
    (t) =>
      t.trend === 'decreasing' &&
      t.significance === 'high' &&
      t.reliability_score >= 70 &&
      t.data_points >= 4, // At least 4 months of data
  );

  if (consistentlyUnderSpent.length > 0) {
    insights.push({
      type: 'success',
      category: 'efficiency',
      title: 'Consistently Under-Spent Categories (Historical Pattern)',
      description: `${consistentlyUnderSpent.length} categories show reliable decreasing spending trends over ${consistentlyUnderSpent[0]?.data_points || 'multiple'} months, suggesting budget reallocation opportunities.`,
      impact: 'medium',
      actionable: true,
      suggestions: [
        'Review if reduced spending reflects changed needs or improved habits',
        'Consider reallocating excess budget to savings goals or debt payoff',
        'Reduce budget allocations for next month if trend continues',
        `Categories: ${consistentlyUnderSpent.map((c) => c.category).join(', ')}`,
      ],
    });
  }

  // Analysis 2: Removed - this is now handled in the main insights generation

  // Analysis 3: Categories with large unused balances
  const largeUnusedBalances =
    currentMonth.categories
      ?.filter((cat) => {
        const category = budget.categories?.find((c) => c.id === cat.id);
        if (
          !category ||
          category.name.toLowerCase().includes('inflow:') ||
          category.name.toLowerCase().includes('ready to assign')
        ) {
          return false;
        }

        const balance = ynab.utils.convertMilliUnitsToCurrencyAmount(cat.balance);
        const budgeted = ynab.utils.convertMilliUnitsToCurrencyAmount(cat.budgeted);
        return balance > 100 && budgeted > 0 && balance > budgeted * 2; // More than 2x monthly budget sitting unused
      })
      ?.map((cat) => ({
        name: budget.categories?.find((c) => c.id === cat.id)?.name || 'Unknown',
        balance: ynab.utils.convertMilliUnitsToCurrencyAmount(cat.balance),
        budgeted: ynab.utils.convertMilliUnitsToCurrencyAmount(cat.budgeted),
      })) || [];

  if (largeUnusedBalances.length > 0) {
    const totalUnused = largeUnusedBalances.reduce((sum: number, cat) => sum + cat.balance, 0);
    insights.push({
      type: 'recommendation',
      category: 'efficiency',
      title: 'Large Unused Category Balances',
      description: `${largeUnusedBalances.length} categories have substantial unused funds totaling $${formatCurrency(totalUnused)}. These could be reallocated to goals or priorities.`,
      impact: 'medium',
      actionable: true,
      suggestions: [
        'Consider if these balances are intentional (sinking funds, emergency categories)',
        'Move excess funds to debt payoff or savings goals',
        'Reduce future budget assignments if funds consistently go unused',
        `Largest balances: ${largeUnusedBalances
          .slice(0, 3)
          .map((c) => `${c.name} ($${formatCurrency(c.balance)})`)
          .join(', ')}`,
      ],
    });
  }

  return insights;
}

function calculateBudgetUtilization(month: ynab.MonthDetail): number {
  if (!month.budgeted || month.budgeted === 0) return 0;
  return (Math.abs(month.activity) / month.budgeted) * 100;
}

function performDetailedSpendingAnalysis(
  months: MonthData[],
  categories: ynab.Category[],
  categoryId?: string,
) {
  const targetCategories = categoryId ? categories.filter((c) => c.id === categoryId) : categories;

  // Generate clear date range
  const sortedMonths = months.sort(
    (a, b) =>
      new Date(b.data.month.month || '').getTime() - new Date(a.data.month.month || '').getTime(),
  );
  const startDate = new Date(sortedMonths[sortedMonths.length - 1]?.data.month.month || '');
  const endDate = new Date(sortedMonths[0]?.data.month.month || '');
  const dateRange = `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (${months.length} months)`;

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
        current_balance: monthlySpending[0]?.balance || 0, // Most recent month's balance
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

function performBudgetHealthCheck(
  budget: ynab.BudgetDetail,
  currentMonth: ynab.MonthDetail,
  _recentTransactions: ynab.TransactionDetail[],
  includeRecommendations: boolean,
  analysisDateRange?: string,
) {
  const healthMetrics = {
    budget_utilization: calculateBudgetUtilization(currentMonth),
    overspent_categories: currentMonth.categories.filter((c) => c.balance < 0).length,
    underfunded_categories: currentMonth.categories.filter(
      (c) => c.budgeted === 0 && c.activity < 0,
    ).length,
    emergency_fund_status: calculateEmergencyFundStatus(budget.accounts || []),
    debt_to_asset_ratio: calculateDebtToAssetRatio(budget.accounts || []),
    unallocated_funds: ynab.utils.convertMilliUnitsToCurrencyAmount(currentMonth.to_be_budgeted),
  };

  const healthScore = calculateOverallHealthScore(healthMetrics);
  const subScores = calculateHealthSubScores(healthMetrics);

  return {
    analysis_period:
      analysisDateRange ||
      new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    health_score: healthScore,
    sub_scores: subScores,
    score_explanation: getHealthScoreExplanation(healthScore, subScores),
    metrics: healthMetrics,
    recommendations: includeRecommendations
      ? generateHealthRecommendations(healthMetrics, subScores)
      : [],
    last_assessment: new Date().toISOString(),
  };
}

function calculateEmergencyFundStatus(accounts: ynab.Account[]) {
  const savingsBalance = accounts
    .filter((a) => a.type === ynab.AccountType.Savings)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);

  return {
    current_amount: savingsBalance,
    recommended_minimum: 1000,
    status: savingsBalance >= 1000 ? 'adequate' : 'needs_improvement',
  };
}

function calculateDebtToAssetRatio(accounts: ynab.Account[]) {
  const assets = accounts
    .filter((a) => a.balance > 0)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);

  const debt = accounts
    .filter((a) => a.balance < 0)
    .reduce((sum, a) => sum + Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance)), 0);

  return assets > 0 ? (debt / assets) * 100 : 0;
}

// Enhanced health scoring with sub-scores and statistical methods
function calculateOverallHealthScore(metrics: FinancialMetrics): number {
  const subScores = calculateHealthSubScores(metrics);

  // Weighted average of sub-scores (weights based on financial importance)
  const weights = {
    spending: 0.3,
    debt: 0.25,
    emergency_fund: 0.2,
    budget_discipline: 0.25,
  };

  const weightedScore =
    subScores.spending_health * weights.spending +
    subScores.debt_health * weights.debt +
    subScores.emergency_fund_health * weights.emergency_fund +
    subScores.budget_discipline * weights.budget_discipline;

  return Math.round(Math.max(0, Math.min(100, weightedScore)));
}

function calculateHealthSubScores(metrics: FinancialMetrics): HealthSubScores {
  return {
    spending_health: calculateSpendingScore(metrics),
    debt_health: calculateDebtScore(metrics),
    emergency_fund_health: calculateEmergencyFundScore(metrics),
    budget_discipline: calculateBudgetDisciplineScore(metrics),
  };
}

function calculateSpendingScore(metrics: FinancialMetrics): number {
  let score = 100;

  // Overspent categories penalty (exponential impact)
  if (metrics.overspent_categories && metrics.overspent_categories > 0) {
    const penalty = Math.min(
      50,
      metrics.overspent_categories * 8 + Math.pow(metrics.overspent_categories, 1.5) * 2,
    );
    score -= penalty;
  }

  // Underfunded categories penalty
  if (metrics.underfunded_categories && metrics.underfunded_categories > 0) {
    score -= Math.min(20, metrics.underfunded_categories * 4);
  }

  return Math.max(0, score);
}

function calculateDebtScore(metrics: FinancialMetrics): number {
  let score = 100;

  // Use percentile-based scoring for debt-to-asset ratio
  if ((metrics.debt_to_asset_ratio ?? 0) > 0) {
    if ((metrics.debt_to_asset_ratio ?? 0) > 60)
      score -= 40; // Critical
    else if ((metrics.debt_to_asset_ratio ?? 0) > 40)
      score -= 25; // Poor
    else if ((metrics.debt_to_asset_ratio ?? 0) > 20) score -= 10; // Fair
    // Under 20% is considered healthy
  }

  return Math.max(0, score);
}

function calculateEmergencyFundScore(metrics: FinancialMetrics): number {
  const currentAmount = metrics.emergency_fund_status.current_amount;

  // Improved emergency fund scoring based on months of expenses
  if (currentAmount >= 15000) return 100; // 6+ months excellent
  if (currentAmount >= 7500) return 85; // 3-6 months good
  if (currentAmount >= 2500) return 70; // 1-3 months fair
  if (currentAmount >= 1000) return 50; // Basic emergency fund
  return 20; // Minimal emergency fund
}

function calculateBudgetDisciplineScore(metrics: FinancialMetrics): number {
  let score = 100;

  // Budget utilization scoring with better thresholds
  if ((metrics.budget_utilization ?? 0) > 105)
    score -= 30; // Significantly over budget
  else if ((metrics.budget_utilization ?? 0) > 95)
    score -= 10; // Slightly over budget
  else if ((metrics.budget_utilization ?? 0) < 60) score -= 15; // Under-utilizing budget

  // Unallocated funds penalty
  if ((metrics.unallocated_funds ?? 0) < -200)
    score -= 15; // Large negative balance
  else if ((metrics.unallocated_funds ?? 0) < -50) score -= 5; // Small negative balance

  return Math.max(0, score);
}

// Add consistency scoring using coefficient of variation
function calculateConsistencyScore(values: number[]): number {
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

// Simple confidence intervals using existing d3-array functions
function calculateScoreConfidence(scores: number[]): { lower: number; upper: number } {
  if (scores.length < 3) {
    return { lower: scores[0] || 0, upper: scores[0] || 100 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  return {
    lower: Math.round(quantile(sorted, 0.25) || 0), // 25th percentile
    upper: Math.round(quantile(sorted, 0.75) || 100), // 75th percentile
  };
}

// Export utility functions for potential future use
export { calculateConsistencyScore, calculateScoreConfidence };

function getHealthScoreExplanation(score: number, subScores?: HealthSubScores): string {
  let explanation = '';

  if (score >= 90)
    explanation = 'Excellent financial health with strong discipline across all areas';
  else if (score >= 75) explanation = 'Good financial health with some areas for optimization';
  else if (score >= 60) explanation = 'Fair financial health - focus needed on key areas';
  else if (score >= 40) explanation = 'Poor financial health - significant improvements required';
  else explanation = 'Critical financial health - immediate action needed';

  // Add specific sub-score insights
  if (subScores) {
    const weakestArea = Object.entries(subScores).sort(
      ([, a], [, b]) => (a as number) - (b as number),
    )[0];

    if (weakestArea && (weakestArea[1] as number) < 60) {
      const areaName = weakestArea[0].replace('_', ' ').replace('health', '').trim();
      explanation += `. Primary concern: ${areaName}`;
    }
  }

  return explanation;
}

function generateHealthRecommendations(
  metrics: FinancialMetrics,
  subScores: HealthSubScores,
): string[] {
  const recommendations = [];

  // Priority recommendations based on sub-scores
  const sortedScores = Object.entries(subScores).sort(
    ([, a], [, b]) => (a as number) - (b as number),
  );

  // Address lowest scoring areas first
  sortedScores.forEach(([area, score]) => {
    if ((score as number) < 70) {
      switch (area) {
        case 'spending_health':
          if (metrics.overspent_categories && metrics.overspent_categories > 0) {
            recommendations.push(
              `🚨 Address ${metrics.overspent_categories} overspent categories immediately`,
            );
          }
          if (metrics.underfunded_categories && metrics.underfunded_categories > 0) {
            recommendations.push(
              `📊 Budget for ${metrics.underfunded_categories} unfunded categories`,
            );
          }
          break;

        case 'debt_health':
          if (metrics.debt_to_asset_ratio && metrics.debt_to_asset_ratio > 40) {
            recommendations.push(
              `💳 High debt ratio (${metrics.debt_to_asset_ratio.toFixed(1)}%) - prioritize debt reduction`,
            );
          } else if (metrics.debt_to_asset_ratio && metrics.debt_to_asset_ratio > 20) {
            recommendations.push(`💰 Focus on debt reduction to improve financial stability`);
          }
          break;

        case 'emergency_fund_health': {
          const currentAmount = metrics.emergency_fund_status.current_amount;
          if (currentAmount < 1000) {
            recommendations.push(
              `🛡️ Build emergency fund - currently $${currentAmount.toFixed(0)}, target $2500+`,
            );
          } else if (currentAmount < 7500) {
            recommendations.push(
              `📈 Grow emergency fund to 6 months of expenses (currently $${currentAmount.toFixed(0)})`,
            );
          }
          break;
        }

        case 'budget_discipline': {
          if (metrics.budget_utilization && metrics.budget_utilization > 100) {
            recommendations.push(
              `⚠️ Over budget by ${(metrics.budget_utilization - 100).toFixed(1)}% - review spending`,
            );
          }
          if (metrics.unallocated_funds && metrics.unallocated_funds < -100) {
            recommendations.push(
              `🔄 Negative balance of $${Math.abs(metrics.unallocated_funds).toFixed(0)} needs addressing`,
            );
          }
          break;
        }
      }
    }
  });

  // Add positive reinforcement for high-performing areas
  const bestArea = sortedScores[sortedScores.length - 1];
  if (bestArea && (bestArea[1] as number) >= 85) {
    const areaName = bestArea[0].replace('_health', '').replace('_', ' ');
    recommendations.push(`✅ Strong ${areaName} performance - maintain current habits`);
  }

  return recommendations.slice(0, 5); // Limit to top 5 recommendations
}
