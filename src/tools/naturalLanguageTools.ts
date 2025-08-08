/**
 * Natural Language Tools for YNAB MCP
 * Provides natural language query processing and smart suggestions
 */

import { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { QueryProcessor } from '../server/queryProcessor.js';
import { handleToolError } from '../server/errorHandler.js';
import { z } from 'zod';

// Schema for natural language query tool
export const NaturalLanguageQuerySchema: Tool = {
  name: 'natural-language-query',
  description: 'Process natural language queries about your YNAB budget and provide structured responses with tool suggestions',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query about budget, transactions, accounts, etc.',
        minLength: 1
      }
    },
    required: ['query']
  }
};

// Schema for smart suggestions tool
export const SmartSuggestionsSchema: Tool = {
  name: 'get-smart-suggestions',
  description: 'Get contextual suggestions for YNAB operations based on recent activity and patterns',
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description: 'Context for suggestions (e.g., "budgeting", "transactions", "analysis")',
        enum: ['budgeting', 'transactions', 'analysis', 'general']
      }
    },
    required: ['context']
  }
};

// Validation schemas
const NaturalLanguageQueryInputSchema = z.object({
  query: z.string().min(1)
});

const SmartSuggestionsInputSchema = z.object({
  context: z.enum(['budgeting', 'transactions', 'analysis', 'general'])
});

/**
 * Handle natural language query processing
 */
export async function handleNaturalLanguageQuery(
  request: CallToolRequest
): Promise<CallToolResult> {
  try {
    const input = NaturalLanguageQueryInputSchema.parse(request.params.arguments);
    
    const response = QueryProcessor.processQuery(input.query);
    
    const result = {
      understood_query: input.query,
      intent: response.intent,
      confidence: response.intent.confidence,
      suggested_action: response.toolCall ? {
        tool: response.toolCall.name,
        parameters: response.toolCall.parameters,
        description: getToolDescription(response.toolCall.name)
      } : null,
      clarification: response.clarification,
      suggestions: response.suggestions,
      examples: getQueryExamples(response.intent.entity)
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return handleToolError(error, 'natural-language-query', 'processing query');
  }
}

/**
 * Handle smart suggestions
 */
export async function handleSmartSuggestions(
  request: CallToolRequest
): Promise<CallToolResult> {
  try {
    const input = SmartSuggestionsInputSchema.parse(request.params.arguments);
    
    const suggestions = generateSmartSuggestions(input.context);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            context: input.context,
            suggestions: suggestions.actions,
            tips: suggestions.tips,
            queries: suggestions.naturalLanguageQueries
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return handleToolError(error, 'get-smart-suggestions', 'generating suggestions');
  }
}

/**
 * Get description for a tool
 */
function getToolDescription(toolName: string): string {
  const descriptions: Record<string, string> = {
    'list-transactions': 'Retrieve and analyze your transaction history',
    'list-accounts': 'View account balances and account information', 
    'list-budgets': 'Show all your available budgets',
    'list-categories': 'Display budget categories and their allocations',
    'list-payees': 'Show payees you\'ve transacted with',
    'get-month': 'Get detailed budget information for a specific month',
    'create-transaction': 'Add a new transaction to your budget',
    'update-transaction': 'Modify an existing transaction'
  };
  
  return descriptions[toolName] || 'Perform a YNAB operation';
}

/**
 * Get example queries for different entities
 */
function getQueryExamples(entity: string): string[] {
  const examples: Record<string, string[]> = {
    'transactions': [
      "Show me my coffee purchases from last month",
      "How much did I spend on groceries this week?",
      "List all transactions over $100",
      "What did I buy at Target recently?"
    ],
    'accounts': [
      "What's my checking account balance?",
      "Show all my account balances",
      "How much do I have in savings?",
      "What's my net worth?"
    ],
    'budgets': [
      "Show me all my budgets",
      "What budget am I currently using?",
      "List my available budgets"
    ],
    'categories': [
      "Show my budget categories",
      "How much do I have left in my dining budget?",
      "What categories am I overspending in?",
      "List all my expense categories"
    ],
    'spending': [
      "How much did I spend last month?",
      "What's my biggest expense category?",
      "Show me my spending trends",
      "Where is my money going?"
    ],
    'unknown': [
      "Show my recent transactions",
      "What's my account balance?",
      "How much did I budget for groceries?",
      "List my expense categories"
    ]
  };
  
  return examples[entity] || examples['unknown'] || [];
}

/**
 * Generate contextual smart suggestions
 */
function generateSmartSuggestions(context: string): {
  actions: string[];
  tips: string[];
  naturalLanguageQueries: string[];
} {
  const suggestions: Record<string, {
    actions: string[];
    tips: string[];
    naturalLanguageQueries: string[];
  }> = {
    'budgeting': {
      actions: [
        'Review your monthly budget vs actual spending',
        'Check for overspending in any categories',
        'Look for categories with money left to reallocate',
        'Set up or adjust budget goals',
        'Review and update category budgets for next month'
      ],
      tips: [
        'Keep some money unallocated for unexpected expenses',
        'Review your budget weekly to stay on track',
        'Use the envelope method - when category money is gone, stop spending',
        'Consider seasonal variations when setting budgets'
      ],
      naturalLanguageQueries: [
        'Show me categories where I\'m overspending',
        'How much money do I have left to budget?',
        'What did I budget vs spend last month?',
        'Which categories have money left?'
      ]
    },
    'transactions': {
      actions: [
        'Review recent transactions for accuracy',
        'Categorize any uncategorized transactions',
        'Check for duplicate transactions',
        'Add missing transactions from cash purchases',
        'Split transactions that belong in multiple categories'
      ],
      tips: [
        'Enter transactions as soon as possible for accuracy',
        'Use descriptive payee names for easier searching',
        'Add memos to help remember what purchases were for',
        'Regularly reconcile with your bank statements'
      ],
      naturalLanguageQueries: [
        'Show me transactions from yesterday',
        'Find all uncategorized transactions',
        'What did I spend at grocery stores this month?',
        'Show me all transactions over $50'
      ]
    },
    'analysis': {
      actions: [
        'Compare spending across different time periods',
        'Analyze spending trends by category',
        'Review your biggest expenses',
        'Check your progress toward financial goals',
        'Identify areas where you can save money'
      ],
      tips: [
        'Look for patterns in your spending habits',
        'Compare your spending to similar previous periods',
        'Focus on the categories where you spend the most money',
        'Celebrate when you successfully stick to your budget'
      ],
      naturalLanguageQueries: [
        'How does this month compare to last month?',
        'What are my top 5 expense categories?',
        'How much did I save compared to my budget?',
        'Show me my spending trends over time'
      ]
    },
    'general': {
      actions: [
        'Check your account balances',
        'Review recent transactions',
        'Look at your budget summary',
        'Check for any overspending alerts',
        'Update any pending transactions'
      ],
      tips: [
        'Check your budget at least once a week',
        'Keep receipts until transactions are reconciled',
        'Use YNAB mobile app for quick transaction entry',
        'Set aside time each week for budget maintenance'
      ],
      naturalLanguageQueries: [
        'What\'s my financial overview?',
        'Show me what needs my attention',
        'How am I doing with my budget this month?',
        'What are my account balances?'
      ]
    }
  };
  
  return suggestions[context] ?? suggestions['general'] ?? {
    actions: [],
    tips: [],
    naturalLanguageQueries: []
  };
}