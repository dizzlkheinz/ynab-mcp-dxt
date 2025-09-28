/**
 * Financial Overview Module - Barrel Export
 *
 * This module provides comprehensive financial analysis tools for YNAB budgets,
 * decomposed into focused modules for better maintainability and testing.
 *
 * Architecture:
 * - schemas.ts: Shared type definitions and validation schemas
 * - trendAnalysis.ts: Pure functions for trend calculations and statistical analysis
 * - insightGenerator.ts: Business logic for insights and health scoring
 * - formatter.ts: Response formatting and utility functions
 * - handlers.ts: Main orchestration logic that coordinates all modules
 *
 * This barrel export maintains 100% backward compatibility with the original
 * monolithic financialOverviewTools.ts implementation.
 */

// Re-export schemas and types for backward compatibility
export { FinancialOverviewSchema, SpendingAnalysisSchema, BudgetHealthSchema } from './schemas.js';

export type {
  FinancialOverviewParams,
  SpendingAnalysisParams,
  BudgetHealthParams,
  SpendingTrend,
  MonthData,
  FinancialMetrics,
  HealthSubScores,
  BudgetInsight,
} from './schemas.js';

// Re-export main handler functions (primary exports for external consumers)
export {
  handleFinancialOverview,
  handleSpendingAnalysis,
  handleBudgetHealthCheck,
} from './handlers.js';

// Re-export utility functions for sharing with prompts and other modules
export {
  calculateAccountBalances,
  analyzeCategoryPerformance,
  calculateNetWorthTrend,
  analyzeSpendingTrends,
  calculateConsistencyScore,
  calculateScoreConfidence,
} from './trendAnalysis.js';

export {
  generateFinancialInsights,
  generateBudgetOptimizationInsights,
  calculateOverallHealthScore,
  calculateHealthSubScores,
  calculateSpendingScore,
  calculateDebtScore,
  calculateEmergencyFundScore,
  calculateBudgetDisciplineScore,
  calculateEmergencyFundStatus,
  calculateDebtToAssetRatio,
  getHealthScoreExplanation,
  generateHealthRecommendations,
} from './insightGenerator.js';

export {
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
} from './formatter.js';

/**
 * Usage Examples:
 *
 * // Main handlers (most common usage)
 * import { handleFinancialOverview, FinancialOverviewSchema } from './financialOverview/index.js';
 *
 * // Utility functions for prompts module
 * import { calculateAccountBalances, formatCurrency } from './financialOverview/index.js';
 *
 * // Types for other modules
 * import type { SpendingTrend, BudgetInsight } from './financialOverview/index.js';
 *
 * // Backward compatibility - existing imports continue to work
 * import { FinancialOverviewSchema, handleFinancialOverview } from './financialOverviewTools.js';
 */
