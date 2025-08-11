import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';

/**
 * Schema for ynab:list_accounts tool parameters
 */
export const ListAccountsSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
});

export type ListAccountsParams = z.infer<typeof ListAccountsSchema>;

/**
 * Schema for ynab:get_account tool parameters
 */
export const GetAccountSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  account_id: z.string().min(1, 'Account ID is required'),
});

export type GetAccountParams = z.infer<typeof GetAccountSchema>;

/**
 * Schema for ynab:create_account tool parameters
 */
export const CreateAccountSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  name: z.string().min(1, 'Account name is required'),
  type: z.enum([
    'checking',
    'savings',
    'creditCard',
    'cash',
    'lineOfCredit',
    'otherAsset',
    'otherLiability'
  ]),
  balance: z.number().optional(),
});

export type CreateAccountParams = z.infer<typeof CreateAccountSchema>;

/**
 * Handles the ynab:list_accounts tool call
 * Lists all accounts for a specific budget
 */
export async function handleListAccounts(
  ynabAPI: ynab.API,
  params: ListAccountsParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const response = await ynabAPI.accounts.getAccounts(params.budget_id);
    const accounts = response.data.accounts;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            accounts: accounts.map(account => ({
              id: account.id,
              name: account.name,
              type: account.type,
              on_budget: account.on_budget,
              closed: account.closed,
              note: account.note,
              balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.balance),
              cleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.cleared_balance),
              uncleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.uncleared_balance),
              transfer_payee_id: account.transfer_payee_id,
              direct_import_linked: account.direct_import_linked,
              direct_import_in_error: account.direct_import_in_error,
            })),
          }, null, 2),
        },
      ],
    };
  }, 'ynab:list_accounts', 'listing accounts');
}

/**
 * Handles the ynab:get_account tool call
 * Gets detailed information for a specific account
 */
export async function handleGetAccount(
  ynabAPI: ynab.API,
  params: GetAccountParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const response = await ynabAPI.accounts.getAccountById(params.budget_id, params.account_id);
    const account = response.data.account;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            account: {
              id: account.id,
              name: account.name,
              type: account.type,
              on_budget: account.on_budget,
              closed: account.closed,
              note: account.note,
              balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.balance),
              cleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.cleared_balance),
              uncleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.uncleared_balance),
              transfer_payee_id: account.transfer_payee_id,
              direct_import_linked: account.direct_import_linked,
              direct_import_in_error: account.direct_import_in_error,
            },
          }, null, 2),
        },
      ],
    };
  }, 'ynab:get_account', 'getting account details');
}

/**
 * Handles the ynab:create_account tool call
 * Creates a new account in the specified budget
 */
export async function handleCreateAccount(
  ynabAPI: ynab.API,
  params: CreateAccountParams
): Promise<CallToolResult> {
  return await withToolErrorHandling(async () => {
    const accountData: ynab.SaveAccount = {
      name: params.name,
      type: params.type as ynab.Account['type'],
      balance: params.balance ? params.balance * 1000 : 0, // Convert to milliunits
    };

    const response = await ynabAPI.accounts.createAccount(params.budget_id, {
      account: accountData,
    });
    
    const account = response.data.account;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            account: {
              id: account.id,
              name: account.name,
              type: account.type,
              on_budget: account.on_budget,
              closed: account.closed,
              note: account.note,
              balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.balance),
              cleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.cleared_balance),
              uncleared_balance: ynab.utils.convertMilliUnitsToCurrencyAmount(account.uncleared_balance),
              transfer_payee_id: account.transfer_payee_id,
              direct_import_linked: account.direct_import_linked,
              direct_import_in_error: account.direct_import_in_error,
            },
          }, null, 2),
        },
      ],
    };
  }, 'ynab:create_account', 'creating account');
}

