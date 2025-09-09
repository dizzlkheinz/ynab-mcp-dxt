import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { SaveTransaction } from 'ynab/dist/models/SaveTransaction.js';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { responseFormatter } from '../server/responseFormatter.js';

/**
 * Utility function to ensure transaction is not null/undefined
 */
function ensureTransaction<T>(transaction: T | undefined, errorMessage: string): T {
  if (!transaction) {
    throw new Error(errorMessage);
  }
  return transaction;
}

/**
 * Schema for ynab:list_transactions tool parameters
 */
export const ListTransactionsSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  account_id: z.string().optional(),
  category_id: z.string().optional(),
  since_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in ISO format (YYYY-MM-DD)')
    .optional(),
  type: z.enum(['uncategorized', 'unapproved']).optional(),
});

export type ListTransactionsParams = z.infer<typeof ListTransactionsSchema>;

/**
 * Schema for ynab:get_transaction tool parameters
 */
export const GetTransactionSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  transaction_id: z.string().min(1, 'Transaction ID is required'),
});

export type GetTransactionParams = z.infer<typeof GetTransactionSchema>;

/**
 * Schema for ynab:create_transaction tool parameters
 */
export const CreateTransactionSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  account_id: z.string().min(1, 'Account ID is required'),
  amount: z.number().int('Amount must be an integer in milliunits'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in ISO format (YYYY-MM-DD)'),
  payee_name: z.string().optional(),
  payee_id: z.string().optional(),
  category_id: z.string().optional(),
  memo: z.string().optional(),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional(),
  approved: z.boolean().optional(),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).optional(),
  dry_run: z.boolean().optional(),
});

export type CreateTransactionParams = z.infer<typeof CreateTransactionSchema>;

/**
 * Schema for ynab:update_transaction tool parameters
 */
export const UpdateTransactionSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  transaction_id: z.string().min(1, 'Transaction ID is required'),
  account_id: z.string().optional(),
  amount: z.number().int('Amount must be an integer in milliunits').optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in ISO format (YYYY-MM-DD)')
    .optional(),
  payee_name: z.string().optional(),
  payee_id: z.string().optional(),
  category_id: z.string().optional(),
  memo: z.string().optional(),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional(),
  approved: z.boolean().optional(),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).optional(),
  dry_run: z.boolean().optional(),
});

export type UpdateTransactionParams = z.infer<typeof UpdateTransactionSchema>;

/**
 * Schema for ynab:delete_transaction tool parameters
 */
export const DeleteTransactionSchema = z.object({
  budget_id: z.string().min(1, 'Budget ID is required'),
  transaction_id: z.string().min(1, 'Transaction ID is required'),
  dry_run: z.boolean().optional(),
});

export type DeleteTransactionParams = z.infer<typeof DeleteTransactionSchema>;

/**
 * Handles the ynab:list_transactions tool call
 * Lists transactions for a budget with optional filtering
 */
export async function handleListTransactions(
  ynabAPI: ynab.API,
  params: ListTransactionsParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      let response;

      // Use conditional API calls based on filter parameters
      if (params.account_id) {
        // Get transactions for specific account
        response = await ynabAPI.transactions.getTransactionsByAccount(
          params.budget_id,
          params.account_id,
          params.since_date,
        );
      } else if (params.category_id) {
        // Get transactions for specific category
        response = await ynabAPI.transactions.getTransactionsByCategory(
          params.budget_id,
          params.category_id,
          params.since_date,
        );
      } else {
        // Get all transactions for budget
        response = await ynabAPI.transactions.getTransactions(
          params.budget_id,
          params.since_date,
          params.type,
        );
      }

      const transactions = response.data.transactions;

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              transactions: transactions.map((transaction) => ({
                id: transaction.id,
                date: transaction.date,
                amount: transaction.amount,
                memo: transaction.memo,
                cleared: transaction.cleared,
                approved: transaction.approved,
                flag_color: transaction.flag_color,
                account_id: transaction.account_id,
                payee_id: transaction.payee_id,
                category_id: transaction.category_id,
                transfer_account_id: transaction.transfer_account_id,
                transfer_transaction_id: transaction.transfer_transaction_id,
                matched_transaction_id: transaction.matched_transaction_id,
                import_id: transaction.import_id,
                deleted: transaction.deleted,
              })),
            }),
          },
        ],
      };
    },
    'ynab:list_transactions',
    'listing transactions',
  );
}

/**
 * Handles the ynab:get_transaction tool call
 * Gets detailed information for a specific transaction
 */
export async function handleGetTransaction(
  ynabAPI: ynab.API,
  params: GetTransactionParams,
): Promise<CallToolResult> {
  try {
    const response = await ynabAPI.transactions.getTransactionById(
      params.budget_id,
      params.transaction_id,
    );

    const transaction = ensureTransaction(response.data.transaction, 'Transaction not found');

    return {
      content: [
        {
          type: 'text',
          text: responseFormatter.format({
            transaction: {
              id: transaction.id,
              date: transaction.date,
              amount: transaction.amount,
              memo: transaction.memo,
              cleared: transaction.cleared,
              approved: transaction.approved,
              flag_color: transaction.flag_color,
              account_id: transaction.account_id,
              payee_id: transaction.payee_id,
              category_id: transaction.category_id,
              transfer_account_id: transaction.transfer_account_id,
              transfer_transaction_id: transaction.transfer_transaction_id,
              matched_transaction_id: transaction.matched_transaction_id,
              import_id: transaction.import_id,
              deleted: transaction.deleted,
              account_name: transaction.account_name,
              payee_name: transaction.payee_name,
              category_name: transaction.category_name,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return handleTransactionError(error, 'Failed to get transaction');
  }
}

/**
 * Handles the ynab:create_transaction tool call
 * Creates a new transaction in the specified budget and account
 */
export async function handleCreateTransaction(
  ynabAPI: ynab.API,
  params: CreateTransactionParams,
): Promise<CallToolResult> {
  try {
    if ((params as any).dry_run) {
      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              dry_run: true,
              action: 'create_transaction',
              request: params,
            }),
          },
        ],
      };
    }
    // Prepare transaction data
    const transactionData: SaveTransaction = {
      account_id: params.account_id,
      amount: params.amount, // Already validated as integer milliunits
      date: params.date,
      // Include optional fields as-is so undefined stays undefined when omitted
      payee_name: params.payee_name as any,
      payee_id: params.payee_id as any,
      category_id: params.category_id as any,
      memo: params.memo as any,
      cleared: params.cleared as ynab.TransactionClearedStatus,
      approved: params.approved as any,
      flag_color: params.flag_color as ynab.TransactionFlagColor,
    };

    const response = await ynabAPI.transactions.createTransaction(params.budget_id, {
      transaction: transactionData,
    });

    const transaction = ensureTransaction(response.data.transaction, 'Transaction creation failed');

    return {
      content: [
        {
          type: 'text',
          text: responseFormatter.format({
            transaction: {
              id: transaction.id,
              date: transaction.date,
              amount: transaction.amount,
              memo: transaction.memo,
              cleared: transaction.cleared,
              approved: transaction.approved,
              flag_color: transaction.flag_color,
              account_id: transaction.account_id,
              payee_id: transaction.payee_id,
              category_id: transaction.category_id,
              transfer_account_id: transaction.transfer_account_id,
              transfer_transaction_id: transaction.transfer_transaction_id,
              matched_transaction_id: transaction.matched_transaction_id,
              import_id: transaction.import_id,
              deleted: transaction.deleted,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return handleTransactionError(error, 'Failed to create transaction');
  }
}

/**
 * Handles the ynab:update_transaction tool call
 * Updates an existing transaction with the provided fields
 */
export async function handleUpdateTransaction(
  ynabAPI: ynab.API,
  params: UpdateTransactionParams,
): Promise<CallToolResult> {
  try {
    if ((params as any).dry_run) {
      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              dry_run: true,
              action: 'update_transaction',
              request: params,
            }),
          },
        ],
      };
    }
    // Prepare transaction update data - only include fields that are provided
    const transactionData: SaveTransaction = {};

    // Only include fields that are provided in the update
    if (params.account_id !== undefined) {
      transactionData.account_id = params.account_id;
    }
    if (params.amount !== undefined) {
      transactionData.amount = params.amount;
    }
    if (params.date !== undefined) {
      transactionData.date = params.date;
    }
    if (params.payee_name !== undefined) {
      transactionData.payee_name = params.payee_name;
    }
    if (params.payee_id !== undefined) {
      transactionData.payee_id = params.payee_id;
    }
    if (params.category_id !== undefined) {
      transactionData.category_id = params.category_id;
    }
    if (params.memo !== undefined) {
      transactionData.memo = params.memo;
    }
    if (params.cleared !== undefined) {
      transactionData.cleared = params.cleared as ynab.TransactionClearedStatus;
    }
    if (params.approved !== undefined) {
      transactionData.approved = params.approved;
    }
    if (params.flag_color !== undefined) {
      transactionData.flag_color = params.flag_color as ynab.TransactionFlagColor;
    }

    const response = await ynabAPI.transactions.updateTransaction(
      params.budget_id,
      params.transaction_id,
      {
        transaction: transactionData,
      },
    );

    const transaction = ensureTransaction(response.data.transaction, 'Transaction update failed');

    return {
      content: [
        {
          type: 'text',
          text: responseFormatter.format({
            transaction: {
              id: transaction.id,
              date: transaction.date,
              amount: transaction.amount,
              memo: transaction.memo,
              cleared: transaction.cleared,
              approved: transaction.approved,
              flag_color: transaction.flag_color,
              account_id: transaction.account_id,
              payee_id: transaction.payee_id,
              category_id: transaction.category_id,
              transfer_account_id: transaction.transfer_account_id,
              transfer_transaction_id: transaction.transfer_transaction_id,
              matched_transaction_id: transaction.matched_transaction_id,
              import_id: transaction.import_id,
              deleted: transaction.deleted,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return handleTransactionError(error, 'Failed to update transaction');
  }
}

/**
 * Handles the ynab:delete_transaction tool call
 * Deletes a transaction from the specified budget
 */
export async function handleDeleteTransaction(
  ynabAPI: ynab.API,
  params: DeleteTransactionParams,
): Promise<CallToolResult> {
  try {
    if ((params as any).dry_run) {
      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              dry_run: true,
              action: 'delete_transaction',
              request: params,
            }),
          },
        ],
      };
    }
    const response = await ynabAPI.transactions.deleteTransaction(
      params.budget_id,
      params.transaction_id,
    );

    const transaction = ensureTransaction(response.data.transaction, 'Transaction deletion failed');

    return {
      content: [
        {
          type: 'text',
          text: responseFormatter.format({
            message: 'Transaction deleted successfully',
            transaction: {
              id: transaction.id,
              deleted: transaction.deleted,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return handleTransactionError(error, 'Failed to delete transaction');
  }
}

/**
 * Handles errors from transaction-related API calls
 */
function handleTransactionError(error: unknown, defaultMessage: string): CallToolResult {
  let errorMessage = defaultMessage;

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Invalid or expired YNAB access token';
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorMessage = 'Insufficient permissions to access YNAB data';
    } else if (error.message.includes('404') || error.message.includes('Not Found')) {
      errorMessage = 'Budget, account, category, or transaction not found';
    } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      errorMessage = 'Rate limit exceeded. Please try again later';
    } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
      errorMessage = 'YNAB service is currently unavailable';
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: responseFormatter.format({
          error: {
            message: errorMessage,
          },
        }),
      },
    ],
  };
}
