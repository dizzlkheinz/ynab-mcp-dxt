import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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

/**
 * YNAB MCP Server class that provides integration with You Need A Budget API
 */
export class YNABMCPServer {
  private server: Server;
  private ynabAPI: ynab.API;
  private config: ServerConfig;
  private exitOnError: boolean;

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
            name: 'list_accounts',
            description: 'List all accounts for a specific budget',
            inputSchema: {
              type: 'object',
              properties: {
                budget_id: {
                  type: 'string',
                  description: 'The ID of the budget to list accounts for',
                },
              },
              required: ['budget_id'],
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

        case 'list_accounts':
          try {
            const params = ListAccountsSchema.parse(args);
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
}