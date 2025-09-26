import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod/v4';
import { withToolErrorHandling } from '../types/index.js';
import { responseFormatter } from '../server/responseFormatter.js';
import { milliunitsToAmount } from '../utils/amountUtils.js';
import { cacheManager, CACHE_TTLS, CacheManager } from '../server/cacheManager.js';

/**
 * Schema for ynab:get_month tool parameters
 */
export const GetMonthSchema = z
  .object({
    budget_id: z.string().min(1, 'Budget ID is required'),
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Month must be in YYYY-MM-DD format'),
  })
  .strict();

export type GetMonthParams = z.infer<typeof GetMonthSchema>;

/**
 * Schema for ynab:list_months tool parameters
 */
export const ListMonthsSchema = z
  .object({
    budget_id: z.string().min(1, 'Budget ID is required'),
  })
  .strict();

export type ListMonthsParams = z.infer<typeof ListMonthsSchema>;

/**
 * Handles the ynab:get_month tool call
 * Gets budget data for a specific month
 */
export async function handleGetMonth(
  ynabAPI: ynab.API,
  params: GetMonthParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const useCache = process.env['NODE_ENV'] !== 'test';

      let month: ynab.MonthDetail;

      if (useCache) {
        // Use enhanced CacheManager wrap method
        const cacheKey = CacheManager.generateKey('month', 'get', params.budget_id, params.month);
        month = await cacheManager.wrap<ynab.MonthDetail>(cacheKey, {
          ttl: CACHE_TTLS.MONTHS,
          loader: async () => {
            const response = await ynabAPI.months.getBudgetMonth(params.budget_id, params.month);
            return response.data.month;
          },
        });
      } else {
        // Bypass cache in test environment
        const response = await ynabAPI.months.getBudgetMonth(params.budget_id, params.month);
        month = response.data.month;
      }

      const cacheKey = useCache
        ? CacheManager.generateKey('month', 'get', params.budget_id, params.month)
        : null;

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              month: {
                month: month.month,
                note: month.note,
                income: milliunitsToAmount(month.income),
                budgeted: milliunitsToAmount(month.budgeted),
                activity: milliunitsToAmount(month.activity),
                to_be_budgeted: milliunitsToAmount(month.to_be_budgeted),
                age_of_money: month.age_of_money,
                deleted: month.deleted,
                categories: month.categories?.map((category) => ({
                  id: category.id,
                  category_group_id: category.category_group_id,
                  category_group_name: category.category_group_name,
                  name: category.name,
                  hidden: category.hidden,
                  original_category_group_id: category.original_category_group_id,
                  note: category.note,
                  budgeted: milliunitsToAmount(category.budgeted),
                  activity: milliunitsToAmount(category.activity),
                  balance: milliunitsToAmount(category.balance),
                  goal_type: category.goal_type,
                  goal_creation_month: category.goal_creation_month,
                  goal_target: category.goal_target,
                  goal_target_month: category.goal_target_month,
                  goal_percentage_complete: category.goal_percentage_complete,
                  goal_months_to_budget: category.goal_months_to_budget,
                  goal_under_funded: category.goal_under_funded,
                  goal_overall_funded: category.goal_overall_funded,
                  goal_overall_left: category.goal_overall_left,
                  deleted: category.deleted,
                })),
              },
              cached: useCache && cacheKey ? cacheManager.has(cacheKey) : false,
              cache_info:
                useCache && cacheKey && cacheManager.has(cacheKey)
                  ? 'Data retrieved from cache for improved performance'
                  : 'Fresh data retrieved from YNAB API',
            }),
          },
        ],
      };
    },
    'ynab:get_month',
    'getting month data',
  );
}

/**
 * Handles the ynab:list_months tool call
 * Lists all months summary data for a budget
 */
export async function handleListMonths(
  ynabAPI: ynab.API,
  params: ListMonthsParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const useCache = process.env['NODE_ENV'] !== 'test';

      let months: ynab.MonthSummary[];

      if (useCache) {
        // Use enhanced CacheManager wrap method
        const cacheKey = CacheManager.generateKey('months', 'list', params.budget_id);
        months = await cacheManager.wrap<ynab.MonthSummary[]>(cacheKey, {
          ttl: CACHE_TTLS.MONTHS,
          loader: async () => {
            const response = await ynabAPI.months.getBudgetMonths(params.budget_id);
            return response.data.months;
          },
        });
      } else {
        // Bypass cache in test environment
        const response = await ynabAPI.months.getBudgetMonths(params.budget_id);
        months = response.data.months;
      }

      const cacheKey = useCache
        ? CacheManager.generateKey('months', 'list', params.budget_id)
        : null;

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              months: months.map((month) => ({
                month: month.month,
                note: month.note,
                income: milliunitsToAmount(month.income),
                budgeted: milliunitsToAmount(month.budgeted),
                activity: milliunitsToAmount(month.activity),
                to_be_budgeted: milliunitsToAmount(month.to_be_budgeted),
                age_of_money: month.age_of_money,
                deleted: month.deleted,
              })),
              cached: useCache && cacheKey ? cacheManager.has(cacheKey) : false,
              cache_info:
                useCache && cacheKey && cacheManager.has(cacheKey)
                  ? 'Data retrieved from cache for improved performance'
                  : 'Fresh data retrieved from YNAB API',
            }),
          },
        ],
      };
    },
    'ynab:list_months',
    'listing months',
  );
}
