import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import {
  AuthenticationError,
  ConfigurationError,
  ServerConfig,
  ErrorHandler,
} from '../types/index.js';
import { SecurityMiddleware, withSecurityWrapper } from './securityMiddleware.js';
import { handleListBudgets, handleGetBudget, GetBudgetSchema } from '../tools/budgetTools.js';
import {
  handleListAccounts,
  handleGetAccount,
  handleCreateAccount,
  ListAccountsSchema,
  GetAccountSchema,
  CreateAccountSchema,
} from '../tools/accountTools.js';
import {
  handleListTransactions,
  handleGetTransaction,
  handleCreateTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
  ListTransactionsSchema,
  GetTransactionSchema,
  CreateTransactionSchema,
  UpdateTransactionSchema,
  DeleteTransactionSchema,
} from '../tools/transactionTools.js';
import { handleExportTransactions, ExportTransactionsSchema } from '../tools/exportTransactions.js';
import {
  handleCompareTransactions,
  CompareTransactionsSchema,
} from '../tools/compareTransactions.js';
import {
  handleListCategories,
  handleGetCategory,
  handleUpdateCategory,
  ListCategoriesSchema,
  GetCategorySchema,
  UpdateCategorySchema,
} from '../tools/categoryTools.js';
import {
  handleListPayees,
  handleGetPayee,
  ListPayeesSchema,
  GetPayeeSchema,
} from '../tools/payeeTools.js';
import {
  handleGetMonth,
  handleListMonths,
  GetMonthSchema,
  ListMonthsSchema,
} from '../tools/monthTools.js';
import { handleGetUser, handleConvertAmount, ConvertAmountSchema } from '../tools/utilityTools.js';
import {
  handleFinancialOverview,
  handleSpendingAnalysis,
  handleBudgetHealthCheck,
  FinancialOverviewSchema,
  SpendingAnalysisSchema,
  BudgetHealthSchema,
} from '../tools/financialOverviewTools.js';
import { cacheManager } from './cacheManager.js';
import { responseFormatter } from './responseFormatter.js';

/**
 * YNAB MCP Server class that provides integration with You Need A Budget API
 */
export class YNABMCPServer {
  private server: Server;
  private ynabAPI: ynab.API;
  private config: ServerConfig;
  private exitOnError: boolean;
  private defaultBudgetId?: string;
  private serverVersion: string;

  constructor(exitOnError: boolean = true) {
    this.exitOnError = exitOnError;
    // Validate environment variables
    this.config = this.validateEnvironment();

    // Initialize YNAB API
    this.ynabAPI = new ynab.API(this.config.accessToken);

    // Determine server version (prefer package.json)
    this.serverVersion = this.readPackageVersion() ?? '0.0.0';

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'ynab-mcp-server',
        version: this.serverVersion,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * Validates environment variables and returns server configuration
   */
  private validateEnvironment(): ServerConfig {
    const accessToken = process.env['YNAB_ACCESS_TOKEN'];

    if (accessToken === undefined) {
      throw new ConfigurationError(
        'YNAB_ACCESS_TOKEN environment variable is required but not set',
      );
    }

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new ConfigurationError('YNAB_ACCESS_TOKEN must be a non-empty string');
    }

    return {
      accessToken: accessToken.trim(),
    };
  }

  /**
   * Validates the YNAB access token by making a test API call
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.ynabAPI.user.getUser();
      return true;
    } catch (error) {
      if (error instanceof Error) {
        // Check for authentication-related errors
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          throw new AuthenticationError('Invalid or expired YNAB access token');
        }
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
          throw new AuthenticationError('YNAB access token has insufficient permissions');
        }
      }
      throw new AuthenticationError(`Token validation failed: ${error}`);
    }
  }

  /**
   * Sets up MCP server request handlers
   */
  private setupHandlers(): void {
    // Handle list resources requests
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'ynab://budgets',
            name: 'YNAB Budgets',
            description: 'List of all available budgets',
            mimeType: 'application/json',
          },
          {
            name: 'set_output_format',
            description: 'Configure default JSON output formatting (minify or pretty spaces)',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                default_minify: { type: 'boolean', description: 'Default: true' },
                pretty_spaces: {
                  type: 'number',
                  minimum: 0,
                  maximum: 10,
                  description: 'Spaces for pretty printing when not minified',
                },
              },
              required: [],
            },
          },
          {
            uri: 'ynab://user',
            name: 'YNAB User Info',
            description: 'Current user information and subscription details',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Handle read resource requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'ynab://budgets':
          try {
            const response = await this.ynabAPI.budgets.getBudgets();
            const budgets = response.data.budgets.map((budget) => ({
              id: budget.id,
              name: budget.name,
              last_modified_on: budget.last_modified_on,
              first_month: budget.first_month,
              last_month: budget.last_month,
              currency_format: budget.currency_format,
            }));

            return {
              contents: [
                {
                  uri: uri,
                  mimeType: 'application/json',
                  text: responseFormatter.format({ budgets }),
                },
              ],
            };
          } catch (error) {
            throw new Error(`Failed to fetch budgets: ${error}`);
          }

        case 'ynab://user':
          try {
            const response = await this.ynabAPI.user.getUser();
            const user = {
              id: response.data.user.id,
            };

            return {
              contents: [
                {
                  uri: uri,
                  mimeType: 'application/json',
                  text: responseFormatter.format({ user }),
                },
              ],
            };
          } catch (error) {
            throw new Error(`Failed to fetch user info: ${error}`);
          }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });

    // Handle list prompts requests
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'create-transaction',
            description: 'Create a new transaction in YNAB',
            arguments: [
              {
                name: 'budget_name',
                description: 'Name of the budget (optional, uses first budget if not specified)',
                required: false,
              },
              {
                name: 'account_name',
                description: 'Name of the account',
                required: true,
              },
              {
                name: 'amount',
                description: 'Transaction amount (negative for expenses, positive for income)',
                required: true,
              },
              {
                name: 'payee',
                description: 'Who you paid or received money from',
                required: true,
              },
              {
                name: 'category',
                description: 'Budget category (optional)',
                required: false,
              },
              {
                name: 'memo',
                description: 'Additional notes (optional)',
                required: false,
              },
            ],
          },
          {
            name: 'budget-summary',
            description: 'Get a summary of your budget status',
            arguments: [
              {
                name: 'budget_name',
                description: 'Name of the budget (optional, uses first budget if not specified)',
                required: false,
              },
              {
                name: 'month',
                description:
                  'Month to analyze (YYYY-MM format, optional, uses current month if not specified)',
                required: false,
              },
            ],
          },
          {
            name: 'account-balances',
            description: 'Check balances across all accounts',
            arguments: [
              {
                name: 'budget_name',
                description: 'Name of the budget (optional, uses first budget if not specified)',
                required: false,
              },
              {
                name: 'account_type',
                description: 'Filter by account type (checking, savings, creditCard, etc.)',
                required: false,
              },
            ],
          },
        ],
      };
    });

    // Handle get prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'create-transaction': {
          const budgetName = args?.['budget_name'] || 'first available budget';
          const accountName = args?.['account_name'] || '[ACCOUNT_NAME]';
          const amount = args?.['amount'] || '[AMOUNT]';
          const payee = args?.['payee'] || '[PAYEE]';
          const category = args?.['category'] || '[CATEGORY]';
          const memo = args?.['memo'] || '';

          return {
            description: `Create a transaction for ${payee} in ${accountName}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please create a transaction with the following details:
- Budget: ${budgetName}
- Account: ${accountName}
- Amount: $${amount}
- Payee: ${payee}
- Category: ${category}
- Memo: ${memo}

Use the appropriate YNAB MCP tools to:
1. First, list budgets to find the budget ID
2. List accounts for that budget to find the account ID
3. If a category is specified, list categories to find the category ID
4. Create the transaction with the correct amount in milliunits (multiply by 1000)
5. Confirm the transaction was created successfully`,
                },
              },
            ],
          };
        }

        case 'budget-summary': {
          const summaryBudget = args?.['budget_name'] || 'first available budget';
          const month = args?.['month'] || 'current month';

          return {
            description: `Get budget summary for ${summaryBudget}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please provide a comprehensive budget summary for ${summaryBudget} (${month}):

IMPORTANT: In YNAB, understand these key fields:
- budgeted: Amount assigned to the category this month
- activity: Spending/income in the category this month (negative = spending)  
- balance: Available amount in the category = previous balance + budgeted + activity
- OVERSPENDING occurs when balance < 0 (Available goes negative), NOT when spending > budgeted for the month

SPENDING TRENDS: The analysis uses linear regression over multiple months to detect real spending patterns. Each trend includes:
- explanation: User-friendly description of what the trend means
- reliability_score: Confidence level (0-100%) indicating how reliable the trend is
- data_points: Number of months used in the analysis
Focus on trends with high reliability scores for actionable insights.

BUDGET OPTIMIZATION: The system provides three types of optimization insights:
1. "Consistently Under-Spent Categories" - Based on multi-month historical trends (reliable patterns)
2. "Categories Over Monthly Assignment" - Current month only (spending > budgeted but Available still positive)  
3. "Large Unused Category Balances" - Categories with substantial unused funds
Distinguish between current-month patterns vs historical trends when presenting insights.

1. List all budgets and select the appropriate one
2. Get monthly data for ${month}
3. List categories to show budget vs actual spending
4. Provide insights on:
   - Total budgeted vs actual spending
   - Categories where Available balance is negative (true overspending - when the category's balance field is < 0)
   - Categories where spending exceeded this month's assignment (but still have positive Available balance)
   - Available money to budget
   - Any true overspending where categories went into the red (negative Available balance)

Format the response in a clear, easy-to-read summary.`,
                },
              },
            ],
          };
        }

        case 'account-balances': {
          const balanceBudget = args?.['budget_name'] || 'first available budget';
          const accountType = args?.['account_type'] || 'all accounts';

          return {
            description: `Check account balances for ${accountType}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please show account balances for ${balanceBudget}:

1. List all budgets and select the appropriate one
2. List accounts for that budget
3. Filter by account type: ${accountType}
4. Show balances in a clear format with:
   - Account name and type
   - Current balance
   - Cleared vs uncleared amounts
   - Total by account type
   - Net worth summary (assets - liabilities)

Convert milliunits to dollars for easy reading.`,
                },
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });

    // Handle list tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_budgets',
            description: "List all budgets associated with the user's account",
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_budget',
            description: 'Get detailed information for a specific budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to retrieve',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'set_default_budget',
            description: 'Set the default budget for subsequent operations',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to set as default',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'get_default_budget',
            description: 'Get the currently set default budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'list_accounts',
            description:
              'List all accounts for a specific budget (uses default budget if not specified)',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description:
                    'The ID of the budget to list accounts for (optional, uses default budget if not provided)',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_account',
            description: 'Get detailed information for a specific account',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the account',
                },
                account_id: {
                  type: 'string',
                  description: 'The ID of the account to retrieve',
                },
              },
              required: ['budget_id', 'account_id'],
            },
          },
          {
            name: 'create_account',
            description: 'Create a new account in the specified budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to create the account in',
                },
                name: {
                  type: 'string',
                  description: 'The name of the new account',
                },
                type: {
                  type: 'string',
                  enum: [
                    'checking',
                    'savings',
                    'creditCard',
                    'cash',
                    'lineOfCredit',
                    'otherAsset',
                    'otherLiability',
                  ],
                  description: 'The type of account to create',
                },
                balance: {
                  type: 'number',
                  description: 'The initial balance of the account in currency units (optional)',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'If true, simulate the create without calling YNAB',
                },
              },
              required: ['budget_id', 'name', 'type'],
            },
          },
          {
            name: 'list_transactions',
            description: 'List transactions for a budget with optional filtering',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list transactions for',
                },
                account_id: {
                  type: 'string',
                  description: 'Optional: Filter transactions by account ID',
                },
                category_id: {
                  type: 'string',
                  description: 'Optional: Filter transactions by category ID',
                },
                since_date: {
                  type: 'string',
                  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                  description:
                    'Optional: Only return transactions on or after this date (ISO format: YYYY-MM-DD)',
                },
                type: {
                  type: 'string',
                  enum: ['uncategorized', 'unapproved'],
                  description: 'Optional: Filter by transaction type',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'export_transactions',
            description: 'Export all transactions to a JSON file with descriptive filename',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to export transactions from',
                },
                account_id: {
                  type: 'string',
                  description: 'Optional: Filter transactions by account ID',
                },
                category_id: {
                  type: 'string',
                  description: 'Optional: Filter transactions by category ID',
                },
                since_date: {
                  type: 'string',
                  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                  description:
                    'Optional: Only export transactions on or after this date (ISO format: YYYY-MM-DD)',
                },
                type: {
                  type: 'string',
                  enum: ['uncategorized', 'unapproved'],
                  description: 'Optional: Filter by transaction type',
                },
                filename: {
                  type: 'string',
                  description:
                    'Optional: Custom filename for export (auto-generated if not provided)',
                },
                minimal: {
                  type: 'boolean',
                  description:
                    'Optional: Export only essential fields (id, date, amount, payee_name, cleared) for smaller file size (default: true)',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'compare_transactions',
            description:
              'Compare bank transactions from CSV with YNAB transactions to find missing entries',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to compare against',
                },
                account_id: {
                  type: 'string',
                  description: 'The ID of the account to compare transactions for',
                },
                csv_file_path: {
                  type: 'string',
                  description: 'Optional: Path to CSV file containing bank transactions',
                },
                csv_data: {
                  type: 'string',
                  description: 'Optional: CSV data as string (alternative to csv_file_path)',
                },
                date_range_days: {
                  type: 'number',
                  minimum: 1,
                  maximum: 365,
                  description: 'Optional: Number of days to extend search range (default: 30)',
                },
                amount_tolerance: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description:
                    'Optional: Amount difference tolerance as decimal (0.01 = 1%, default: 0.01)',
                },
                date_tolerance_days: {
                  type: 'number',
                  minimum: 0,
                  maximum: 7,
                  description: 'Optional: Date difference tolerance in days (default: 5)',
                },
                csv_format: {
                  type: 'object',
                  description: 'Optional: CSV format configuration',
                  properties: {
                    date_column: {
                      type: 'string',
                      description: 'Column name for transaction date (default: "Date")',
                    },
                    amount_column: {
                      type: 'string',
                      description: 'Column name for transaction amount (default: "Amount")',
                    },
                    description_column: {
                      type: 'string',
                      description:
                        'Column name for transaction description (default: "Description")',
                    },
                    date_format: {
                      type: 'string',
                      description: 'Date format pattern (default: "MM/DD/YYYY")',
                    },
                    has_header: {
                      type: 'boolean',
                      description: 'Whether CSV has header row (default: true)',
                    },
                    delimiter: {
                      type: 'string',
                      description: 'CSV delimiter character (default: ",")',
                    },
                  },
                },
              },
              required: ['budget_id', 'account_id'],
            },
          },
          {
            name: 'get_transaction',
            description: 'Get detailed information for a specific transaction',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the transaction',
                },
                transaction_id: {
                  type: 'string',
                  description: 'The ID of the transaction to retrieve',
                },
              },
              required: ['budget_id', 'transaction_id'],
            },
          },
          {
            name: 'create_transaction',
            description: 'Create a new transaction in the specified budget and account',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to create the transaction in',
                },
                account_id: {
                  type: 'string',
                  description: 'The ID of the account for the transaction',
                },
                amount: {
                  type: 'integer',
                  description: 'The transaction amount in milliunits (negative for outflows)',
                },
                date: {
                  type: 'string',
                  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                  description: 'The transaction date in ISO format (YYYY-MM-DD)',
                },
                payee_name: {
                  type: 'string',
                  description: 'Optional: The payee name',
                },
                payee_id: {
                  type: 'string',
                  description: 'Optional: The payee ID',
                },
                category_id: {
                  type: 'string',
                  description: 'Optional: The category ID',
                },
                memo: {
                  type: 'string',
                  description: 'Optional: Transaction memo',
                },
                cleared: {
                  type: 'string',
                  enum: ['cleared', 'uncleared', 'reconciled'],
                  description: 'Optional: Transaction cleared status',
                },
                approved: {
                  type: 'boolean',
                  description: 'Optional: Whether the transaction is approved',
                },
                flag_color: {
                  type: 'string',
                  enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'],
                  description: 'Optional: Transaction flag color',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'If true, simulate the create without calling YNAB',
                },
              },
              required: ['budget_id', 'account_id', 'amount', 'date'],
            },
          },
          {
            name: 'update_transaction',
            description: 'Update an existing transaction',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the transaction',
                },
                transaction_id: {
                  type: 'string',
                  description: 'The ID of the transaction to update',
                },
                account_id: {
                  type: 'string',
                  description: 'Optional: Update the account ID',
                },
                amount: {
                  type: 'integer',
                  description: 'Optional: Update the amount in milliunits',
                },
                date: {
                  type: 'string',
                  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                  description: 'Optional: Update the date (ISO format: YYYY-MM-DD)',
                },
                payee_name: {
                  type: 'string',
                  description: 'Optional: Update the payee name',
                },
                payee_id: {
                  type: 'string',
                  description: 'Optional: Update the payee ID',
                },
                category_id: {
                  type: 'string',
                  description: 'Optional: Update the category ID',
                },
                memo: {
                  type: 'string',
                  description: 'Optional: Update the memo',
                },
                cleared: {
                  type: 'string',
                  enum: ['cleared', 'uncleared', 'reconciled'],
                  description: 'Optional: Update the cleared status',
                },
                approved: {
                  type: 'boolean',
                  description: 'Optional: Update the approved status',
                },
                flag_color: {
                  type: 'string',
                  enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'],
                  description: 'Optional: Update the flag color',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'If true, simulate the update without calling YNAB',
                },
              },
              required: ['budget_id', 'transaction_id'],
            },
          },
          {
            name: 'delete_transaction',
            description: 'Delete a transaction from the specified budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the transaction',
                },
                transaction_id: {
                  type: 'string',
                  description: 'The ID of the transaction to delete',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'If true, simulate the deletion without calling YNAB',
                },
              },
              required: ['budget_id', 'transaction_id'],
            },
          },
          {
            name: 'list_categories',
            description: 'List all categories for a specific budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list categories for',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'get_category',
            description: 'Get detailed information for a specific category',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the category',
                },
                category_id: {
                  type: 'string',
                  description: 'The ID of the category to retrieve',
                },
              },
              required: ['budget_id', 'category_id'],
            },
          },
          {
            name: 'update_category',
            description: 'Update the budgeted amount for a category in the current month',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the category',
                },
                category_id: {
                  type: 'string',
                  description: 'The ID of the category to update',
                },
                budgeted: {
                  type: 'integer',
                  description: 'The budgeted amount in milliunits (1/1000th of currency unit)',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'If true, simulate the update without calling YNAB',
                },
              },
              required: ['budget_id', 'category_id', 'budgeted'],
            },
          },
          {
            name: 'list_payees',
            description: 'List all payees for a specific budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list payees for',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'get_payee',
            description: 'Get detailed information for a specific payee',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the payee',
                },
                payee_id: {
                  type: 'string',
                  description: 'The ID of the payee to retrieve',
                },
              },
              required: ['budget_id', 'payee_id'],
            },
          },
          {
            name: 'get_month',
            description: 'Get budget data for a specific month',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to get month data for',
                },
                month: {
                  type: 'string',
                  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                  description: 'The month to retrieve in ISO format (YYYY-MM-DD)',
                },
              },
              required: ['budget_id', 'month'],
            },
          },
          {
            name: 'list_months',
            description: 'List all months summary data for a budget',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list months for',
                },
              },
              required: ['budget_id'],
            },
          },
          {
            name: 'get_user',
            description: 'Get information about the authenticated user',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'convert_amount',
            description:
              'Convert between dollars and milliunits with integer arithmetic for precision',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                amount: {
                  type: 'number',
                  description: 'The amount to convert',
                },
                to_milliunits: {
                  type: 'boolean',
                  description:
                    'If true, convert from dollars to milliunits. If false, convert from milliunits to dollars',
                },
              },
              required: ['amount', 'to_milliunits'],
            },
          },
          {
            name: 'financial_overview',
            description: 'Get comprehensive financial overview with insights, trends, and analysis',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'Budget ID (optional, uses default budget if not specified)',
                },
                months: {
                  type: 'number',
                  minimum: 1,
                  maximum: 12,
                  default: 3,
                  description: 'Number of months to analyze (1-12, default: 3)',
                },
                include_trends: {
                  type: 'boolean',
                  default: true,
                  description: 'Include spending trends analysis',
                },
                include_insights: {
                  type: 'boolean',
                  default: true,
                  description: 'Include AI-generated financial insights',
                },
              },
              required: [],
            },
          },
          {
            name: 'spending_analysis',
            description: 'Detailed spending analysis with category breakdowns and trends',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'Budget ID (optional)',
                },
                period_months: {
                  type: 'number',
                  minimum: 1,
                  maximum: 12,
                  default: 6,
                  description: 'Analysis period in months (1-12, default: 6)',
                },
                category_id: {
                  type: 'string',
                  description: 'Optional: Focus on specific category',
                },
              },
              required: [],
            },
          },
          {
            name: 'budget_health_check',
            description: 'Comprehensive budget health assessment with recommendations',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'Budget ID (optional)',
                },
                include_recommendations: {
                  type: 'boolean',
                  default: true,
                  description: 'Include actionable recommendations',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_memory_usage',
            description: 'Get current memory usage statistics for the MCP server',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_env_status',
            description: 'Debug: Show YNAB token presence and server environment info (masked)',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'server_info',
            description: 'Return server version, runtime info, uptime, and basic capabilities',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'security_stats',
            description: 'Return rate-limiting and request logging statistics (no sensitive data)',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'cache_stats',
            description: 'Return cache keys and size statistics',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
          {
            name: 'clear_cache',
            description: 'Clear the in-memory cache (safe, no YNAB data is modified)',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const perCallMinify = ((): boolean | undefined => {
        if (!args || typeof args !== 'object') return undefined;
        const anyArgs = args as Record<string, unknown>;
        for (const key of ['minify', '_minify', '__minify']) {
          if (key in anyArgs && typeof anyArgs[key] === 'boolean') {
            return anyArgs[key] as boolean;
          }
        }
        return undefined;
      })();

      return await responseFormatter.runWithMinifyOverride(perCallMinify, async () => {
        switch (name) {
          case 'list_budgets': {
            const exec = withSecurityWrapper(
              'ynab',
              'list_budgets',
              z.object({}),
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async () => handleListBudgets(this.ynabAPI));
          }

          case 'get_budget': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_budget',
              GetBudgetSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetBudget(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetBudget>[1],
              ),
            );
          }

          case 'set_default_budget': {
            const SetDefaultBudgetSchema = z.object({ budget_id: z.string().min(1) });
            const exec = withSecurityWrapper(
              'ynab',
              'set_default_budget',
              SetDefaultBudgetSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) => {
              const { budget_id } = validated as { budget_id: string };
              await this.ynabAPI.budgets.getBudgetById(budget_id);
              this.setDefaultBudget(budget_id);
              return {
                content: [
                  {
                    type: 'text',
                    text: responseFormatter.format({
                      success: true,
                      message: `Default budget set to: ${budget_id}`,
                      default_budget_id: budget_id,
                    }),
                  },
                ],
              };
            });
          }

          case 'get_default_budget':
            try {
              const defaultBudget = this.getDefaultBudget();

              return {
                content: [
                  {
                    type: 'text',
                    text: responseFormatter.format({
                      default_budget_id: defaultBudget || null,
                      has_default: !!defaultBudget,
                      message: defaultBudget
                        ? `Default budget is set to: ${defaultBudget}`
                        : 'No default budget is currently set',
                    }),
                  },
                ],
              };
            } catch (error) {
              return ErrorHandler.createValidationError(
                'Error getting default budget',
                error instanceof Error ? error.message : 'Unknown error',
              );
            }

          case 'list_accounts': {
            const raw = (args || {}) as Record<string, unknown>;
            const resolved = {
              ...raw,
              budget_id: this.getBudgetId(raw?.['budget_id'] as string | undefined),
            };
            const exec = withSecurityWrapper(
              'ynab',
              'list_accounts',
              ListAccountsSchema,
            )(this.config.accessToken)(resolved);
            return exec(async (validated) =>
              handleListAccounts(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleListAccounts>[1],
              ),
            );
          }

          case 'get_account': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_account',
              GetAccountSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetAccount(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetAccount>[1],
              ),
            );
          }

          case 'create_account': {
            const exec = withSecurityWrapper(
              'ynab',
              'create_account',
              CreateAccountSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleCreateAccount(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleCreateAccount>[1],
              ),
            );
          }

          case 'list_transactions': {
            const exec = withSecurityWrapper(
              'ynab',
              'list_transactions',
              ListTransactionsSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleListTransactions(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleListTransactions>[1],
              ),
            );
          }

          case 'export_transactions': {
            const exec = withSecurityWrapper(
              'ynab',
              'export_transactions',
              ExportTransactionsSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleExportTransactions(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleExportTransactions>[1],
              ),
            );
          }

          case 'compare_transactions': {
            const exec = withSecurityWrapper(
              'ynab',
              'compare_transactions',
              CompareTransactionsSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleCompareTransactions(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleCompareTransactions>[1],
              ),
            );
          }

          case 'get_transaction': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_transaction',
              GetTransactionSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetTransaction(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetTransaction>[1],
              ),
            );
          }

          case 'create_transaction': {
            const exec = withSecurityWrapper(
              'ynab',
              'create_transaction',
              CreateTransactionSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleCreateTransaction(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleCreateTransaction>[1],
              ),
            );
          }

          case 'update_transaction': {
            const exec = withSecurityWrapper(
              'ynab',
              'update_transaction',
              UpdateTransactionSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleUpdateTransaction(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleUpdateTransaction>[1],
              ),
            );
          }

          case 'delete_transaction': {
            const exec = withSecurityWrapper(
              'ynab',
              'delete_transaction',
              DeleteTransactionSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleDeleteTransaction(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleDeleteTransaction>[1],
              ),
            );
          }

          case 'list_categories': {
            const exec = withSecurityWrapper(
              'ynab',
              'list_categories',
              ListCategoriesSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleListCategories(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleListCategories>[1],
              ),
            );
          }

          case 'get_category': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_category',
              GetCategorySchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetCategory(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetCategory>[1],
              ),
            );
          }

          case 'update_category': {
            const exec = withSecurityWrapper(
              'ynab',
              'update_category',
              UpdateCategorySchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleUpdateCategory(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleUpdateCategory>[1],
              ),
            );
          }

          case 'list_payees': {
            const exec = withSecurityWrapper(
              'ynab',
              'list_payees',
              ListPayeesSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleListPayees(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleListPayees>[1],
              ),
            );
          }

          case 'get_payee': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_payee',
              GetPayeeSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetPayee(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetPayee>[1],
              ),
            );
          }

          case 'get_month': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_month',
              GetMonthSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleGetMonth(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleGetMonth>[1],
              ),
            );
          }

          case 'list_months': {
            const exec = withSecurityWrapper(
              'ynab',
              'list_months',
              ListMonthsSchema,
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async (validated) =>
              handleListMonths(
                this.ynabAPI,
                validated as unknown as Parameters<typeof handleListMonths>[1],
              ),
            );
          }

          case 'get_user': {
            const exec = withSecurityWrapper(
              'ynab',
              'get_user',
              z.object({}),
            )(this.config.accessToken)(args as Record<string, unknown>);
            return exec(async () => handleGetUser(this.ynabAPI));
          }

          case 'convert_amount':
            try {
              const params = ConvertAmountSchema.parse(args);
              return await handleConvertAmount(params);
            } catch (error) {
              return ErrorHandler.createValidationError(
                'Invalid parameters for ynab:convert_amount',
                error instanceof Error ? error.message : 'Unknown validation error',
              );
            }

          case 'financial_overview': {
            const exec = withSecurityWrapper(
              'ynab',
              'financial_overview',
              FinancialOverviewSchema,
            )(this.config.accessToken)((args || {}) as Record<string, unknown>);
            return exec(async (validated) => {
              const params = validated as unknown as Parameters<typeof handleFinancialOverview>[1];
              const budgetId = this.getBudgetId(params.budget_id);
              return handleFinancialOverview(this.ynabAPI, { ...params, budget_id: budgetId });
            });
          }

          case 'spending_analysis': {
            const exec = withSecurityWrapper(
              'ynab',
              'spending_analysis',
              SpendingAnalysisSchema,
            )(this.config.accessToken)((args || {}) as Record<string, unknown>);
            return exec(async (validated) => {
              const params = validated as unknown as Parameters<typeof handleSpendingAnalysis>[1];
              const budgetId = this.getBudgetId(params.budget_id);
              return handleSpendingAnalysis(this.ynabAPI, { ...params, budget_id: budgetId });
            });
          }

          case 'budget_health_check': {
            const exec = withSecurityWrapper(
              'ynab',
              'budget_health_check',
              BudgetHealthSchema,
            )(this.config.accessToken)((args || {}) as Record<string, unknown>);
            return exec(async (validated) => {
              const params = validated as unknown as Parameters<typeof handleBudgetHealthCheck>[1];
              const budgetId = this.getBudgetId(params.budget_id);
              return handleBudgetHealthCheck(this.ynabAPI, { ...params, budget_id: budgetId });
            });
          }

          case 'get_memory_usage':
            return this.getMemoryUsage();

          case 'server_info': {
            const uptimeMs = Math.round(process.uptime() * 1000);
            const mem = process.memoryUsage();
            const payload = {
              name: 'ynab-mcp-server',
              version: this.serverVersion,
              node_version: process.version,
              platform: process.platform,
              arch: process.arch,
              pid: process.pid,
              uptime_ms: uptimeMs,
              uptime_readable: this.formatUptime(uptimeMs),
              memory: {
                rss: mem.rss,
                heap_used: mem.heapUsed,
                heap_total: mem.heapTotal,
                external: mem.external,
              },
              env: {
                node_env: process.env['NODE_ENV'] || 'development',
                minify_output: process.env['YNAB_MCP_MINIFY_OUTPUT'] ?? 'true',
              },
            };
            return {
              content: [{ type: 'text', text: responseFormatter.format(payload) }],
            };
          }

          case 'security_stats': {
            const stats = SecurityMiddleware.getSecurityStats();
            return {
              content: [{ type: 'text', text: responseFormatter.format(stats) }],
            };
          }

          case 'cache_stats': {
            const stats = cacheManager.getStats();
            return {
              content: [{ type: 'text', text: responseFormatter.format(stats) }],
            };
          }

          case 'clear_cache': {
            cacheManager.clear();
            return {
              content: [{ type: 'text', text: responseFormatter.format({ success: true }) }],
            };
          }

          case 'get_env_status': {
            const token = process.env['YNAB_ACCESS_TOKEN'];
            const masked =
              token && token.length >= 8
                ? `${token.slice(0, 4)}...${token.slice(-4)}`
                : token
                  ? `${token[0]}***` // very short token, still mask
                  : null;

            const envKeys = Object.keys(process.env || {});
            const ynabEnvKeys = envKeys.filter((k) => k.toUpperCase().includes('YNAB'));

            const payload = {
              token_present: !!token,
              token_length: token ? token.length : 0,
              token_preview: masked,
              ynab_env_keys_present: ynabEnvKeys,
              node_version: process.version,
              platform: process.platform,
              pid: process.pid,
              cwd: process.cwd(),
            };

            return {
              content: [
                {
                  type: 'text',
                  text: responseFormatter.format(payload),
                },
              ],
            };
          }

          case 'set_output_format': {
            const raw = (args || {}) as { default_minify?: boolean; pretty_spaces?: number };
            const options: { defaultMinify?: boolean; prettySpaces?: number } = {};
            if (typeof raw.default_minify === 'boolean') options.defaultMinify = raw.default_minify;
            if (typeof raw.pretty_spaces === 'number' && Number.isFinite(raw.pretty_spaces)) {
              options.prettySpaces = Math.max(0, Math.min(10, Math.floor(raw.pretty_spaces)));
            }
            responseFormatter.configure(options);
            return {
              content: [
                {
                  type: 'text',
                  text: responseFormatter.format({ success: true, options }),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      });
    });
  }

  /**
   * Starts the MCP server with stdio transport
   */
  async run(): Promise<void> {
    try {
      // Validate token before starting server
      await this.validateToken();

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error('YNAB MCP Server started successfully');
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof ConfigurationError) {
        console.error(`Server startup failed: ${error.message}`);
        if (this.exitOnError) {
          process.exit(1);
        } else {
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Gets the YNAB API instance (for testing purposes)
   */
  getYNABAPI(): ynab.API {
    return this.ynabAPI;
  }

  /**
   * Gets the MCP server instance (for testing purposes)
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Sets the default budget ID for operations
   */
  setDefaultBudget(budgetId: string): void {
    this.defaultBudgetId = budgetId;
  }

  /**
   * Gets the default budget ID
   */
  getDefaultBudget(): string | undefined {
    return this.defaultBudgetId;
  }

  /**
   * Gets the budget ID to use - either provided or default
   */
  getBudgetId(providedBudgetId?: string): string {
    if (providedBudgetId) {
      return providedBudgetId;
    }
    if (this.defaultBudgetId) {
      return this.defaultBudgetId;
    }
    throw new Error(
      'No budget ID provided and no default budget set. Use set_default_budget first.',
    );
  }

  /**
   * Gets current memory usage statistics for the MCP server process
   */
  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    const uptimeMs = process.uptime() * 1000;
    const cacheStats = cacheManager.getStats();

    // Convert bytes to MB for readability
    const formatBytes = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

    // Estimate cache memory usage by serializing and measuring size
    const estimateCacheSize = () => {
      try {
        const serialized = JSON.stringify(Array.from(cacheManager['cache'].entries()));
        return Math.round(Buffer.byteLength(serialized, 'utf8') / 1024);
      } catch {
        return 0;
      }
    };

    const stats = {
      pid: process.pid,
      uptime_ms: Math.round(uptimeMs),
      uptime_readable: this.formatUptime(uptimeMs),
      memory: {
        rss: formatBytes(memUsage.rss),
        heap_used: formatBytes(memUsage.heapUsed),
        heap_total: formatBytes(memUsage.heapTotal),
        external: formatBytes(memUsage.external),
        array_buffers: formatBytes(memUsage.arrayBuffers || 0),
      },
      cache: {
        entries: cacheStats.size,
        estimated_size_kb: estimateCacheSize(),
        keys: cacheStats.keys,
      },
      memory_description: {
        rss: 'Resident Set Size - total memory allocated for the process',
        heap_used: 'Used heap memory (objects, closures, etc.)',
        heap_total: 'Total heap memory allocated',
        external: 'Memory used by C++ objects bound to JavaScript objects',
        array_buffers: 'Memory allocated for ArrayBuffer and SharedArrayBuffer',
      },
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    return {
      content: [
        {
          type: 'text',
          text: responseFormatter.format(stats),
        },
      ],
    };
  }

  /**
   * Formats uptime from milliseconds to readable format
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Try to read the package version for accurate server metadata
   */
  private readPackageVersion(): string | null {
    const candidates = [path.resolve(process.cwd(), 'package.json')];
    try {
      // May fail in bundled CJS builds; guard accordingly
      const metaUrl = (import.meta as unknown as { url?: string })?.url;
      if (metaUrl) {
        const maybe = path.resolve(path.dirname(new URL(metaUrl).pathname), '../../package.json');
        candidates.push(maybe);
      }
    } catch {
      // ignore
    }
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const pkg = JSON.parse(raw) as { version?: string };
          if (pkg.version && typeof pkg.version === 'string') return pkg.version;
        }
      } catch {
        // ignore and try next
      }
    }
    return null;
  }
}
