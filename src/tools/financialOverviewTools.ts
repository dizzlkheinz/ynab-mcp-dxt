import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { cacheManager, CACHE_TTLS } from '../server/cacheManager.js';

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

export const CashFlowForecastSchema = z.object({
  budget_id: z.string().optional(),
  forecast_months: z.number().min(1).max(12).default(3),
});

export const BudgetHealthSchema = z.object({
  budget_id: z.string().optional(),
  include_recommendations: z.boolean().default(true),
});

export type FinancialOverviewParams = z.infer<typeof FinancialOverviewSchema>;
export type SpendingAnalysisParams = z.infer<typeof SpendingAnalysisSchema>;
export type CashFlowForecastParams = z.infer<typeof CashFlowForecastSchema>;
export type BudgetHealthParams = z.infer<typeof BudgetHealthSchema>;

interface SpendingTrend {
  category: string;
  categoryId: string;
  currentPeriod: number;
  previousPeriod: number;
  percentChange: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  significance: 'high' | 'medium' | 'low';
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
  params: FinancialOverviewParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const budgetId = params.budget_id || await getDefaultBudgetId(ynabAPI);
    const cacheKey = `financial-overview:${budgetId}:${params.months}:${params.include_trends}:${params.include_insights}`;
    
    const cached = cacheManager.get<any>(cacheKey);
    if (cached) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...cached, cached: true }, null, 2)
        }]
      };
    }

    const currentDate = new Date();
    const monthsToFetch = Array.from({ length: params.months }, (_, i) => {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      return ynab.utils.getCurrentMonthInISOFormat();
    });

    const [budget, transactions, months] = await Promise.all([
      ynabAPI.budgets.getBudgetById(budgetId),
      ynabAPI.transactions.getTransactions(budgetId, monthsToFetch[0]),
      Promise.all(monthsToFetch.map(month => 
        ynabAPI.months.getBudgetMonth(budgetId, month).catch(() => null)
      ))
    ]);

    const validMonths = months.filter(m => m !== null);
    const accountBalances = calculateAccountBalances(budget.data.budget.accounts || []);
    const categoryAnalysis = analyzeCategoryPerformance(validMonths, budget.data.budget.categories || []);
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
        trends
      );
    }

    const overview = {
      summary: {
        period: `${params.months} months`,
        last_updated: new Date().toISOString(),
        budget_name: budget.data.budget.name,
        net_worth: accountBalances.netWorth,
        liquid_assets: accountBalances.liquidAssets,
        debt: accountBalances.totalDebt,
      },
      current_month: validMonths[0] ? {
        month: validMonths[0].data.month.month,
        income: validMonths[0].data.month.income,
        budgeted: validMonths[0].data.month.budgeted,
        activity: validMonths[0].data.month.activity,
        to_be_budgeted: validMonths[0].data.month.to_be_budgeted,
        budget_utilization: calculateBudgetUtilization(validMonths[0].data.month),
      } : null,
      account_overview: {
        total_accounts: budget.data.budget.accounts?.length || 0,
        on_budget_accounts: budget.data.budget.accounts?.filter(a => a.on_budget).length || 0,
        checking_balance: accountBalances.checkingBalance,
        savings_balance: accountBalances.savingsBalance,
        credit_card_balance: accountBalances.creditCardBalance,
        investment_balance: accountBalances.investmentBalance,
      },
      category_performance: categoryAnalysis,
      net_worth_trend: netWorthTrend,
      spending_trends: trends,
      insights: insights,
    };

    cacheManager.set(cacheKey, overview, CACHE_TTLS.MONTHS);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(overview, null, 2)
      }]
    };
  }, 'ynab:financial-overview', 'generating financial overview');
}

export async function handleSpendingAnalysis(
  ynabAPI: ynab.API,
  params: SpendingAnalysisParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const budgetId = params.budget_id || await getDefaultBudgetId(ynabAPI);
    
    const currentDate = new Date();
    const monthsToAnalyze = Array.from({ length: params.period_months }, (_, i) => {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      return ynab.utils.getCurrentMonthInISOFormat();
    });

    const [budget, monthsData] = await Promise.all([
      ynabAPI.budgets.getBudgetById(budgetId),
      Promise.all(monthsToAnalyze.map(month => 
        ynabAPI.months.getBudgetMonth(budgetId, month).catch(() => null)
      ))
    ]);

    const validMonths = monthsData.filter(m => m !== null);
    const analysis = performDetailedSpendingAnalysis(validMonths, budget.data.budget.categories || [], params.category_id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(analysis, null, 2)
      }]
    };
  }, 'ynab:spending-analysis', 'analyzing spending patterns');
}

export async function handleCashFlowForecast(
  ynabAPI: ynab.API,
  params: CashFlowForecastParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const budgetId = params.budget_id || await getDefaultBudgetId(ynabAPI);
    
    const currentDate = new Date();
    const historicalMonths = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i - 1);
      return ynab.utils.getCurrentMonthInISOFormat();
    });

    const [budget, scheduledTransactions, historicalData] = await Promise.all([
      ynabAPI.budgets.getBudgetById(budgetId),
      ynabAPI.scheduledTransactions.getScheduledTransactions(budgetId),
      Promise.all(historicalMonths.map(month => 
        ynabAPI.months.getBudgetMonth(budgetId, month).catch(() => null)
      ))
    ]);

    const forecast = generateCashFlowForecast(
      budget.data.budget,
      scheduledTransactions.data.scheduled_transactions,
      historicalData.filter(m => m !== null),
      params.forecast_months
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(forecast, null, 2)
      }]
    };
  }, 'ynab:cash-flow-forecast', 'generating cash flow forecast');
}

export async function handleBudgetHealthCheck(
  ynabAPI: ynab.API,
  params: BudgetHealthParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const budgetId = params.budget_id || await getDefaultBudgetId(ynabAPI);
    
    const currentMonth = ynab.utils.getCurrentMonthInISOFormat();
    const [budget, currentMonthData, recentTransactions] = await Promise.all([
      ynabAPI.budgets.getBudgetById(budgetId),
      ynabAPI.months.getBudgetMonth(budgetId, currentMonth),
      ynabAPI.transactions.getTransactions(budgetId, currentMonth)
    ]);

    const healthCheck = performBudgetHealthCheck(
      budget.data.budget,
      currentMonthData.data.month,
      recentTransactions.data.transactions,
      params.include_recommendations
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(healthCheck, null, 2)
      }]
    };
  }, 'ynab:budget-health-check', 'performing budget health check');
}

async function getDefaultBudgetId(ynabAPI: ynab.API): Promise<string> {
  const budgets = await ynabAPI.budgets.getBudgets();
  const defaultBudget = budgets.data.budgets.find(b => !b.name.includes('Template'));
  return defaultBudget?.id || budgets.data.budgets[0]?.id || '';
}

function calculateAccountBalances(accounts: ynab.Account[]) {
  const balances = {
    netWorth: 0,
    liquidAssets: 0,
    totalDebt: 0,
    checkingBalance: 0,
    savingsBalance: 0,
    creditCardBalance: 0,
    investmentBalance: 0,
  };

  accounts.forEach(account => {
    const balance = ynab.utils.convertMilliUnitsToCurrencyAmount(account.balance);
    
    if (account.on_budget) {
      balances.netWorth += balance;
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
      default:
        if (account.type.includes('investment')) {
          balances.investmentBalance += balance;
        }
        break;
    }
  });

  return balances;
}

function analyzeCategoryPerformance(months: any[], categories: ynab.Category[]) {
  const performance = categories.map(category => {
    const monthlyData = months.map(monthData => {
      const monthCategory = monthData?.data?.month?.categories?.find((c: any) => c.id === category.id);
      return monthCategory ? {
        budgeted: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted),
        activity: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity),
        balance: ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.balance),
      } : null;
    }).filter((data): data is NonNullable<typeof data> => data !== null);

    const avgBudgeted = monthlyData.reduce((sum, data) => sum + data.budgeted, 0) / (monthlyData.length || 1);
    const avgActivity = monthlyData.reduce((sum, data) => sum + Math.abs(data.activity), 0) / (monthlyData.length || 1);
    const utilizationRate = avgBudgeted > 0 ? (avgActivity / avgBudgeted) * 100 : 0;

    return {
      category_name: category.name,
      category_id: category.id,
      average_budgeted: avgBudgeted,
      average_spent: avgActivity,
      utilization_rate: utilizationRate,
      performance: utilizationRate > 100 ? 'over_budget' : utilizationRate > 80 ? 'on_track' : 'under_budget',
      monthly_data: monthlyData,
    };
  });

  return performance.filter(p => p.average_budgeted > 0 || p.average_spent > 0);
}

function calculateNetWorthTrend(months: any[], currentBalances: any) {
  return {
    current: currentBalances.netWorth,
    historical: months.map((monthData, index) => ({
      month: monthData?.data.month.month,
      net_worth: currentBalances.netWorth,
      change_from_previous: index < months.length - 1 ? 0 : 0,
    })),
    trend: 'stable',
  };
}

function analyzeSpendingTrends(months: any[], categories: ynab.Category[]): SpendingTrend[] {
  const trends: SpendingTrend[] = [];

  categories.forEach(category => {
    const recentActivity = months.slice(0, 2).map(monthData => {
      const monthCategory = monthData?.data.month.categories.find((c: any) => c.id === category.id);
      return monthCategory ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity)) : 0;
    });

    const olderActivity = months.slice(2, 4).map(monthData => {
      const monthCategory = monthData?.data.month.categories.find((c: any) => c.id === category.id);
      return monthCategory ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity)) : 0;
    });

    const currentAvg = recentActivity.reduce((sum, val) => sum + val, 0) / recentActivity.length;
    const previousAvg = olderActivity.reduce((sum, val) => sum + val, 0) / olderActivity.length;

    if (currentAvg > 0 || previousAvg > 0) {
      const percentChange = previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg) * 100 : 0;
      
      trends.push({
        category: category.name,
        categoryId: category.id,
        currentPeriod: currentAvg,
        previousPeriod: previousAvg,
        percentChange,
        trend: Math.abs(percentChange) < 5 ? 'stable' : percentChange > 0 ? 'increasing' : 'decreasing',
        significance: Math.abs(percentChange) > 25 ? 'high' : Math.abs(percentChange) > 10 ? 'medium' : 'low',
      });
    }
  });

  return trends.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
}

function generateFinancialInsights(
  months: any[],
  budget: ynab.BudgetDetail,
  _transactions: ynab.TransactionDetail[],
  trends: SpendingTrend[]
): BudgetInsight[] {
  const insights: BudgetInsight[] = [];

  if (months[0]) {
    const currentMonth = months[0].data.month;
    if (currentMonth.to_be_budgeted > 0) {
      insights.push({
        type: 'info',
        category: 'budgeting',
        title: 'Unallocated Funds Available',
        description: `You have $${ynab.utils.convertMilliUnitsToCurrencyAmount(currentMonth.to_be_budgeted).toFixed(2)} ready to be budgeted.`,
        impact: 'medium',
        actionable: true,
        suggestions: ['Allocate funds to priority categories', 'Build your emergency fund', 'Increase savings goals'],
      });
    }
  }

  const highIncreasingTrends = trends.filter(t => t.trend === 'increasing' && t.significance === 'high');
  highIncreasingTrends.forEach(trend => {
    insights.push({
      type: 'warning',
      category: 'spending',
      title: `Significant Increase in ${trend.category}`,
      description: `Spending in ${trend.category} has increased by ${trend.percentChange.toFixed(1)}% compared to previous periods.`,
      impact: 'high',
      actionable: true,
      suggestions: ['Review recent transactions in this category', 'Consider adjusting the budget allocation', 'Look for subscription changes or one-time expenses'],
    });
  });

  const overspentCategories = budget.categories?.filter(category => {
    const monthCategory = months[0]?.data?.month?.categories?.find((c: any) => c.id === category.id);
    return monthCategory && monthCategory.balance < 0;
  }) || [];

  if (overspentCategories.length > 0) {
    insights.push({
      type: 'warning',
      category: 'budgeting',
      title: 'Overspent Categories Detected',
      description: `${overspentCategories.length} categories are currently overspent.`,
      impact: 'high',
      actionable: true,
      suggestions: ['Move money from other categories', 'Reduce spending in overspent categories', 'Adjust budget allocations for next month'],
    });
  }

  const underutilizedCategories = trends.filter(t => t.currentPeriod > 0 && t.trend === 'decreasing' && t.significance === 'high');
  if (underutilizedCategories.length > 0) {
    insights.push({
      type: 'success',
      category: 'efficiency',
      title: 'Potential Budget Reallocation Opportunity',
      description: `Several categories show significant spending decreases, suggesting possible budget reallocation opportunities.`,
      impact: 'medium',
      actionable: true,
      suggestions: ['Consider reallocating unused budgets to goals', 'Review if budget amounts are still appropriate', 'Increase allocations to priority areas'],
    });
  }

  return insights;
}

function calculateBudgetUtilization(month: ynab.MonthDetail): number {
  if (!month.budgeted || month.budgeted === 0) return 0;
  return (Math.abs(month.activity) / month.budgeted) * 100;
}

function performDetailedSpendingAnalysis(months: any[], categories: ynab.Category[], categoryId?: string) {
  const targetCategories = categoryId 
    ? categories.filter(c => c.id === categoryId)
    : categories;

  return {
    period: `${months.length} months`,
    category_analysis: targetCategories.map(category => {
      const monthlySpending = months.map(monthData => {
        const monthCategory = monthData?.data.month.categories.find((c: any) => c.id === category.id);
        return {
          month: monthData?.data.month.month,
          budgeted: monthCategory ? ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.budgeted) : 0,
          activity: monthCategory ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.activity)) : 0,
          balance: monthCategory ? ynab.utils.convertMilliUnitsToCurrencyAmount(monthCategory.balance) : 0,
        };
      });

      const totalSpent = monthlySpending.reduce((sum, month) => sum + month.activity, 0);
      const avgMonthlySpending = totalSpent / months.length;
      const maxSpending = Math.max(...monthlySpending.map(m => m.activity));
      const minSpending = Math.min(...monthlySpending.map(m => m.activity));
      
      // Calculate coefficient of variation (CV) as a proper measure of variability
      const spendingValues = monthlySpending.map(m => m.activity);
      const variance = spendingValues.reduce((sum, value) => sum + Math.pow(value - avgMonthlySpending, 2), 0) / spendingValues.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation = avgMonthlySpending > 0 ? (standardDeviation / avgMonthlySpending) * 100 : 0;

      return {
        category_name: category.name,
        total_spent: totalSpent,
        average_monthly: avgMonthlySpending,
        max_monthly: maxSpending,
        min_monthly: minSpending,
        variability: coefficientOfVariation,
        monthly_breakdown: monthlySpending,
      };
    }).filter(analysis => analysis.total_spent > 0),
  };
}

function generateCashFlowForecast(
  _budget: ynab.BudgetDetail,
  scheduledTransactions: ynab.ScheduledTransactionDetail[],
  historicalMonths: any[],
  forecastMonths: number
) {
  const forecast = [];
  const currentDate = new Date();

  for (let i = 1; i <= forecastMonths; i++) {
    const forecastDate = new Date(currentDate);
    forecastDate.setMonth(forecastDate.getMonth() + i);
    const monthKey = ynab.utils.getCurrentMonthInISOFormat();

    const scheduledIncome = scheduledTransactions
      .filter(st => st.amount > 0)
      .reduce((sum, st) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(st.amount), 0);

    const scheduledExpenses = scheduledTransactions
      .filter(st => st.amount < 0)
      .reduce((sum, st) => sum + Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(st.amount)), 0);

    const avgHistoricalIncome = historicalMonths.reduce((sum, month) => {
      return sum + (month ? ynab.utils.convertMilliUnitsToCurrencyAmount(month.data.month.income) : 0);
    }, 0) / historicalMonths.filter(m => m !== null).length;

    const avgHistoricalExpenses = historicalMonths.reduce((sum, month) => {
      return sum + (month ? Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(month.data.month.activity)) : 0);
    }, 0) / historicalMonths.filter(m => m !== null).length;

    const projectedIncome = Math.max(scheduledIncome, avgHistoricalIncome);
    const projectedExpenses = Math.max(scheduledExpenses, avgHistoricalExpenses);
    const netCashFlow = projectedIncome - projectedExpenses;

    forecast.push({
      month: monthKey,
      projected_income: projectedIncome,
      projected_expenses: projectedExpenses,
      net_cash_flow: netCashFlow,
      confidence: scheduledTransactions.length > 0 ? 'high' : 'medium',
    });
  }

  return {
    forecast_period: `${forecastMonths} months`,
    projections: forecast,
    scheduled_transactions_count: scheduledTransactions.length,
    assumptions: [
      'Based on historical averages and scheduled transactions',
      'Does not account for irregular expenses or income changes',
      'Confidence levels: high (scheduled data), medium (historical averages)',
    ],
  };
}

function performBudgetHealthCheck(
  budget: ynab.BudgetDetail,
  currentMonth: ynab.MonthDetail,
  _recentTransactions: ynab.TransactionDetail[],
  includeRecommendations: boolean
) {
  const healthMetrics = {
    budget_utilization: calculateBudgetUtilization(currentMonth),
    overspent_categories: currentMonth.categories.filter(c => c.balance < 0).length,
    underfunded_categories: currentMonth.categories.filter(c => c.budgeted === 0 && c.activity < 0).length,
    emergency_fund_status: calculateEmergencyFundStatus(budget.accounts || []),
    debt_to_asset_ratio: calculateDebtToAssetRatio(budget.accounts || []),
    unallocated_funds: ynab.utils.convertMilliUnitsToCurrencyAmount(currentMonth.to_be_budgeted),
  };

  const healthScore = calculateOverallHealthScore(healthMetrics);
  
  const recommendations = includeRecommendations ? generateHealthRecommendations(healthMetrics, currentMonth) : [];

  return {
    health_score: healthScore,
    score_explanation: getHealthScoreExplanation(healthScore),
    metrics: healthMetrics,
    recommendations,
    last_assessment: new Date().toISOString(),
  };
}

function calculateEmergencyFundStatus(accounts: ynab.Account[]) {
  const savingsBalance = accounts
    .filter(a => a.type === ynab.AccountType.Savings)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);
  
  return {
    current_amount: savingsBalance,
    recommended_minimum: 1000,
    status: savingsBalance >= 1000 ? 'adequate' : 'needs_improvement',
  };
}

function calculateDebtToAssetRatio(accounts: ynab.Account[]) {
  const assets = accounts
    .filter(a => a.balance > 0)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);
    
  const debt = accounts
    .filter(a => a.balance < 0)
    .reduce((sum, a) => sum + Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance)), 0);

  return assets > 0 ? (debt / assets) * 100 : 0;
}

function calculateOverallHealthScore(metrics: any): number {
  let score = 100;

  if (metrics.budget_utilization > 100) score -= 20;
  else if (metrics.budget_utilization > 90) score -= 10;

  score -= metrics.overspent_categories * 5;
  score -= metrics.underfunded_categories * 3;

  if (metrics.emergency_fund_status.status === 'needs_improvement') score -= 15;

  if (metrics.debt_to_asset_ratio > 50) score -= 20;
  else if (metrics.debt_to_asset_ratio > 30) score -= 10;

  if (metrics.unallocated_funds < -100) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function getHealthScoreExplanation(score: number): string {
  if (score >= 90) return 'Excellent financial health with strong budgeting discipline';
  if (score >= 75) return 'Good financial health with minor areas for improvement';
  if (score >= 60) return 'Fair financial health - some attention needed';
  if (score >= 40) return 'Poor financial health - significant improvements needed';
  return 'Critical financial health issues require immediate attention';
}

function generateHealthRecommendations(metrics: any, _currentMonth: ynab.MonthDetail): string[] {
  const recommendations = [];

  if (metrics.overspent_categories > 0) {
    recommendations.push(`Address ${metrics.overspent_categories} overspent categories by moving funds or reducing spending`);
  }

  if (metrics.emergency_fund_status.status === 'needs_improvement') {
    recommendations.push('Build emergency fund to at least $1,000 for financial security');
  }

  if (metrics.debt_to_asset_ratio > 30) {
    recommendations.push('Focus on debt reduction to improve your debt-to-asset ratio');
  }

  if (metrics.unallocated_funds > 100) {
    recommendations.push('Allocate unbudgeted funds to priority categories or savings goals');
  }

  if (metrics.budget_utilization < 50) {
    recommendations.push('Review budget allocations - you may be over-budgeting in some categories');
  }

  if (metrics.underfunded_categories > 0) {
    recommendations.push('Budget for categories that are experiencing spending without allocation');
  }

  return recommendations;
}