import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod/v4';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
import { handleReconcileAccount, ReconcileAccountSchema } from '../tools/reconcileAccount.js';
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
import { cacheManager, CacheManager } from './cacheManager.js';
import { responseFormatter } from './responseFormatter.js';
import {
  ToolRegistry,
  type ToolDefinition,
  type DefaultArgumentResolver,
  type ToolExecutionPayload,
} from './toolRegistry.js';

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
  private toolRegistry: ToolRegistry;

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

    this.toolRegistry = new ToolRegistry({
      withSecurityWrapper,
      errorHandler: ErrorHandler,
      responseFormatter,
      cacheHelpers: {
        generateKey: (...segments: unknown[]) => {
          const normalized = segments.map((segment) => {
            if (
              typeof segment === 'string' ||
              typeof segment === 'number' ||
              typeof segment === 'boolean' ||
              segment === undefined
            ) {
              return segment;
            }
            return JSON.stringify(segment);
          }) as Array<string | number | boolean | undefined>;
          return CacheManager.generateKey('tool', ...normalized);
        },
        invalidate: (key: string) => {
          cacheManager.delete(key);
        },
        clear: () => {
          cacheManager.clear();
        },
      },
    });

    this.setupToolRegistry();
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
        tools: this.toolRegistry.listTools(),
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const rawArgs = (request.params.arguments ?? undefined) as Record<string, unknown> | undefined;
      const minifyOverride = this.extractMinifyOverride(rawArgs);

      const sanitizedArgs = rawArgs
        ? (() => {
            const clone: Record<string, unknown> = { ...rawArgs };
            delete clone['minify'];
            delete clone['_minify'];
            delete clone['__minify'];
            return clone;
          })()
        : undefined;

      return await this.toolRegistry.executeTool({
        name: request.params.name,
        accessToken: this.config.accessToken,
        arguments: sanitizedArgs,
        minifyOverride,
      });
    });
  }



  /**
   * Registers all tools with the registry to centralize handler execution
   */
  private setupToolRegistry(): void {
    const register = <TInput extends Record<string, unknown>>(definition: ToolDefinition<TInput>): void => {
      this.toolRegistry.register(definition);
    };

    const adapt =
      <TInput extends Record<string, unknown>>(
        handler: (ynabAPI: ynab.API, params: TInput) => Promise<CallToolResult>,
      ) =>
      async ({ input }: ToolExecutionPayload<TInput>): Promise<CallToolResult> =>
        handler(this.ynabAPI, input);

    const adaptNoInput = (
      handler: (ynabAPI: ynab.API) => Promise<CallToolResult>,
    ) =>
      async (_payload: ToolExecutionPayload<Record<string, unknown>>): Promise<CallToolResult> =>
        handler(this.ynabAPI);

    const resolveBudgetId = <TInput extends { budget_id?: string }>(): DefaultArgumentResolver<TInput> => {
      return ({ rawArguments }) => {
        const provided =
          typeof rawArguments['budget_id'] === 'string' && rawArguments['budget_id'].length > 0
            ? (rawArguments['budget_id'] as string)
            : undefined;
        return { budget_id: this.getBudgetId(provided) } as Partial<TInput>;
      };
    };

    const emptyObjectSchema = z.object({}).strict();
    const setDefaultBudgetSchema = z.object({ budget_id: z.string().min(1) }).strict();
    const diagnosticInfoSchema = z
      .object({
        include_memory: z.boolean().default(true),
        include_environment: z.boolean().default(true),
        include_server: z.boolean().default(true),
        include_security: z.boolean().default(true),
        include_cache: z.boolean().default(true),
      })
      .strict();
    const setOutputFormatSchema = z
      .object({
        default_minify: z.boolean().optional(),
        pretty_spaces: z.number().int().min(0).max(10).optional(),
      })
      .strict();

    register({
      name: 'list_budgets',
      description: "List all budgets associated with the user's account",
      inputSchema: emptyObjectSchema,
      handler: adaptNoInput(handleListBudgets),
    });

    register({
      name: 'get_budget',
      description: 'Get detailed information for a specific budget',
      inputSchema: GetBudgetSchema,
      handler: adapt(handleGetBudget),
    });

    register({
      name: 'set_default_budget',
      description: 'Set the default budget for subsequent operations',
      inputSchema: setDefaultBudgetSchema,
      handler: async ({ input }) => {
        const { budget_id } = input;
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
      },
    });

    register({
      name: 'get_default_budget',
      description: 'Get the currently set default budget',
      inputSchema: emptyObjectSchema,
      handler: async () => {
        try {
          const defaultBudget = this.getDefaultBudget();
          return {
            content: [
              {
                type: 'text',
                text: responseFormatter.format({
                  default_budget_id: defaultBudget ?? null,
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
      },
    });

    register({
      name: 'list_accounts',
      description: 'List all accounts for a specific budget (uses default budget if not specified)',
      inputSchema: ListAccountsSchema,
      handler: adapt(handleListAccounts),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ListAccountsSchema>>(),
    });

    register({
      name: 'get_account',
      description: 'Get detailed information for a specific account',
      inputSchema: GetAccountSchema,
      handler: adapt(handleGetAccount),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof GetAccountSchema>>(),
    });

    register({
      name: 'create_account',
      description: 'Create a new account in the specified budget',
      inputSchema: CreateAccountSchema,
      handler: adapt(handleCreateAccount),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof CreateAccountSchema>>(),
    });

    register({
      name: 'list_transactions',
      description: 'List transactions for a budget with optional filtering',
      inputSchema: ListTransactionsSchema,
      handler: adapt(handleListTransactions),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ListTransactionsSchema>>(),
    });

    register({
      name: 'export_transactions',
      description: 'Export all transactions to a JSON file with descriptive filename',
      inputSchema: ExportTransactionsSchema,
      handler: adapt(handleExportTransactions),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ExportTransactionsSchema>>(),
    });

    register({
      name: 'compare_transactions',
      description: 'Compare bank transactions from CSV with YNAB transactions to find missing entries',
      inputSchema: CompareTransactionsSchema,
      handler: adapt(handleCompareTransactions),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof CompareTransactionsSchema>>(),
    });

    register({
      name: 'reconcile_account',
      description:
        'Perform comprehensive account reconciliation with bank statement data, including automatic transaction creation and status updates',
      inputSchema: ReconcileAccountSchema,
      handler: adapt(handleReconcileAccount),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ReconcileAccountSchema>>(),
    });

    register({
      name: 'get_transaction',
      description: 'Get detailed information for a specific transaction',
      inputSchema: GetTransactionSchema,
      handler: adapt(handleGetTransaction),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof GetTransactionSchema>>(),
    });

    register({
      name: 'create_transaction',
      description: 'Create a new transaction in the specified budget and account',
      inputSchema: CreateTransactionSchema,
      handler: adapt(handleCreateTransaction),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof CreateTransactionSchema>>(),
    });

    register({
      name: 'update_transaction',
      description: 'Update an existing transaction',
      inputSchema: UpdateTransactionSchema,
      handler: adapt(handleUpdateTransaction),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof UpdateTransactionSchema>>(),
    });

    register({
      name: 'delete_transaction',
      description: 'Delete a transaction from the specified budget',
      inputSchema: DeleteTransactionSchema,
      handler: adapt(handleDeleteTransaction),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof DeleteTransactionSchema>>(),
    });

    register({
      name: 'list_categories',
      description: 'List all categories for a specific budget',
      inputSchema: ListCategoriesSchema,
      handler: adapt(handleListCategories),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ListCategoriesSchema>>(),
    });

    register({
      name: 'get_category',
      description: 'Get detailed information for a specific category',
      inputSchema: GetCategorySchema,
      handler: adapt(handleGetCategory),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof GetCategorySchema>>(),
    });

    register({
      name: 'update_category',
      description: 'Update the budgeted amount for a category in the current month',
      inputSchema: UpdateCategorySchema,
      handler: adapt(handleUpdateCategory),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof UpdateCategorySchema>>(),
    });

    register({
      name: 'list_payees',
      description: 'List all payees for a specific budget',
      inputSchema: ListPayeesSchema,
      handler: adapt(handleListPayees),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ListPayeesSchema>>(),
    });

    register({
      name: 'get_payee',
      description: 'Get detailed information for a specific payee',
      inputSchema: GetPayeeSchema,
      handler: adapt(handleGetPayee),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof GetPayeeSchema>>(),
    });

    register({
      name: 'get_month',
      description: 'Get budget data for a specific month',
      inputSchema: GetMonthSchema,
      handler: adapt(handleGetMonth),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof GetMonthSchema>>(),
    });

    register({
      name: 'list_months',
      description: 'List all months summary data for a budget',
      inputSchema: ListMonthsSchema,
      handler: adapt(handleListMonths),
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof ListMonthsSchema>>(),
    });

    register({
      name: 'get_user',
      description: 'Get information about the authenticated user',
      inputSchema: emptyObjectSchema,
      handler: adaptNoInput(handleGetUser),
    });

    register({
      name: 'convert_amount',
      description: 'Convert between dollars and milliunits with integer arithmetic for precision',
      inputSchema: ConvertAmountSchema,
      handler: async ({ input }) => handleConvertAmount(input),
    });

    register({
      name: 'financial_overview',
      description: 'Get comprehensive financial overview with insights, trends, and analysis',
      inputSchema: FinancialOverviewSchema,
      handler: async ({ input }) => {
        const budgetId = this.getBudgetId(input.budget_id);
        return handleFinancialOverview(this.ynabAPI, { ...input, budget_id: budgetId });
      },
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof FinancialOverviewSchema>>(),
    });

    register({
      name: 'spending_analysis',
      description: 'Detailed spending analysis with category breakdowns and trends',
      inputSchema: SpendingAnalysisSchema,
      handler: async ({ input }) => {
        const budgetId = this.getBudgetId(input.budget_id);
        return handleSpendingAnalysis(this.ynabAPI, { ...input, budget_id: budgetId });
      },
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof SpendingAnalysisSchema>>(),
    });

    register({
      name: 'budget_health_check',
      description: 'Comprehensive budget health assessment with recommendations',
      inputSchema: BudgetHealthSchema,
      handler: async ({ input }) => {
        const budgetId = this.getBudgetId(input.budget_id);
        return handleBudgetHealthCheck(this.ynabAPI, { ...input, budget_id: budgetId });
      },
      defaultArgumentResolver: resolveBudgetId<z.infer<typeof BudgetHealthSchema>>(),
    });

    register({
      name: 'diagnostic_info',
      description: 'Get comprehensive diagnostic information about the MCP server',
      inputSchema: diagnosticInfoSchema,
      handler: async ({ input }) => {
        const diagnostics: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
        };

        if (input.include_server) {
          const uptimeMs = Math.round(process.uptime() * 1000);
          diagnostics['server'] = {
            name: 'ynab-mcp-server',
            version: this.serverVersion,
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            uptime_ms: uptimeMs,
            uptime_readable: this.formatUptime(uptimeMs),
            env: {
              node_env: process.env['NODE_ENV'] || 'development',
              minify_output: process.env['YNAB_MCP_MINIFY_OUTPUT'] ?? 'true',
            },
          };
        }

        if (input.include_memory) {
          const memUsage = process.memoryUsage();
          const formatBytes = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
          diagnostics['memory'] = {
            rss_mb: formatBytes(memUsage.rss),
            heap_used_mb: formatBytes(memUsage.heapUsed),
            heap_total_mb: formatBytes(memUsage.heapTotal),
            external_mb: formatBytes(memUsage.external),
            array_buffers_mb: formatBytes(memUsage.arrayBuffers ?? 0),
            description: {
              rss: 'Resident Set Size - total memory allocated for the process',
              heap_used: 'Used heap memory (objects, closures, etc.)',
              heap_total: 'Total heap memory allocated',
              external: 'Memory used by C++ objects bound to JavaScript objects',
              array_buffers: 'Memory allocated for ArrayBuffer and SharedArrayBuffer',
            },
          };
        }

        if (input.include_environment) {
          const token = process.env['YNAB_ACCESS_TOKEN'];
          const masked =
            token && token.length >= 8
              ? `${token.slice(0, 4)}...${token.slice(-4)}`
              : token
                ? `${token.slice(0, 1)}***`
                : null;
          const envKeys = Object.keys(process.env ?? {});
          const ynabEnvKeys = envKeys.filter((key) => key.toUpperCase().includes('YNAB'));
          diagnostics['environment'] = {
            token_present: !!token,
            token_length: token ? token.length : 0,
            token_preview: masked,
            ynab_env_keys_present: ynabEnvKeys,
            working_directory: process.cwd(),
          };
        }

        if (input.include_security) {
          diagnostics['security'] = SecurityMiddleware.getSecurityStats();
        }

        if (input.include_cache) {
          const cacheStats = cacheManager.getStats();
          const estimateCacheSize = () => {
            try {
              const serialized = JSON.stringify(cacheManager.getEntriesForSizeEstimation());
              return Math.round(Buffer.byteLength(serialized, 'utf8') / 1024);
            } catch {
              return 0;
            }
          };

          diagnostics['cache'] = {
            entries: cacheStats.size,
            estimated_size_kb: estimateCacheSize(),
            keys: cacheStats.keys,
          };
        }

        return {
          content: [{ type: 'text', text: responseFormatter.format(diagnostics) }],
        };
      },
    });

    register({
      name: 'clear_cache',
      description: 'Clear the in-memory cache (safe, no YNAB data is modified)',
      inputSchema: emptyObjectSchema,
      handler: async () => {
        cacheManager.clear();
        return {
          content: [{ type: 'text', text: responseFormatter.format({ success: true }) }],
        };
      },
    });

    register({
      name: 'set_output_format',
      description: 'Configure default JSON output formatting (minify or pretty spaces)',
      inputSchema: setOutputFormatSchema,
      handler: async ({ input }) => {
        const options: { defaultMinify?: boolean; prettySpaces?: number } = {};
        if (typeof input.default_minify === 'boolean') {
          options.defaultMinify = input.default_minify;
        }
        if (typeof input.pretty_spaces === 'number') {
          options.prettySpaces = Math.max(0, Math.min(10, Math.floor(input.pretty_spaces)));
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
      },
    });
  }

  private extractMinifyOverride(args: Record<string, unknown> | undefined): boolean | undefined {
    if (!args) {
      return undefined;
    }

    for (const key of ['minify', '_minify', '__minify'] as const) {
      const value = args[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return undefined;
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
