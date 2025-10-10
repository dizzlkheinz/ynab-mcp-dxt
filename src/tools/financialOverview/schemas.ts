import { z } from 'zod/v4';

/**
 * Schema for financial overview tool parameters
 * - budget_id: Optional budget ID, defaults to default budget
 * - months: Number of months to analyze (1-12), defaults to 3
 * - include_insights: Whether to include financial insights, defaults to true
 */
export const FinancialOverviewSchema = z
  .object({
    budget_id: z.string().optional(),
    months: z.number().int().min(1).max(12).default(3),
    include_insights: z.boolean().default(true),
  })
  .strict();

/**
 * Schema for spending analysis tool parameters
 * - budget_id: Optional budget ID, defaults to default budget
 * - period_months: Number of months to analyze (1-12), defaults to 6
 * - category_id: Optional specific category to analyze
 */
export const SpendingAnalysisSchema = z
  .object({
    budget_id: z.string().optional(),
    period_months: z.number().int().min(1).max(12).default(6),
    category_id: z.string().optional(),
  })
  .strict();

/**
 * Schema for budget health check tool parameters
 * - budget_id: Optional budget ID, defaults to default budget
 * - include_recommendations: Whether to include health recommendations, defaults to true
 */
export const BudgetHealthSchema = z
  .object({
    budget_id: z.string().optional(),
    include_recommendations: z.boolean().default(true),
  })
  .strict();

/**
 * Type definitions inferred from schemas
 */
export type FinancialOverviewParams = z.infer<typeof FinancialOverviewSchema>;
export type SpendingAnalysisParams = z.infer<typeof SpendingAnalysisSchema>;
export type BudgetHealthParams = z.infer<typeof BudgetHealthSchema>;

/**
 * Interface for spending trend analysis results
 * - category: Name of the category
 * - categoryId: YNAB ID of the category
 * - currentPeriod: Spending amount in current period
 * - previousPeriod: Spending amount in previous period
 * - percentChange: Percentage change between periods
 * - trend: Direction of the trend (increasing/decreasing/stable)
 * - significance: Statistical significance level (high/medium/low)
 * - explanation: Human-readable explanation of the trend
 * - data_points: Number of data points used in analysis
 * - reliability_score: Reliability score (0-100) based on data consistency
 */
export interface SpendingTrend {
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

/**
 * Interface for monthly budget data structure
 * Wraps YNAB API month data with categories
 */
export interface MonthData {
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

/**
 * Interface for financial health metrics
 * Contains all metrics used for health scoring and insights
 */
export interface FinancialMetrics {
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

/**
 * Interface for health score breakdown
 * Contains individual sub-scores for different financial health areas
 * - spending_health: Score based on overspending and category management
 * - debt_health: Score based on debt-to-asset ratio
 * - emergency_fund_health: Score based on emergency fund adequacy
 * - budget_discipline: Score based on budget utilization and unallocated funds
 */
export interface HealthSubScores {
  spending_health: number;
  debt_health: number;
  emergency_fund_health: number;
  budget_discipline: number;
}

/**
 * Interface for budget insights and recommendations
 * - type: Insight type indicating severity/nature
 * - category: Functional category of the insight
 * - title: Brief title describing the insight
 * - description: Detailed description of the insight
 * - impact: Expected impact level of addressing this insight
 * - actionable: Whether the insight provides actionable recommendations
 * - suggestions: Optional array of specific action suggestions
 */
export interface BudgetInsight {
  type: 'warning' | 'success' | 'info' | 'recommendation';
  category: 'spending' | 'budgeting' | 'goals' | 'efficiency';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  suggestions?: string[];
}
