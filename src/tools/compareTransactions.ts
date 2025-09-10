import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod';
import { withToolErrorHandling } from '../types/index.js';
import { responseFormatter } from '../server/responseFormatter.js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

/**
 * Schema for ynab:compare_transactions tool parameters
 */
export const CompareTransactionsSchema = z
  .object({
    budget_id: z.string().min(1, 'Budget ID is required'),
    account_id: z.string().min(1, 'Account ID is required'),
    csv_file_path: z.string().optional(),
    csv_data: z.string().optional(),
    date_range_days: z.number().min(1).max(365).optional().default(30),
    amount_tolerance: z.number().min(0).max(1).optional().default(0.01),
    date_tolerance_days: z.number().min(0).max(7).optional().default(5),
    csv_format: z
      .object({
        date_column: z.string().optional().default('Date'),
        amount_column: z.string().optional().default('Amount'),
        description_column: z.string().optional().default('Description'),
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
  })
  .refine((data) => data.csv_file_path || data.csv_data, {
    message: 'Either csv_file_path or csv_data must be provided',
  });

export type CompareTransactionsParams = z.infer<typeof CompareTransactionsSchema>;

/**
 * Represents a bank transaction from CSV
 */
interface BankTransaction {
  date: Date;
  amount: number; // in milliunits (YNAB format)
  description: string;
  raw_amount: string;
  raw_date: string;
  row_number: number;
}

/**
 * Represents a YNAB transaction for comparison
 */
interface YNABTransaction {
  id: string;
  date: Date;
  amount: number; // already in milliunits
  payee_name: string | null | undefined;
  memo: string | null | undefined;
  cleared: string;
  original: ynab.TransactionDetail;
}

/**
 * Comparison result for a transaction pair
 */
interface TransactionMatch {
  bank_transaction: BankTransaction;
  ynab_transaction: YNABTransaction;
  match_score: number;
  match_reasons: string[];
}

/**
 * Parse date string using various common formats
 */
function parseDate(dateStr: string, format: string): Date {
  const cleanDate = dateStr.trim();

  // Handle common formats
  if (format === 'MM/DD/YYYY' || format === 'M/D/YYYY') {
    const parts = cleanDate.split('/');
    if (parts.length !== 3) throw new Error(`Invalid date format: ${dateStr}`);
    return new Date(parseInt(parts[2]!), parseInt(parts[0]!) - 1, parseInt(parts[1]!));
  } else if (format === 'DD/MM/YYYY' || format === 'D/M/YYYY') {
    const parts = cleanDate.split('/');
    if (parts.length !== 3) throw new Error(`Invalid date format: ${dateStr}`);
    return new Date(parseInt(parts[2]!), parseInt(parts[1]!) - 1, parseInt(parts[0]!));
  } else if (format === 'YYYY-MM-DD') {
    return new Date(cleanDate);
  } else if (format === 'MM-DD-YYYY') {
    const parts = cleanDate.split('-');
    if (parts.length !== 3) throw new Error(`Invalid date format: ${dateStr}`);
    return new Date(parseInt(parts[2]!), parseInt(parts[0]!) - 1, parseInt(parts[1]!));
  }

  // Fallback to Date.parse
  const parsed = new Date(cleanDate);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${dateStr} with format: ${format}`);
  }
  return parsed;
}

/**
 * Convert dollar amount to milliunits
 */
function amountToMilliunits(amountStr: string): number {
  // Clean the amount string - remove currency symbols, commas, etc.
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();

  // Handle parentheses for negative amounts (common in bank statements)
  let isNegative = false;
  let finalAmount = cleaned;

  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    finalAmount = cleaned.slice(1, -1);
  } else if (cleaned.startsWith('-')) {
    isNegative = true;
    finalAmount = cleaned.slice(1);
  }

  const amount = parseFloat(finalAmount);
  if (isNaN(amount)) {
    throw new Error(`Unable to parse amount: ${amountStr}`);
  }

  // Convert to milliunits and apply sign
  return Math.round((isNegative ? -amount : amount) * 1000);
}

/**
 * Parse CSV data into bank transactions
 */
function parseBankCSV(
  csvContent: string,
  format: NonNullable<CompareTransactionsParams['csv_format']>,
): BankTransaction[] {
  const records = parse(csvContent, {
    delimiter: format.delimiter,
    columns: format.has_header,
    skip_empty_lines: true,
    trim: true,
  });

  const transactions: BankTransaction[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowNumber = format.has_header ? i + 2 : i + 1; // Account for header row

    try {
      let rawDate: string;
      let rawAmount: string;
      let description: string;

      if (format.has_header) {
        // Record is an object when using headers
        const recordObj = record as unknown as Record<string, string>;
        rawDate = recordObj[format.date_column] || '';
        rawAmount = recordObj[format.amount_column] || '';
        description = recordObj[format.description_column] || '';
      } else {
        // Record is an array when not using headers, so use column indices
        const recordArray = record as string[];
        const dateIndex = parseInt(format.date_column) || 0;
        const amountIndex = parseInt(format.amount_column) || 1;
        const descIndex = parseInt(format.description_column) || 2;
        rawDate = recordArray[dateIndex] || '';
        rawAmount = recordArray[amountIndex] || '';
        description = recordArray[descIndex] || '';
      }

      if (!rawDate || !rawAmount) {
        console.warn(`Skipping row ${rowNumber}: missing date or amount`);
        continue;
      }

      const date = parseDate(rawDate, format.date_format);
      const amount = amountToMilliunits(rawAmount);

      transactions.push({
        date,
        amount,
        description: description.trim(),
        raw_amount: rawAmount,
        raw_date: rawDate,
        row_number: rowNumber,
      });
    } catch (error) {
      console.warn(`Error parsing row ${rowNumber}:`, error);
      continue;
    }
  }

  return transactions;
}

/**
 * Calculate match score between bank and YNAB transactions
 */
function calculateMatchScore(
  bankTxn: BankTransaction,
  ynabTxn: YNABTransaction,
  amountTolerance: number,
  dateTolerance: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Date matching (40 points max)
  const dateDiff = Math.abs(bankTxn.date.getTime() - ynabTxn.date.getTime());
  const daysDiff = dateDiff / (1000 * 60 * 60 * 24);

  if (daysDiff === 0) {
    score += 40;
    reasons.push('Exact date match');
  } else if (daysDiff <= dateTolerance) {
    score += Math.max(20, 40 - daysDiff * 10);
    reasons.push(`Date within ${daysDiff.toFixed(1)} days`);
  }

  // Amount matching (50 points max)
  const amountDiff = Math.abs(bankTxn.amount - ynabTxn.amount);
  const amountDiffPercent = amountDiff / Math.abs(bankTxn.amount);

  if (amountDiff === 0) {
    score += 50;
    reasons.push('Exact amount match');
  } else if (amountDiffPercent <= amountTolerance) {
    score += Math.max(25, 50 - amountDiffPercent * 1000);
    reasons.push(`Amount within ${(amountDiffPercent * 100).toFixed(2)}% tolerance`);
  }

  // Description/payee matching (10 points max)
  const bankDesc = bankTxn.description.toLowerCase();
  const ynabPayee = (ynabTxn.payee_name || '').toLowerCase();
  const ynabMemo = (ynabTxn.memo || '').toLowerCase();

  if (bankDesc && (ynabPayee.includes(bankDesc) || bankDesc.includes(ynabPayee))) {
    score += 10;
    reasons.push('Payee name similarity');
  } else if (bankDesc && (ynabMemo.includes(bankDesc) || bankDesc.includes(ynabMemo))) {
    score += 5;
    reasons.push('Memo similarity');
  }

  return { score, reasons };
}

/**
 * Find the best matches between bank and YNAB transactions
 */
function findMatches(
  bankTransactions: BankTransaction[],
  ynabTransactions: YNABTransaction[],
  amountTolerance: number,
  dateTolerance: number,
): {
  matches: TransactionMatch[];
  unmatched_bank: BankTransaction[];
  unmatched_ynab: YNABTransaction[];
} {
  const matches: TransactionMatch[] = [];
  const usedYnabIds = new Set<string>();
  const usedBankIndices = new Set<number>();

  // For each bank transaction, find the best YNAB match
  for (let i = 0; i < bankTransactions.length; i++) {
    const bankTxn = bankTransactions[i];
    if (!bankTxn) continue;
    let bestMatch: { ynab: YNABTransaction; score: number; reasons: string[] } | null = null;

    for (const ynabTxn of ynabTransactions) {
      if (usedYnabIds.has(ynabTxn.id)) continue;

      const { score, reasons } = calculateMatchScore(
        bankTxn,
        ynabTxn,
        amountTolerance,
        dateTolerance,
      );

      // Only consider matches with reasonable score (at least date or amount match)
      if (score >= 30 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { ynab: ynabTxn, score, reasons };
      }
    }

    if (bestMatch) {
      matches.push({
        bank_transaction: bankTxn,
        ynab_transaction: bestMatch.ynab,
        match_score: bestMatch.score,
        match_reasons: bestMatch.reasons,
      });
      usedYnabIds.add(bestMatch.ynab.id);
      usedBankIndices.add(i);
    }
  }

  // Collect unmatched transactions
  const unmatched_bank = bankTransactions.filter((_, i) => !usedBankIndices.has(i));
  const unmatched_ynab = ynabTransactions.filter((txn) => !usedYnabIds.has(txn.id));

  return { matches, unmatched_bank, unmatched_ynab };
}

/**
 * Handles the ynab:compare_transactions tool call
 */
export async function handleCompareTransactions(
  ynabAPI: ynab.API,
  params: CompareTransactionsParams,
): Promise<CallToolResult> {
  return await withToolErrorHandling(
    async () => {
      // Get CSV data
      let csvContent: string;
      if (params.csv_file_path) {
        csvContent = readFileSync(params.csv_file_path, 'utf-8');
      } else {
        csvContent = params.csv_data!;
      }

      // Parse bank transactions from CSV
      const bankTransactions = parseBankCSV(csvContent, params.csv_format);

      if (bankTransactions.length === 0) {
        throw new Error('No valid transactions found in CSV data');
      }

      // Calculate date range for YNAB query
      const bankDates = bankTransactions.map((t) => t.date);
      const minDate = new Date(Math.min(...bankDates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...bankDates.map((d) => d.getTime())));

      // Add tolerance to date range
      const startDate = new Date(minDate);
      startDate.setDate(startDate.getDate() - params.date_tolerance_days!);
      const endDate = new Date(maxDate);
      endDate.setDate(endDate.getDate() + params.date_tolerance_days!);

      // Get YNAB transactions for the account in the date range
      const sinceDate = startDate.toISOString().split('T')[0];
      const response = await ynabAPI.transactions.getTransactionsByAccount(
        params.budget_id,
        params.account_id,
        sinceDate,
      );

      // Filter YNAB transactions to the extended date range and convert for comparison
      const ynabTransactions: YNABTransaction[] = response.data.transactions
        .filter((txn) => {
          const txnDate = new Date(txn.date);
          return txnDate >= startDate && txnDate <= endDate && !txn.deleted;
        })
        .map((txn) => ({
          id: txn.id,
          date: new Date(txn.date),
          amount: txn.amount,
          payee_name: txn.payee_name,
          memo: txn.memo,
          cleared: txn.cleared,
          original: txn,
        }));

      // Find matches
      const { matches, unmatched_bank, unmatched_ynab } = findMatches(
        bankTransactions,
        ynabTransactions,
        params.amount_tolerance!,
        params.date_tolerance_days!,
      );

      // Format results
      const summary = {
        bank_transactions_count: bankTransactions.length,
        ynab_transactions_count: ynabTransactions.length,
        matches_found: matches.length,
        missing_in_ynab: unmatched_bank.length,
        missing_in_bank: unmatched_ynab.length,
        date_range: {
          start: minDate.toISOString().split('T')[0],
          end: maxDate.toISOString().split('T')[0],
        },
        parameters: {
          amount_tolerance: params.amount_tolerance,
          date_tolerance_days: params.date_tolerance_days,
        },
      };

      return {
        content: [
          {
            type: 'text',
            text: responseFormatter.format({
              summary,
              matches: matches.map((match) => ({
                bank_date: match.bank_transaction.date.toISOString().split('T')[0],
                bank_amount: (match.bank_transaction.amount / 1000).toFixed(2),
                bank_description: match.bank_transaction.description,
                ynab_date: match.ynab_transaction.date.toISOString().split('T')[0],
                ynab_amount: (match.ynab_transaction.amount / 1000).toFixed(2),
                ynab_payee: match.ynab_transaction.payee_name,
                match_score: match.match_score,
                match_reasons: match.match_reasons,
              })),
              missing_in_ynab: unmatched_bank.map((txn) => ({
                date: txn.date.toISOString().split('T')[0],
                amount: (txn.amount / 1000).toFixed(2),
                description: txn.description,
                row_number: txn.row_number,
              })),
              missing_in_bank: unmatched_ynab.map((txn) => ({
                id: txn.id,
                date: txn.date.toISOString().split('T')[0],
                amount: (txn.amount / 1000).toFixed(2),
                payee_name: txn.payee_name,
                memo: txn.memo,
                cleared: txn.cleared,
              })),
            }),
          },
        ],
      };
    },
    'ynab:compare_transactions',
    'comparing bank and YNAB transactions',
  );
}
