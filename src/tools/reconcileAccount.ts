import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { responseFormatter } from '../server/responseFormatter.js';
import { handleCompareTransactions, CompareTransactionsParams } from './compareTransactions.js';
import { handleCreateTransaction, CreateTransactionParams } from './transactionTools.js';
import { handleUpdateTransaction, UpdateTransactionParams } from './transactionTools.js';
import { handleGetAccount } from './accountTools.js';

/**
 * Schema for ynab:reconcile_account tool parameters
 */
export const ReconcileAccountSchema = z
  .object({
    budget_id: z.string().min(1, 'Budget ID is required'),
    account_id: z.string().min(1, 'Account ID is required'),
    csv_file_path: z.string().optional(),
    csv_data: z.string().optional(),
    csv_format: z
      .object({
        date_column: z.union([z.string(), z.number()]).optional().default('Date'),
        amount_column: z.union([z.string(), z.number()]).optional(),
        debit_column: z.union([z.string(), z.number()]).optional(),
        credit_column: z.union([z.string(), z.number()]).optional(),
        description_column: z.union([z.string(), z.number()]).optional().default('Description'),
        date_format: z.string().optional().default('MM/DD/YYYY'),
        has_header: z.boolean().optional().default(true),
        delimiter: z.string().optional().default(','),
      })
      .optional()
      .default(() => ({
        date_column: 'Date',
        amount_column: 'Amount',
        description_column: 'Description',
        date_format: 'MM/DD/YYYY',
        has_header: true,
        delimiter: ',',
      })),
    auto_create_transactions: z.boolean().optional().default(false),
    auto_update_cleared_status: z.boolean().optional().default(false),
    auto_unclear_missing: z.boolean().optional().default(true),
    auto_adjust_dates: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(true),
    amount_tolerance: z.number().min(0).max(1).optional().default(0.01),
    date_tolerance_days: z.number().min(0).max(7).optional().default(5),
    expected_bank_balance: z.number().optional(),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((data) => data.csv_file_path || data.csv_data, {
    message: 'Either csv_file_path or csv_data must be provided',
  });

export type ReconcileAccountParams = z.infer<typeof ReconcileAccountSchema>;

/**
 * Represents the result of a reconciliation operation
 */
interface ReconciliationResult {
  summary: {
    bank_transactions_count: number;
    ynab_transactions_count: number;
    matches_found: number;
    missing_in_ynab: number;
    missing_in_bank: number;
    transactions_created: number;
    transactions_updated: number;
    dates_adjusted: number;
    dry_run: boolean;
  };
  date_range: {
    start_date: string;
    end_date: string;
    bank_statement_range: {
      earliest_transaction: string;
      latest_transaction: string;
    };
    ynab_data_range: {
      earliest_transaction: string;
      latest_transaction: string;
    };
  };
  account_balance: {
    before: {
      balance: number;
      cleared_balance: number;
      uncleared_balance: number;
    };
    after: {
      balance: number;
      cleared_balance: number;
      uncleared_balance: number;
    };
  };
  balance_reconciliation?: {
    expected_bank_balance: number;
    ynab_cleared_balance: number;
    difference: number;
    reconciled: boolean;
    bank_statement_total: number;
  };
  actions_taken: {
    type: 'create_transaction' | 'update_transaction';
    transaction: Record<string, unknown>;
    reason: string;
  }[];
  matches: Record<string, unknown>[];
  missing_in_ynab: Record<string, unknown>[];
  missing_in_bank: Record<string, unknown>[];
  recommendations: string[];
}

/**
 * Handles the ynab:reconcile_account tool call
 * Performs comprehensive account reconciliation with bank statement data
 */
export async function handleReconcileAccount(
  ynabAPI: ynab.API,
  params: ReconcileAccountParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      const parsed = ReconcileAccountSchema.parse(params);

      // Get initial account balance
      const initialAccountResult = await handleGetAccount(ynabAPI, {
        budget_id: parsed.budget_id,
        account_id: parsed.account_id,
      });
      const initialAccount = JSON.parse(
        (initialAccountResult.content[0]?.text as string) ?? '{"account":{}}',
      ).account;

      // Step 1: Compare transactions to identify discrepancies
      const compareParams: CompareTransactionsParams = {
        budget_id: parsed.budget_id,
        account_id: parsed.account_id,
        csv_file_path: parsed.csv_file_path,
        csv_data: parsed.csv_data,
        csv_format: parsed.csv_format,
        amount_tolerance: parsed.amount_tolerance,
        date_tolerance_days: parsed.date_tolerance_days,
        date_range_days: 30, // Use default value
        auto_detect_format: false, // Use default value
      };

      const comparisonResult = await handleCompareTransactions(ynabAPI, compareParams);
      const comparison = JSON.parse((comparisonResult.content[0]?.text as string) ?? '{}');

      // Determine actual date range from the data
      const bankTransactions = comparison.bank_transactions || [];
      const ynabTransactions = comparison.ynab_transactions || [];

      const bankDates = bankTransactions
        .map((t: { date: string }) => t.date)
        .filter(Boolean)
        .sort();
      const ynabDates = ynabTransactions
        .map((t: { date: string }) => t.date)
        .filter(Boolean)
        .sort();

      const bankEarliest = bankDates.length > 0 ? bankDates[0] : 'N/A';
      const bankLatest = bankDates.length > 0 ? bankDates[bankDates.length - 1] : 'N/A';
      const ynabEarliest = ynabDates.length > 0 ? ynabDates[0] : 'N/A';
      const ynabLatest = ynabDates.length > 0 ? ynabDates[ynabDates.length - 1] : 'N/A';

      // Use provided date range or determine from data
      const startDate = parsed.start_date || bankEarliest;
      const endDate = parsed.end_date || bankLatest;

      // Initialize result object
      const result: ReconciliationResult = {
        summary: {
          bank_transactions_count: comparison.summary.bank_transactions_count,
          ynab_transactions_count: comparison.summary.ynab_transactions_count,
          matches_found: comparison.summary.matches_found,
          missing_in_ynab: comparison.summary.missing_in_ynab,
          missing_in_bank: comparison.summary.missing_in_bank,
          transactions_created: 0,
          transactions_updated: 0,
          dates_adjusted: 0,
          dry_run: parsed.dry_run,
        },
        date_range: {
          start_date: startDate,
          end_date: endDate,
          bank_statement_range: {
            earliest_transaction: bankEarliest,
            latest_transaction: bankLatest,
          },
          ynab_data_range: {
            earliest_transaction: ynabEarliest,
            latest_transaction: ynabLatest,
          },
        },
        account_balance: {
          before: {
            balance: initialAccount.balance,
            cleared_balance: initialAccount.cleared_balance,
            uncleared_balance: initialAccount.uncleared_balance,
          },
          after: {
            balance: initialAccount.balance,
            cleared_balance: initialAccount.cleared_balance,
            uncleared_balance: initialAccount.uncleared_balance,
          },
        },
        actions_taken: [],
        matches: comparison.matches,
        missing_in_ynab: comparison.missing_in_ynab,
        missing_in_bank: comparison.missing_in_bank,
        recommendations: [],
      };

      // Step 2: Create missing transactions in YNAB (if enabled and not dry run)
      if (parsed.auto_create_transactions && !parsed.dry_run) {
        for (const missingTxn of comparison.missing_in_ynab) {
          try {
            const createParams: CreateTransactionParams = {
              budget_id: parsed.budget_id,
              account_id: parsed.account_id,
              amount: Math.round(parseFloat(missingTxn.amount) * 1000), // Convert to milliunits
              date: missingTxn.date,
              payee_name: missingTxn.suggested_payee_name || missingTxn.description,
              memo: `Auto-reconciled from bank statement`,
              cleared: 'cleared',
              approved: true,
            };

            const createResult = await handleCreateTransaction(ynabAPI, createParams);
            const createdTransaction = JSON.parse(
              (createResult.content[0]?.text as string) ?? '{}',
            );

            result.actions_taken.push({
              type: 'create_transaction',
              transaction: createdTransaction.transaction,
              reason: `Created missing transaction: ${missingTxn.description}`,
            });
            result.summary.transactions_created++;

            // Update final account balance from the last transaction creation
            if (createdTransaction.account_balance !== undefined) {
              result.account_balance.after.balance = createdTransaction.account_balance;
              result.account_balance.after.cleared_balance =
                createdTransaction.account_cleared_balance;
              result.account_balance.after.uncleared_balance =
                createdTransaction.account_balance - createdTransaction.account_cleared_balance;
            }
          } catch (error) {
            result.recommendations.push(
              `Failed to create transaction "${missingTxn.description}": ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }

      // Step 3: Update transaction statuses and dates (if enabled and not dry run)
      if ((parsed.auto_update_cleared_status || parsed.auto_adjust_dates) && !parsed.dry_run) {
        for (const match of comparison.matches) {
          if (match.ynab_transaction && match.bank_transaction) {
            const needsClearedUpdate = match.ynab_transaction.cleared !== 'cleared';
            const needsDateUpdate =
              parsed.auto_adjust_dates &&
              match.ynab_transaction.date !== match.bank_transaction.date;

            if (needsClearedUpdate || needsDateUpdate) {
              try {
                const updateParams: UpdateTransactionParams = {
                  budget_id: parsed.budget_id,
                  transaction_id: match.ynab_transaction.id,
                };

                if (needsClearedUpdate && parsed.auto_update_cleared_status) {
                  updateParams.cleared = 'cleared';
                }

                if (needsDateUpdate) {
                  updateParams.date = match.bank_transaction.date;
                }

                const updateResult = await handleUpdateTransaction(ynabAPI, updateParams);
                const updatedTransaction = JSON.parse(
                  (updateResult.content[0]?.text as string) ?? '{}',
                );

                const reasons = [];
                if (needsClearedUpdate && parsed.auto_update_cleared_status) {
                  reasons.push('marked as cleared');
                }
                if (needsDateUpdate) {
                  reasons.push(
                    `date adjusted from ${match.ynab_transaction.date} to ${match.bank_transaction.date}`,
                  );
                  result.summary.dates_adjusted++;
                }

                result.actions_taken.push({
                  type: 'update_transaction',
                  transaction: updatedTransaction.transaction,
                  reason: `Updated transaction: ${reasons.join(', ')}`,
                });
                result.summary.transactions_updated++;

                // Update final account balance from the last transaction update
                if (updatedTransaction.updated_balance !== undefined) {
                  result.account_balance.after.balance = updatedTransaction.updated_balance;
                  result.account_balance.after.cleared_balance =
                    updatedTransaction.updated_cleared_balance;
                  result.account_balance.after.uncleared_balance =
                    updatedTransaction.updated_balance - updatedTransaction.updated_cleared_balance;
                }
              } catch (error) {
                result.recommendations.push(
                  `Failed to update transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
            }
          }
        }
      }

      // Step 4: Balance reconciliation (if expected bank balance provided)
      if (parsed.expected_bank_balance !== undefined) {
        // Calculate total from bank transactions
        const bankStatementTotal =
          comparison.bank_transactions?.reduce(
            (sum: number, txn: { amount: string }) => sum + parseFloat(txn.amount),
            0,
          ) || 0;

        const finalClearedBalance = result.account_balance.after.cleared_balance;
        const expectedMilliunits = Math.round(parsed.expected_bank_balance * 1000);
        const difference = Math.abs(expectedMilliunits - finalClearedBalance);
        const reconciled = difference === 0; // Must match exactly

        result.balance_reconciliation = {
          expected_bank_balance: expectedMilliunits,
          ynab_cleared_balance: finalClearedBalance,
          difference: difference,
          reconciled: reconciled,
          bank_statement_total: Math.round(bankStatementTotal * 1000),
        };

        if (!reconciled) {
          result.recommendations.push(`⚠️  Balance mismatch detected:`);
          result.recommendations.push(
            `   Expected bank balance: $${parsed.expected_bank_balance.toFixed(2)}`,
          );
          result.recommendations.push(
            `   YNAB cleared balance: $${(finalClearedBalance / 1000).toFixed(2)}`,
          );
          result.recommendations.push(`   Difference: $${(difference / 1000).toFixed(2)}`);
          result.recommendations.push(
            `   This suggests additional transactions may need to be cleared or created.`,
          );
        } else {
          result.recommendations.push(
            '✅ Balance reconciliation successful: Bank and YNAB cleared balances match!',
          );
        }
      }

      // Step 5: Handle cleared YNAB transactions missing from bank (if enabled and not dry run)
      if (parsed.auto_unclear_missing && !parsed.dry_run) {
        for (const missingTxn of comparison.missing_in_bank) {
          // Only unclear transactions that are currently cleared (not reconciled)
          if (missingTxn.cleared === 'cleared') {
            try {
              const updateParams: UpdateTransactionParams = {
                budget_id: parsed.budget_id,
                transaction_id: missingTxn.id,
                cleared: 'uncleared',
              };

              const updateResult = await handleUpdateTransaction(ynabAPI, updateParams);
              const updatedTransaction = JSON.parse(
                (updateResult.content[0]?.text as string) ?? '{}',
              );

              result.actions_taken.push({
                type: 'update_transaction',
                transaction: updatedTransaction.transaction,
                reason: `Marked as uncleared - cleared transaction not found in bank statement`,
              });
              result.summary.transactions_updated++;
            } catch (error) {
              result.recommendations.push(
                `Failed to unclear transaction "${missingTxn.payee_name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }
        }
      }

      // Step 6: Generate recommendations
      if (result.summary.dates_adjusted > 0) {
        result.recommendations.push(
          `✅ Adjusted ${result.summary.dates_adjusted} transaction date(s) to match bank statement dates`,
        );
      }

      if (result.summary.missing_in_ynab > 0 && !parsed.auto_create_transactions) {
        result.recommendations.push(
          `Consider setting auto_create_transactions=true to automatically create ${result.summary.missing_in_ynab} missing transactions`,
        );
      }

      if (!parsed.auto_adjust_dates && comparison.matches?.length > 0) {
        result.recommendations.push(
          `Consider setting auto_adjust_dates=true to automatically align YNAB dates with bank statement dates`,
        );
      }

      if (result.summary.missing_in_bank > 0) {
        result.recommendations.push(
          `${result.summary.missing_in_bank} transactions exist in YNAB but not in bank statement - review for duplicates or bank processing delays`,
        );
      }

      if (parsed.dry_run) {
        result.recommendations.push(
          'This was a dry run. Set dry_run=false to actually perform the reconciliation actions',
        );
      }

      const balanceChange =
        result.account_balance.after.balance - result.account_balance.before.balance;
      if (Math.abs(balanceChange) > 100) {
        // More than $0.10 change
        result.recommendations.push(
          `Account balance changed by ${(balanceChange / 1000).toFixed(2)} during reconciliation`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format(result),
          },
        ],
      };
    },
    'ynab:reconcile_account',
    'reconciling account with bank statement',
  );
}
