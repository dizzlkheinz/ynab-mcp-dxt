import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as ynab from 'ynab';
import { AuthenticationError, ConfigurationError, ServerConfig, ErrorHandler } from '../types/index.js';
import { handleListBudgets, handleGetBudget, GetBudgetSchema } from '../tools/budgetTools.js';
import { 
  handleListAccounts, 
  handleGetAccount, 
  handleCreateAccount,
  ListAccountsSchema,
  GetAccountSchema,
  CreateAccountSchema
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
  DeleteTransactionSchema
} from '../tools/transactionTools.js';
import {
  handleListCategories,
  handleGetCategory,
  handleUpdateCategory,
  ListCategoriesSchema,
  GetCategorySchema,
  UpdateCategorySchema
} from '../tools/categoryTools.js';
import {
  handleListPayees,
  handleGetPayee,
  ListPayeesSchema,
  GetPayeeSchema
} from '../tools/payeeTools.js';
import {
  handleGetMonth,
  handleListMonths,
  GetMonthSchema,
  ListMonthsSchema
} from '../tools/monthTools.js';
import {
  handleGetUser,
  handleConvertAmount,
  ConvertAmountSchema
} from '../tools/utilityTools.js';
import {
  handleNaturalLanguageQuery,
  handleSmartSuggestions,
  NaturalLanguageQuerySchema,
  SmartSuggestionsSchema
} from '../tools/naturalLanguageTools.js';
import {
  handleFinancialOverview,
  handleSpendingAnalysis,
  handleCashFlowForecast,
  handleBudgetHealthCheck,
  FinancialOverviewSchema,
  SpendingAnalysisSchema,
  CashFlowForecastSchema,
  BudgetHealthSchema
} from '../tools/financialOverviewTools.js';

/**
 * YNAB MCP Server class that provides integration with You Need A Budget API
 */
export class YNABMCPServer {
  private server: Server;
  private ynabAPI: ynab.API;
  private config: ServerConfig;
  private exitOnError: boolean;
  private defaultBudgetId?: string;

  constructor(exitOnError: boolean = true) {
    this.exitOnError = exitOnError;
    // Validate environment variables
    this.config = this.validateEnvironment();
    
    // Initialize YNAB API
    this.ynabAPI = new ynab.API(this.config.accessToken);
    
    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'ynab-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
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
        'YNAB_ACCESS_TOKEN environment variable is required but not set'
      );
    }

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new ConfigurationError(
        'YNAB_ACCESS_TOKEN must be a non-empty string'
      );
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
            mimeType: 'application/json'
          },
          {
            uri: 'ynab://user',
            name: 'YNAB User Info',
            description: 'Current user information and subscription details',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Handle read resource requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case 'ynab://budgets':
          try {
            const response = await this.ynabAPI.budgets.getBudgets();
            const budgets = response.data.budgets.map(budget => ({
              id: budget.id,
              name: budget.name,
              last_modified_on: budget.last_modified_on,
              first_month: budget.first_month,
              last_month: budget.last_month,
              currency_format: budget.currency_format
            }));
            
            return {
              contents: [
                {
                  uri: uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({ budgets }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new Error(`Failed to fetch budgets: ${error}`);
          }
          
        case 'ynab://user':
          try {
            const response = await this.ynabAPI.user.getUser();
            const user = {
              id: response.data.user.id
            };
            
            return {
              contents: [
                {
                  uri: uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({ user }, null, 2)
                }
              ]
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
                required: false
              },
              {
                name: 'account_name',
                description: 'Name of the account',
                required: true
              },
              {
                name: 'amount',
                description: 'Transaction amount (negative for expenses, positive for income)',
                required: true
              },
              {
                name: 'payee',
                description: 'Who you paid or received money from',
                required: true
              },
              {
                name: 'category',
                description: 'Budget category (optional)',
                required: false
              },
              {
                name: 'memo',
                description: 'Additional notes (optional)',
                required: false
              }
            ]
          },
          {
            name: 'budget-summary',
            description: 'Get a summary of your budget status',
            arguments: [
              {
                name: 'budget_name',
                description: 'Name of the budget (optional, uses first budget if not specified)',
                required: false
              },
              {
                name: 'month',
                description: 'Month to analyze (YYYY-MM format, optional, uses current month if not specified)',
                required: false
              }
            ]
          },
          {
            name: 'account-balances',
            description: 'Check balances across all accounts',
            arguments: [
              {
                name: 'budget_name',
                description: 'Name of the budget (optional, uses first budget if not specified)',
                required: false
              },
              {
                name: 'account_type',
                description: 'Filter by account type (checking, savings, creditCard, etc.)',
                required: false
              }
            ]
          }
        ]
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
5. Confirm the transaction was created successfully`
                }
              }
            ]
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

Format the response in a clear, easy-to-read summary.`
                }
              }
            ]
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

Convert milliunits to dollars for easy reading.`
                }
              }
            ]
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
            description: 'List all budgets associated with the user\'s account',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_budget',
            description: 'Get detailed information for a specific budget',
            inputSchema: {
              type: 'object',
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
              properties: {},
              required: [],
            },
          },
          {
            name: 'list_accounts',
            description: 'List all accounts for a specific budget (uses default budget if not specified)',
            inputSchema: {
              type: 'object',
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list accounts for (optional, uses default budget if not provided)',
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
                  enum: ['checking', 'savings', 'creditCard', 'cash', 'lineOfCredit', 'otherAsset', 'otherLiability'],
                  description: 'The type of account to create',
                },
                balance: {
                  type: 'number',
                  description: 'The initial balance of the account in currency units (optional)',
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
                  description: 'Optional: Only return transactions on or after this date (ISO format: YYYY-MM-DD)',
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
            name: 'get_transaction',
            description: 'Get detailed information for a specific transaction',
            inputSchema: {
              type: 'object',
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
              },
              required: ['budget_id', 'account_id', 'amount', 'date'],
            },
          },
          {
            name: 'update_transaction',
            description: 'Update an existing transaction',
            inputSchema: {
              type: 'object',
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
              },
              required: ['budget_id', 'transaction_id'],
            },
          },
          {
            name: 'delete_transaction',
            description: 'Delete a transaction from the specified budget',
            inputSchema: {
              type: 'object',
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget containing the transaction',
                },
                transaction_id: {
                  type: 'string',
                  description: 'The ID of the transaction to delete',
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
              },
              required: ['budget_id', 'category_id', 'budgeted'],
            },
          },
          {
            name: 'list_payees',
            description: 'List all payees for a specific budget',
            inputSchema: {
              type: 'object',
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
              properties: {},
              required: [],
            },
          },
          {
            name: 'convert_amount',
            description: 'Convert between dollars and milliunits with integer arithmetic for precision',
            inputSchema: {
              type: 'object',
              properties: {
                amount: {
                  type: 'number',
                  description: 'The amount to convert',
                },
                to_milliunits: {
                  type: 'boolean',
                  description: 'If true, convert from dollars to milliunits. If false, convert from milliunits to dollars',
                },
              },
              required: ['amount', 'to_milliunits'],
            },
          },
          NaturalLanguageQuerySchema,
          SmartSuggestionsSchema,
          {
            name: 'financial_overview',
            description: 'Get comprehensive financial overview with insights, trends, and analysis',
            inputSchema: {
              type: 'object',
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
            name: 'cash_flow_forecast',
            description: 'Predict future cash flow based on historical data and scheduled transactions',
            inputSchema: {
              type: 'object',
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'Budget ID (optional)',
                },
                forecast_months: {
                  type: 'number',
                  minimum: 1,
                  maximum: 12,
                  default: 3,
                  description: 'Number of months to forecast (1-12, default: 3)',
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
        ],
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'list_budgets':
          return await handleListBudgets(this.ynabAPI);

        case 'get_budget':
          try {
            const params = GetBudgetSchema.parse(args);
            return await handleGetBudget(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_budget',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'set_default_budget':
          try {
            const { budget_id } = args as { budget_id: string };
            if (!budget_id) {
              throw new Error('budget_id is required');
            }
            
            // Validate that the budget exists
            try {
              await this.ynabAPI.budgets.getBudgetById(budget_id);
              this.setDefaultBudget(budget_id);
              
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Default budget set to: ${budget_id}`,
                      default_budget_id: budget_id
                    }, null, 2)
                  }
                ]
              };
            } catch (error) {
              throw new Error(`Invalid budget ID: ${budget_id}. Budget not found.`);
            }
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:set_default_budget',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_default_budget':
          try {
            const defaultBudget = this.getDefaultBudget();
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    default_budget_id: defaultBudget || null,
                    has_default: !!defaultBudget,
                    message: defaultBudget 
                      ? `Default budget is set to: ${defaultBudget}`
                      : 'No default budget is currently set'
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Error getting default budget',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }

        case 'list_accounts':
          try {
            const rawParams = args as any;
            const budgetId = this.getBudgetId(rawParams?.budget_id);
            const params = ListAccountsSchema.parse({ ...rawParams, budget_id: budgetId });
            return await handleListAccounts(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:list_accounts',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_account':
          try {
            const params = GetAccountSchema.parse(args);
            return await handleGetAccount(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_account',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'create_account':
          try {
            const params = CreateAccountSchema.parse(args);
            return await handleCreateAccount(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:create_account',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'list_transactions':
          try {
            const params = ListTransactionsSchema.parse(args);
            return await handleListTransactions(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:list_transactions',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_transaction':
          try {
            const params = GetTransactionSchema.parse(args);
            return await handleGetTransaction(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_transaction',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'create_transaction':
          try {
            const params = CreateTransactionSchema.parse(args);
            return await handleCreateTransaction(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:create_transaction',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'update_transaction':
          try {
            const params = UpdateTransactionSchema.parse(args);
            return await handleUpdateTransaction(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:update_transaction',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'delete_transaction':
          try {
            const params = DeleteTransactionSchema.parse(args);
            return await handleDeleteTransaction(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:delete_transaction',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'list_categories':
          try {
            const params = ListCategoriesSchema.parse(args);
            return await handleListCategories(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:list_categories',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_category':
          try {
            const params = GetCategorySchema.parse(args);
            return await handleGetCategory(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_category',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'update_category':
          try {
            const params = UpdateCategorySchema.parse(args);
            return await handleUpdateCategory(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:update_category',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'list_payees':
          try {
            const params = ListPayeesSchema.parse(args);
            return await handleListPayees(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:list_payees',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_payee':
          try {
            const params = GetPayeeSchema.parse(args);
            return await handleGetPayee(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_payee',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_month':
          try {
            const params = GetMonthSchema.parse(args);
            return await handleGetMonth(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:get_month',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'list_months':
          try {
            const params = ListMonthsSchema.parse(args);
            return await handleListMonths(this.ynabAPI, params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:list_months',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'get_user':
          return await handleGetUser(this.ynabAPI);

        case 'convert_amount':
          try {
            const params = ConvertAmountSchema.parse(args);
            return await handleConvertAmount(params);
          } catch (error) {
            return ErrorHandler.createValidationError(
              'Invalid parameters for ynab:convert_amount',
              error instanceof Error ? error.message : 'Unknown validation error'
            );
          }

        case 'natural-language-query':
          return await handleNaturalLanguageQuery({ 
            method: 'tools/call',
            params: { name, arguments: args }
          });

        case 'get-smart-suggestions':
          return await handleSmartSuggestions({ 
            method: 'tools/call',
            params: { name, arguments: args }
          });

        case 'financial_overview':
          try {
            const params = FinancialOverviewSchema.parse(args || {});
            const budgetId = this.getBudgetId(params.budget_id);
            return await handleFinancialOverview(this.ynabAPI, { ...params, budget_id: budgetId });
          } catch (error) {
            throw new Error(
              'Invalid parameters for ynab:financial_overview: ' +
              (error instanceof Error ? error.message : 'Unknown validation error')
            );
          }

        case 'spending_analysis':
          try {
            const params = SpendingAnalysisSchema.parse(args || {});
            const budgetId = this.getBudgetId(params.budget_id);
            return await handleSpendingAnalysis(this.ynabAPI, { ...params, budget_id: budgetId });
          } catch (error) {
            throw new Error(
              'Invalid parameters for ynab:spending_analysis: ' +
              (error instanceof Error ? error.message : 'Unknown validation error')
            );
          }

        case 'cash_flow_forecast':
          try {
            const params = CashFlowForecastSchema.parse(args || {});
            const budgetId = this.getBudgetId(params.budget_id);
            return await handleCashFlowForecast(this.ynabAPI, { ...params, budget_id: budgetId });
          } catch (error) {
            throw new Error(
              'Invalid parameters for ynab:cash_flow_forecast: ' +
              (error instanceof Error ? error.message : 'Unknown validation error')
            );
          }

        case 'budget_health_check':
          try {
            const params = BudgetHealthSchema.parse(args || {});
            const budgetId = this.getBudgetId(params.budget_id);
            return await handleBudgetHealthCheck(this.ynabAPI, { ...params, budget_id: budgetId });
          } catch (error) {
            throw new Error(
              'Invalid parameters for ynab:budget_health_check: ' +
              (error instanceof Error ? error.message : 'Unknown validation error')
            );
          }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
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
    throw new Error('No budget ID provided and no default budget set. Use set_default_budget first.');
  }
}