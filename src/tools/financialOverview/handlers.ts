import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { withToolErrorHandling } from '../../types/index.js';
import { cacheManager, CACHE_TTLS } from '../../server/cacheManager.js';
import { getHistoricalMonths } from '../../utils/dateUtils.js';
import type {
  FinancialOverviewParams,
  SpendingAnalysisParams,
  BudgetHealthParams,
  BudgetInsight,
} from './schemas.js';
import {
  calculateAccountBalances,
  analyzeCategoryPerformance,
  calculateNetWorthTrend,
} from './formatter.js';
import {
  generateFinancialInsights,
  calculateOverallHealthScore,
  calculateHealthSubScores,
  calculateEmergencyFundStatus,
  calculateDebtToAssetRatio,
  getHealthScoreExplanation,
  generateHealthRecommendations,
} from './insightGenerator.js';
import {
  buildFinancialOverviewResponse,
  buildSpendingAnalysisResponse,
  buildBudgetHealthResponse,
  calculateBudgetUtilization,
  performDetailedSpendingAnalysis,
  performBudgetHealthCheck,
  formatAccountBalances,
  formatSpendingTrends,
} from './formatter.js';

/**
 * Defines the shape of the data stored in the cache for financial overviews.
 * This ensures type safety when retrieving cached data.
 * @interface FinancialOverviewCacheEntry
 */
interface FinancialOverviewCacheEntry {
  overview: Record<string, unknown>;
  summary: Record<string, unknown>;
  current_month: Record<string, unknown> | null;
  account_overview: Record<string, unknown>;
  category_performance: Record<string, unknown>[];
  net_worth_trend: Record<string, unknown>;
  spending_trends: Record<string, unknown>;
  insights: BudgetInsight[];
  version?: number;
}

/**
 * Main handler for financial overview tool.
 * Orchestrates data fetching, analysis, and response formatting.
 * @internal This handler assumes normalized parameters and requires a valid budget_id.
 */
export async function handleFinancialOverview(
  ynabAPI: ynab.API,
  params: FinancialOverviewParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      // Budget ID is validated and normalized by the registry wrapper, but verify at runtime for type safety
      if (!params.budget_id || typeof params.budget_id !== 'string') {
        throw new Error('Budget ID is required and must be a string');
      }
      const budgetId = params.budget_id;
      const cacheKey = `financial-overview:${budgetId}:${params.months}:${params.include_insights}`;

      const cached = cacheManager.get<FinancialOverviewCacheEntry>(cacheKey);
      if (cached) {
        return buildFinancialOverviewResponse({ ...cached, cached: true });
      }

      const monthsToFetch = getHistoricalMonths(params.months);

      const [budget, months] = await Promise.all([
        ynabAPI.budgets.getBudgetById(budgetId),
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

      let insights: BudgetInsight[] = [];

      if (params.include_insights) {
        insights = generateFinancialInsights(validMonths, budget.data.budget, []);
      }

      // Generate clear date range for summary
      const sortedMonths = [...validMonths].sort(
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

      const summary = {
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
      };

      const result = {
        overview: {
          budgetName: summary.budget_name,
          analysisPeriod: summary.analysis_period,
          period: summary.period,
          lastUpdated: summary.last_updated,
          liquidNetWorth: summary.liquid_net_worth,
          totalNetWorth: summary.total_net_worth,
          liquidAssets: summary.liquid_assets,
          totalAssets: summary.total_assets,
          totalLiabilities: summary.total_liabilities,
          debt: summary.debt,
        },
        summary,
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
        account_overview: formatAccountBalances(
          accountBalances,
          budget.data.budget.accounts?.length || 0,
          budget.data.budget.accounts?.filter((a) => a.on_budget).length || 0,
        ),
        category_performance: categoryAnalysis,
        net_worth_trend: netWorthTrend,
        spending_trends: formatSpendingTrends([]),
        insights: insights,
      };

      cacheManager.set(cacheKey, result, CACHE_TTLS.MONTHS);

      return buildFinancialOverviewResponse(result);
    },
    'ynab:financial-overview',
    'generating financial overview',
  );
}

/**
 * Handler for spending analysis tool.
 * Provides detailed spending patterns and variability analysis.
 * @internal This handler assumes normalized parameters and requires a valid budget_id.
 */
export async function handleSpendingAnalysis(
  ynabAPI: ynab.API,
  params: SpendingAnalysisParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      // Budget ID is validated and normalized by the registry wrapper, but verify at runtime for type safety
      if (!params.budget_id || typeof params.budget_id !== 'string') {
        throw new Error('Budget ID is required and must be a string');
      }
      const budgetId = params.budget_id;

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

      return buildSpendingAnalysisResponse(analysis);
    },
    'ynab:spending-analysis',
    'analyzing spending patterns',
  );
}

/**
 * Handler for budget health check tool.
 * Assesses financial health with scoring and recommendations.
 * @internal This handler assumes normalized parameters and requires a valid budget_id.
 */
export async function handleBudgetHealthCheck(
  ynabAPI: ynab.API,
  params: BudgetHealthParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      // Budget ID is validated and normalized by the registry wrapper, but verify at runtime for type safety
      if (!params.budget_id || typeof params.budget_id !== 'string') {
        throw new Error('Budget ID is required and must be a string');
      }
      const budgetId = params.budget_id;

      const currentMonth = ynab.utils.getCurrentMonthInISOFormat();
      const [budget, currentMonthData] = await Promise.all([
        ynabAPI.budgets.getBudgetById(budgetId),
        ynabAPI.months.getBudgetMonth(budgetId, currentMonth),
      ]);

      // Generate clear date range for the analysis period
      const analysisDate = new Date(currentMonthData.data.month.month);
      const analysisDateRange = analysisDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      // Calculate health metrics
      const healthMetrics = {
        budget_utilization: calculateBudgetUtilization(currentMonthData.data.month),
        overspent_categories: currentMonthData.data.month.categories.filter((c) => c.balance < 0)
          .length,
        underfunded_categories: currentMonthData.data.month.categories.filter(
          (c) => c.budgeted === 0 && c.activity < 0,
        ).length,
        emergency_fund_status: calculateEmergencyFundStatus(budget.data.budget.accounts || []),
        debt_to_asset_ratio: calculateDebtToAssetRatio(budget.data.budget.accounts || []),
        unallocated_funds: ynab.utils.convertMilliUnitsToCurrencyAmount(
          currentMonthData.data.month.to_be_budgeted,
        ),
      };

      const healthScore = calculateOverallHealthScore(healthMetrics);
      const subScores = calculateHealthSubScores(healthMetrics);
      const scoreExplanation = getHealthScoreExplanation(healthScore, subScores);
      const recommendations = params.include_recommendations
        ? generateHealthRecommendations(healthMetrics, subScores)
        : [];

      const healthCheck = performBudgetHealthCheck(
        params.include_recommendations,
        analysisDateRange,
        healthMetrics,
        healthScore,
        subScores,
        scoreExplanation,
        recommendations,
      );

      return buildBudgetHealthResponse(healthCheck);
    },
    'ynab:budget-health-check',
    'performing budget health check',
  );
}
