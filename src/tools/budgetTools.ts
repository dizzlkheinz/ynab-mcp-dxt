import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { cacheManager, CACHE_TTLS } from '../server/cacheManager.js';
import { responseFormatter } from '../server/responseFormatter.js';

/**
 * Schema for ynab:get_budget tool parameters
 */
export const GetBudgetSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
});

export type GetBudgetParams = z.infer<typeof GetBudgetSchema>;

/**
 * Handles the ynab:list_budgets tool call
 * Lists all budgets associated with the user's account
 */
export async function handleListBudgets(ynabAPI: ynab.API): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const cacheKey = 'budgets:list';

      // Check cache first
      const cached = cacheManager.get<ynab.BudgetSummary[]>(cacheKey);
      if (cached) {
        return {
          content: [
            {
              type: 'text',
              text: responseFormatter.format({
                budgets: cached.map((budget) => ({
                  id: budget.id,
                  name: budget.name,
                  last_modified_on: budget.last_modified_on,
                  first_month: budget.first_month,
                  last_month: budget.last_month,
                  currency_format: budget.currency_format,
                })),
                cached: true,
                cache_info: 'Data retrieved from cache for improved performance',
              }),
            },
          ],
        };
      }

      // Fetch from API and cache
      const response = await ynabAPI.budgets.getBudgets();
      const budgets = response.data.budgets;

      // Cache the result
      cacheManager.set(cacheKey, budgets, CACHE_TTLS.BUDGETS);

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              budgets: budgets.map((budget) => ({
                id: budget.id,
                name: budget.name,
                last_modified_on: budget.last_modified_on,
                first_month: budget.first_month,
                last_month: budget.last_month,
                date_format: budget.date_format,
                currency_format: budget.currency_format,
              })),
              cached: false,
              cache_info: 'Fresh data retrieved from YNAB API',
            }),
          },
        ],
      };
    },
    'ynab:list_budgets',
    'listing budgets',
  );
}

/**
 * Handles the ynab:get_budget tool call
 * Gets detailed information for a specific budget
 */
export async function handleGetBudget(
  ynabAPI: ynab.API,
  params: GetBudgetParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const response = await ynabAPI.budgets.getBudgetById(params.budget_id);
      const budget = response.data.budget;

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              budget: {
                id: budget.id,
                name: budget.name,
                last_modified_on: budget.last_modified_on,
                first_month: budget.first_month,
                last_month: budget.last_month,
                date_format: budget.date_format,
                currency_format: budget.currency_format,
                accounts: budget.accounts?.map((account) => ({
                  id: account.id,
                  name: account.name,
                  type: account.type,
                  on_budget: account.on_budget,
                  closed: account.closed,
                  balance: account.balance,
                  cleared_balance: account.cleared_balance,
                  uncleared_balance: account.uncleared_balance,
                })),
                categories: budget.categories?.map((category) => ({
                  id: category.id,
                  category_group_id: category.category_group_id,
                  name: category.name,
                  hidden: category.hidden,
                  budgeted: category.budgeted,
                  activity: category.activity,
                  balance: category.balance,
                })),
                payees: budget.payees?.map((payee) => ({
                  id: payee.id,
                  name: payee.name,
                  transfer_account_id: payee.transfer_account_id,
                })),
                months: budget.months?.map((month) => ({
                  month: month.month,
                  note: month.note,
                  income: month.income,
                  budgeted: month.budgeted,
                  activity: month.activity,
                  to_be_budgeted: month.to_be_budgeted,
                })),
              },
            }),
          },
        ],
      };
    },
    'ynab:get_budget',
    'getting budget details',
  );
}
