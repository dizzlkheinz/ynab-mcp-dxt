import * as ynab from 'ynab';
import type {
  SpendingTrend,
  MonthData,
  BudgetInsight,
  FinancialMetrics,
  HealthSubScores,
} from './schemas.js';

/**
 * Generate actionable financial insights based on budget data and spending trends
 * Identifies opportunities for budget optimization and areas of concern
 */
export function generateFinancialInsights(
  months: MonthData[],
  budget: ynab.BudgetDetail,
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
      description: `${exceededMonthlyBudget.length} categories spent more than this period's budget assignment but were covered by funds accumulated from previous months. This is healthy YNAB behavior. Total: $${totalOverAssignment.toFixed(2)} over monthly assignments.`,
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

  const highDecreasingTrends = trends.filter(
    (t) => t.trend === 'decreasing' && t.significance === 'high',
  );
  highDecreasingTrends.forEach((trend) => {
    insights.push({
      type: 'success',
      category: 'spending',
      title: `Decreasing Spending Trend in ${trend.category}`,
      description: `Spending in ${trend.category} has decreased by ${trend.percentChange.toFixed(1)}% compared to previous periods.`,
      impact: 'high',
      actionable: true,
      suggestions: [
        'Keep up the great work!',
        'Consider reallocating these savings to other goals.',
      ],
    });
  });

  // Generate budget optimization insights
  const budgetOptimization = generateBudgetOptimizationInsights(months, trends, budget);
  insights.push(...budgetOptimization);

  return insights;
}

/**
 * Generate budget optimization insights based on spending patterns and trends
 * Identifies opportunities for reallocation and efficiency improvements
 */
export function generateBudgetOptimizationInsights(
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
      description: `${largeUnusedBalances.length} categories have substantial unused funds totaling $${totalUnused.toFixed(2)}. These could be reallocated to goals or priorities.`,
      impact: 'medium',
      actionable: true,
      suggestions: [
        'Consider if these balances are intentional (sinking funds, emergency categories)',
        'Move excess funds to debt payoff or savings goals',
        'Reduce future budget assignments if funds consistently go unused',
        `Largest balances: ${largeUnusedBalances
          .slice(0, 3)
          .map((c) => `${c.name} ($${c.balance.toFixed(2)})`)
          .join(', ')}`,
      ],
    });
  }

  return insights;
}

/**
 * Calculate overall health score as weighted average of sub-scores
 * Uses financial importance weights for different health areas
 */
export function calculateOverallHealthScore(metrics: FinancialMetrics): number {
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

/**
 * Calculate individual health sub-scores for different financial areas
 * Provides detailed breakdown of health metrics
 */
export function calculateHealthSubScores(metrics: FinancialMetrics): HealthSubScores {
  return {
    spending_health: calculateSpendingScore(metrics),
    debt_health: calculateDebtScore(metrics),
    emergency_fund_health: calculateEmergencyFundScore(metrics),
    budget_discipline: calculateBudgetDisciplineScore(metrics),
  };
}

/**
 * Calculate spending health score based on overspent and underfunded categories
 * Uses exponential penalties for multiple overspent categories
 */
export function calculateSpendingScore(metrics: FinancialMetrics): number {
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

/**
 * Calculate debt health score based on debt-to-asset ratio
 * Uses percentile-based scoring thresholds
 */
export function calculateDebtScore(metrics: FinancialMetrics): number {
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

/**
 * Calculate emergency fund health score based on fund adequacy
 * Improved scoring based on months of expenses coverage
 */
export function calculateEmergencyFundScore(metrics: FinancialMetrics): number {
  const currentAmount = metrics.emergency_fund_status.current_amount;

  // Improved emergency fund scoring based on months of expenses
  if (currentAmount >= 15000) return 100; // 6+ months excellent
  if (currentAmount >= 7500) return 85; // 3-6 months good
  if (currentAmount >= 2500) return 70; // 1-3 months fair
  if (currentAmount >= 1000) return 50; // Basic emergency fund
  return 20; // Minimal emergency fund
}

/**
 * Calculate budget discipline score based on utilization and allocation
 * Penalizes over-budget spending and poor fund allocation
 */
export function calculateBudgetDisciplineScore(metrics: FinancialMetrics): number {
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

/**
 * Calculate emergency fund status with current amount and recommendations
 * Assesses adequacy based on common financial guidelines
 */
export function calculateEmergencyFundStatus(accounts: ynab.Account[]) {
  const savingsBalance = accounts
    .filter((a) => a.type === ynab.AccountType.Savings)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);

  return {
    current_amount: savingsBalance,
    recommended_minimum: 1000,
    status: savingsBalance >= 1000 ? 'adequate' : 'needs_improvement',
  };
}

/**
 * Calculate debt-to-asset ratio for debt health assessment
 * Provides percentage of debt relative to total assets
 */
export function calculateDebtToAssetRatio(accounts: ynab.Account[]) {
  const assets = accounts
    .filter((a) => a.balance > 0)
    .reduce((sum, a) => sum + ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance), 0);

  const debt = accounts
    .filter((a) => a.balance < 0)
    .reduce((sum, a) => sum + Math.abs(ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance)), 0);

  return assets > 0 ? (debt / assets) * 100 : 0;
}

/**
 * Generate textual explanation of health score
 * Provides context and identifies weakest areas for improvement
 */
export function getHealthScoreExplanation(score: number, subScores?: HealthSubScores): string {
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

/**
 * Generate prioritized health recommendations based on sub-scores
 * Focuses on lowest scoring areas first for maximum impact
 */
export function generateHealthRecommendations(
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
