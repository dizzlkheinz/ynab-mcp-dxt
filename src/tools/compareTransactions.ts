import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { z } from 'zod/v4';
import { withToolErrorHandling } from '../types/index.js';
import { responseFormatter } from '../server/responseFormatter.js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { parse as parseDateFns } from 'date-fns';
import { toMilli, Milli } from '../utils/money.js';

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
    statement_start_date: z.string().optional(),
    statement_date: z.string().optional(),
    auto_detect_format: z.boolean().optional().default(false),
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
 * Parse date string using date-fns for better reliability
 */
function parseDate(dateStr: string, format: string): Date {
  const cleanDate = dateStr.trim();

  // Map our format strings to date-fns format patterns
  const formatMap: Record<string, string> = {
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'M/D/YYYY': 'M/d/yyyy',
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'D/M/YYYY': 'd/M/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd',
    'MM-DD-YYYY': 'MM-dd-yyyy',
    'MMM dd, yyyy': 'MMM dd, yyyy',
    'MMM d, yyyy': 'MMM d, yyyy',
  };

  const dateFnsFormat = formatMap[format];
  if (dateFnsFormat) {
    try {
      const parsed = parseDateFns(cleanDate, dateFnsFormat, new Date());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Fall through to generic parsing
    }
  }

  // Fallback to native Date parsing for any unrecognized formats
  const parsed = new Date(cleanDate);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${dateStr} with format: ${format}`);
  }
  return parsed;
}

/**
 * Convert dollar amount to milliunits
 */
function amountToMilliunits(amountStr: string): Milli {
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();
  let s = cleaned,
    neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  const n = Number(s);
  return toMilli(neg ? -n : n);
}

/**
 * Auto-detect CSV format by analyzing the first few rows
 */
function autoDetectCSVFormat(
  csvContent: string,
): NonNullable<CompareTransactionsParams['csv_format']> {
  const lines = csvContent.trim().split('\n').slice(0, 3);
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const firstLine = lines[0]!.split(',');
  const hasHeader = !isDateLike(firstLine[0] || '');

  // Check for separate debit/credit columns by looking for empty cells pattern
  let hasDebitCredit = false;
  if (lines.length > 1) {
    const dataLines = hasHeader ? lines.slice(1) : lines;
    hasDebitCredit = dataLines.some((line) => {
      const cols = line.split(',');
      // Look for pattern: amount in col2 OR col3, but not both
      return (
        cols.length >= 4 &&
        ((cols[2]?.trim() && !cols[3]?.trim()) || (!cols[2]?.trim() && cols[3]?.trim()))
      );
    });
  }

  if (hasDebitCredit && firstLine.length >= 4) {
    return {
      date_column: 0,
      description_column: 1,
      debit_column: 2,
      credit_column: 3,
      date_format: detectDateFormat(hasHeader ? lines[1]?.split(',')[0] : firstLine[0]),
      has_header: hasHeader,
      delimiter: ',',
    };
  } else {
    return {
      date_column: hasHeader ? 'Date' : 0,
      amount_column: hasHeader ? 'Amount' : 1,
      description_column: hasHeader ? 'Description' : firstLine.length >= 3 ? 2 : 1,
      date_format: detectDateFormat(hasHeader ? lines[1]?.split(',')[0] : firstLine[0]),
      has_header: hasHeader,
      delimiter: ',',
    };
  }
}

/**
 * Check if a string looks like a date
 */
function isDateLike(str: string): boolean {
  if (!str) return false;
  // Common date patterns
  const datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
    /^\d{1,2}-\d{1,2}-\d{4}$/, // MM-DD-YYYY
    /^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/, // MMM dd, yyyy (e.g., "Sep 18, 2025")
  ];
  return datePatterns.some((pattern) => pattern.test(str.trim()));
}

/**
 * Detect date format from a sample date string
 */
function detectDateFormat(dateStr: string | undefined): string {
  if (!dateStr) return 'MM/DD/YYYY';
  const cleaned = dateStr.trim();

  if (cleaned.includes('/')) {
    return 'MM/DD/YYYY';
  } else if (cleaned.includes('-')) {
    if (/^\d{4}-/.test(cleaned)) {
      return 'YYYY-MM-DD';
    } else {
      return 'MM-DD-YYYY';
    }
  } else if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/.test(cleaned)) {
    // Detect "Sep 18, 2025" format
    return 'MMM dd, yyyy';
  }
  return 'MM/DD/YYYY';
}

/**
 * Automatically fix common CSV issues like unquoted dates with commas
 */
function preprocessCSV(
  csvContent: string,
  format: NonNullable<CompareTransactionsParams['csv_format']>,
): string {
  // Check if we're dealing with MMM dd, yyyy format dates that might need quoting
  if (format.date_format?.includes('MMM') && format.date_format?.includes(',')) {
    const lines = csvContent.split('\n');
    const fixedLines = lines.map((line, index) => {
      // Skip header row
      if (format.has_header && index === 0) return line;
      if (!line.trim()) return line;

      // Check if this line has unquoted dates (more commas than expected)
      const parts = line.split(format.delimiter || ',');
      const expectedColumns = format.has_header
        ? lines[0]?.split(format.delimiter || ',').length || 3
        : 3;

      if (parts.length > expectedColumns) {
        // Check if we have a date pattern split across first two parts (like "Sep 18, 2025")
        const potentialDate = parts.slice(0, 2).join(',');
        if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/.test(potentialDate)) {
          // This looks like "Sep 18, 2025" - quote it
          const dateField = parts.slice(0, 2).join(','); // "Sep 18, 2025"
          const remainingFields = parts.slice(2);
          return `"${dateField}"${format.delimiter || ','}${remainingFields.join(format.delimiter || ',')}`;
        }
      }

      return line;
    });

    return fixedLines.join('\n');
  }

  return csvContent;
}

/**
 * Parse CSV data into bank transactions
 */
function parseBankCSV(
  csvContent: string,
  format: NonNullable<CompareTransactionsParams['csv_format']>,
): BankTransaction[] {
  // Preprocess CSV to fix common issues like unquoted dates
  const processedCSV = preprocessCSV(csvContent, format);

  const records = parse(processedCSV, {
    delimiter: format.delimiter,
    columns: format.has_header,
    skip_empty_lines: true,
    trim: true,
    // Enhanced CSV parsing options for robust handling
    quote: '"', // Handle quoted fields (for dates with commas)
    escape: '"', // Handle escaped quotes within fields
    relax_quotes: true, // Allow quotes within fields
    relax_column_count: true, // Handle varying column counts
    auto_parse: false, // Keep all values as strings for our custom parsing
    auto_parse_date: false, // We handle dates with date-fns
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
        rawDate = recordObj[format.date_column as string] || '';

        if (format.amount_column) {
          rawAmount = recordObj[format.amount_column as string] || '';
        } else if (format.debit_column !== undefined && format.credit_column !== undefined) {
          const debitVal = recordObj[format.debit_column as string] || '0';
          const creditVal = recordObj[format.credit_column as string] || '0';
          // Convert: debits negative, credits positive
          rawAmount = parseFloat(debitVal) !== 0 ? `-${debitVal}` : creditVal;
        } else {
          throw new Error('No amount column configuration found');
        }

        description = recordObj[format.description_column as string] || '';
      } else {
        // Record is an array when not using headers, so use column indices
        const recordArray = record as string[];
        const dateIndex =
          typeof format.date_column === 'number'
            ? format.date_column
            : parseInt(format.date_column, 10);
        const descIndex =
          typeof format.description_column === 'number'
            ? format.description_column
            : parseInt(format.description_column, 10);

        // Validate indices are valid numbers (fallback to defaults if invalid)
        const safeDateIndex = isNaN(dateIndex) ? 0 : dateIndex;
        const safeDescIndex = isNaN(descIndex) ? 2 : descIndex;

        rawDate = recordArray[safeDateIndex] || '';

        if (format.amount_column !== undefined) {
          const amountIndex =
            typeof format.amount_column === 'number'
              ? format.amount_column
              : parseInt(format.amount_column, 10);
          const safeAmountIndex = isNaN(amountIndex) ? 1 : amountIndex;
          rawAmount = recordArray[safeAmountIndex] || '';
        } else if (format.debit_column !== undefined && format.credit_column !== undefined) {
          const debitIndex =
            typeof format.debit_column === 'number'
              ? format.debit_column
              : parseInt(format.debit_column, 10);
          const creditIndex =
            typeof format.credit_column === 'number'
              ? format.credit_column
              : parseInt(format.credit_column, 10);

          const debitVal = recordArray[debitIndex] || '0';
          const creditVal = recordArray[creditIndex] || '0';

          // Convert: debits negative, credits positive
          rawAmount =
            parseFloat(debitVal.replace(/[^\d.-]/g, '')) !== 0 ? `-${debitVal}` : creditVal;
        } else {
          throw new Error('No amount column configuration found');
        }

        description = recordArray[safeDescIndex] || '';
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
 * Group transactions by amount to detect duplicates
 */
function groupTransactionsByAmount(
  transactions: (BankTransaction | YNABTransaction)[],
): Map<number, (BankTransaction | YNABTransaction)[]> {
  const groups = new Map<number, (BankTransaction | YNABTransaction)[]>();

  for (const txn of transactions) {
    const amount = txn.amount;
    if (!groups.has(amount)) {
      groups.set(amount, []);
    }
    groups.get(amount)!.push(txn);
  }

  return groups;
}

/**
 * Match duplicate amounts using sequential date-based approach
 */
function matchDuplicateAmounts(
  bankTxns: BankTransaction[],
  ynabTxns: YNABTransaction[],
  _amount: number,
  amountTolerance: number,
  dateTolerance: number,
): TransactionMatch[] {
  // Sort both arrays by date for sequential matching
  const sortedBank = [...bankTxns].sort((a, b) => a.date.getTime() - b.date.getTime());
  const sortedYnab = [...ynabTxns].sort((a, b) => a.date.getTime() - b.date.getTime());

  const matches: TransactionMatch[] = [];
  const usedYnabIds = new Set<string>();

  // For each bank transaction, find the best available YNAB transaction
  // considering both score and chronological order
  for (const bankTxn of sortedBank) {
    let bestMatch: { ynab: YNABTransaction; score: number; reasons: string[] } | null = null;

    for (const ynabTxn of sortedYnab) {
      if (usedYnabIds.has(ynabTxn.id)) continue;

      const { score, reasons } = calculateMatchScore(
        bankTxn,
        ynabTxn,
        amountTolerance,
        dateTolerance,
      );

      // For duplicates, heavily prefer chronological order
      const daysDiff =
        Math.abs(bankTxn.date.getTime() - ynabTxn.date.getTime()) / (1000 * 60 * 60 * 24);
      const chronologyBonus = daysDiff <= 1 ? 15 : daysDiff <= 3 ? 10 : 0;
      const adjustedScore = score + chronologyBonus;

      if (adjustedScore >= 30 && (!bestMatch || adjustedScore > bestMatch.score)) {
        const enhancedReasons = [...reasons];
        if (chronologyBonus > 0) {
          enhancedReasons.push(`Chronological order bonus (+${chronologyBonus})`);
        }
        bestMatch = { ynab: ynabTxn, score: adjustedScore, reasons: enhancedReasons };
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
    }
  }

  return matches;
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

  // Group transactions by amount to detect duplicates
  const bankByAmount = groupTransactionsByAmount(bankTransactions);
  const ynabByAmount = groupTransactionsByAmount(ynabTransactions);

  // Find amounts that appear multiple times (duplicates)
  const duplicateAmounts = new Set<number>();
  for (const [amount, txns] of bankByAmount) {
    if (txns.length > 1 || (ynabByAmount.get(amount)?.length || 0) > 1) {
      duplicateAmounts.add(amount);
    }
  }

  // Handle duplicate amounts with special sequential matching
  for (const amount of duplicateAmounts) {
    const bankDuplicates =
      bankByAmount
        .get(amount)
        ?.filter(
          (txn): txn is BankTransaction =>
            'raw_amount' in txn && !usedBankIndices.has(bankTransactions.indexOf(txn)),
        ) || [];
    const ynabDuplicates =
      ynabByAmount
        .get(amount)
        ?.filter((txn): txn is YNABTransaction => 'id' in txn && !usedYnabIds.has(txn.id)) || [];

    if (bankDuplicates.length > 0 && ynabDuplicates.length > 0) {
      const duplicateMatches = matchDuplicateAmounts(
        bankDuplicates,
        ynabDuplicates,
        amount,
        amountTolerance,
        dateTolerance,
      );

      for (const match of duplicateMatches) {
        matches.push(match);
        usedYnabIds.add(match.ynab_transaction.id);
        usedBankIndices.add(bankTransactions.indexOf(match.bank_transaction));
      }
    }
  }

  // Handle non-duplicate amounts with original algorithm
  for (let i = 0; i < bankTransactions.length; i++) {
    const bankTxn = bankTransactions[i];
    if (!bankTxn || usedBankIndices.has(i) || duplicateAmounts.has(bankTxn.amount)) continue;

    let bestMatch: { ynab: YNABTransaction; score: number; reasons: string[] } | null = null;

    for (const ynabTxn of ynabTransactions) {
      if (usedYnabIds.has(ynabTxn.id) || duplicateAmounts.has(ynabTxn.amount)) continue;

      const { score, reasons } = calculateMatchScore(
        bankTxn,
        ynabTxn,
        amountTolerance,
        dateTolerance,
      );

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

function findSuggestedPayee(
  description: string,
  payees: ynab.Payee[],
): { suggested_payee_id?: string; suggested_payee_name?: string; suggestion_reason?: string } {
  if (!description) {
    return {};
  }

  const lower_description = description.toLowerCase();

  // Simple search: check if payee name is contained in the description
  for (const payee of payees) {
    const lower_payee_name = payee.name.toLowerCase();
    if (lower_description.includes(lower_payee_name)) {
      return {
        suggested_payee_id: payee.id,
        suggested_payee_name: payee.name,
        suggestion_reason: `Matched payee '${payee.name}' in description.`,
      };
    }
  }

  // If no match, suggest the original description as the new payee name (cleaned up a bit)
  const suggested_name = description
    .replace(/\d+/, '') // Remove numbers
    .replace(/\s+/, ' ') // Consolidate whitespace
    .trim();

  return {
    suggested_payee_name: suggested_name,
    suggestion_reason: `No matching payee found. Suggested new payee name from description.`,
  };
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
      // Parse and apply defaults/validation
      const parsed = CompareTransactionsSchema.parse(params);

      const payeesResponse = await ynabAPI.payees.getPayees(parsed.budget_id);
      const payees = payeesResponse.data.payees;

      // Get CSV data
      let csvContent: string;
      if (parsed.csv_file_path) {
        try {
          csvContent = readFileSync(parsed.csv_file_path, 'utf-8');
        } catch (error) {
          throw new Error(
            `Unable to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      } else {
        csvContent = parsed.csv_data!;
      }

      // Auto-detect format if requested
      let csvFormat = parsed.csv_format;
      if (parsed.auto_detect_format) {
        try {
          csvFormat = autoDetectCSVFormat(csvContent);
          console.warn('Auto-detected CSV format:', csvFormat);
        } catch (error) {
          console.warn('Auto-detection failed, using provided format:', error);
        }
      }

      // Parse bank transactions from CSV
      const bankTransactions = parseBankCSV(csvContent, csvFormat);

      if (bankTransactions.length === 0) {
        throw new Error(
          'No valid transactions found in CSV data. ' +
            'Check your csv_format parameters or try auto_detect_format: true. ' +
            `CSV has ${csvContent.split('\n').length} lines.`,
        );
      }

      // Calculate date range for YNAB query
      const bankDates = bankTransactions.map((t) => t.date);
      const minDate = new Date(Math.min(...bankDates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...bankDates.map((d) => d.getTime())));

      // Add tolerance to date range
      const startDate = new Date(minDate);
      startDate.setDate(startDate.getDate() - parsed.date_tolerance_days!);
      const endDate = new Date(maxDate);
      endDate.setDate(endDate.getDate() + parsed.date_tolerance_days!);

      // Get YNAB transactions for the account in the date range
      const sinceDate = startDate.toISOString().split('T')[0];
      const response = await ynabAPI.transactions.getTransactionsByAccount(
        parsed.budget_id,
        parsed.account_id,
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

      // Filter candidates to statement window if provided
      let filteredBankTransactions = bankTransactions;
      let filteredYnabTransactions = ynabTransactions;

      if (parsed.statement_start_date || parsed.statement_date) {
        const startDate = parsed.statement_start_date;
        const endDate = parsed.statement_date;

        filteredBankTransactions = bankTransactions.filter((t) => {
          const dateStr = t.date.toISOString().split('T')[0];
          return (!startDate || dateStr! >= startDate) && (!endDate || dateStr! <= endDate);
        });
        filteredYnabTransactions = ynabTransactions.filter((t) => {
          const dateStr = t.date.toISOString().split('T')[0];
          return (!startDate || dateStr! >= startDate) && (!endDate || dateStr! <= endDate);
        });
      }

      // Find matches
      const { matches, unmatched_bank, unmatched_ynab } = findMatches(
        filteredBankTransactions,
        filteredYnabTransactions,
        parsed.amount_tolerance!,
        parsed.date_tolerance_days!,
      );

      // Format results
      const summary = {
        bank_transactions_count: filteredBankTransactions.length,
        ynab_transactions_count: filteredYnabTransactions.length,
        matches_found: matches.length,
        missing_in_ynab: unmatched_bank.length,
        missing_in_bank: unmatched_ynab.length,
        date_range: {
          start: minDate.toISOString().split('T')[0],
          end: maxDate.toISOString().split('T')[0],
        },
        parameters: {
          amount_tolerance: parsed.amount_tolerance,
          date_tolerance_days: parsed.date_tolerance_days,
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
                ynab_transaction: {
                  id: match.ynab_transaction.id,
                  cleared: match.ynab_transaction.cleared,
                },
                match_score: match.match_score,
                match_reasons: match.match_reasons,
              })),
              missing_in_ynab: unmatched_bank.map((txn) => {
                const payeeSuggestion = findSuggestedPayee(txn.description, payees);
                return {
                  date: txn.date.toISOString().split('T')[0],
                  amount: (txn.amount / 1000).toFixed(2),
                  description: txn.description,
                  row_number: txn.row_number,
                  ...payeeSuggestion,
                };
              }),
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
