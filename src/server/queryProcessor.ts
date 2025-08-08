/**
 * Natural Language Query Processor for YNAB MCP
 * Processes natural language queries and converts them to structured tool calls
 */

export interface QueryIntent {
  action: string;
  entity: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

export interface QueryResponse {
  intent: QueryIntent;
  toolCall?: {
    name: string;
    parameters: Record<string, unknown>;
  };
  clarification?: string;
  suggestions?: string[];
}

export class QueryProcessor {
  /**
   * Process natural language query and return structured response
   */
  static processQuery(query: string): QueryResponse {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Transaction queries
    if (this.isTransactionQuery(normalizedQuery)) {
      return this.processTransactionQuery(normalizedQuery);
    }
    
    // Budget queries
    if (this.isBudgetQuery(normalizedQuery)) {
      return this.processBudgetQuery(normalizedQuery);
    }
    
    // Account queries
    if (this.isAccountQuery(normalizedQuery)) {
      return this.processAccountQuery(normalizedQuery);
    }
    
    // Category queries
    if (this.isCategoryQuery(normalizedQuery)) {
      return this.processCategoryQuery();
    }
    
    // Spending/analysis queries
    if (this.isSpendingAnalysisQuery(normalizedQuery)) {
      return this.processSpendingAnalysisQuery(normalizedQuery);
    }
    
    // Default response with suggestions
    return {
      intent: {
        action: 'unknown',
        entity: 'unknown',
        parameters: {},
        confidence: 0
      },
      clarification: "I'm not sure what you're looking for. Here are some things I can help with:",
      suggestions: [
        "Show my transactions from last month",
        "What's my account balance?",
        "How much did I spend on groceries?",
        "List my budget categories",
        "Show my recent coffee purchases",
        "What's my net worth?"
      ]
    };
  }

  // Transaction query detection and processing
  private static isTransactionQuery(query: string): boolean {
    const transactionKeywords = [
      'transaction', 'transactions', 'purchase', 'purchases', 'expense', 'expenses',
      'income', 'payment', 'payments', 'spent', 'spend', 'spending', 'bought', 'paid'
    ];
    return transactionKeywords.some(keyword => query.includes(keyword));
  }

  private static processTransactionQuery(query: string): QueryResponse {
    // Extract time period
    const timePeriod = this.extractTimePeriod(query);
    const category = this.extractCategory(query);
    const payee = this.extractPayee(query);
    // const amount = this.extractAmount(query);

    // Determine specific intent
    if (query.includes('show') || query.includes('list') || query.includes('recent')) {
      return {
        intent: {
          action: 'list',
          entity: 'transactions',
          parameters: { timePeriod, category, payee },
          confidence: 0.8
        },
        toolCall: {
          name: 'list-transactions',
          parameters: this.buildTransactionParameters(timePeriod)
        }
      };
    }

    if (query.includes('how much') || query.includes('total') || query.includes('sum')) {
      return {
        intent: {
          action: 'analyze',
          entity: 'spending',
          parameters: { timePeriod, category, payee },
          confidence: 0.8
        },
        toolCall: {
          name: 'list-transactions',
          parameters: this.buildTransactionParameters(timePeriod)
        }
      };
    }

    return {
      intent: {
        action: 'list',
        entity: 'transactions',
        parameters: { timePeriod, category, payee },
        confidence: 0.6
      },
      toolCall: {
        name: 'list-transactions',
        parameters: this.buildTransactionParameters(timePeriod)
      }
    };
  }

  // Budget query processing
  private static isBudgetQuery(query: string): boolean {
    const budgetKeywords = ['budget', 'budgets', 'budgeted', 'allocated', 'available'];
    return budgetKeywords.some(keyword => query.includes(keyword));
  }

  private static processBudgetQuery(query: string): QueryResponse {
    if (query.includes('list') || query.includes('show') || query.includes('all')) {
      return {
        intent: {
          action: 'list',
          entity: 'budgets',
          parameters: {},
          confidence: 0.9
        },
        toolCall: {
          name: 'list-budgets',
          parameters: {}
        }
      };
    }

    return {
      intent: {
        action: 'list',
        entity: 'categories',
        parameters: {},
        confidence: 0.7
      },
      toolCall: {
        name: 'list-categories',
        parameters: {}
      }
    };
  }

  // Account query processing
  private static isAccountQuery(query: string): boolean {
    const accountKeywords = ['account', 'accounts', 'balance', 'balances'];
    return accountKeywords.some(keyword => query.includes(keyword));
  }

  private static processAccountQuery(query: string): QueryResponse {
    if (query.includes('balance') || query.includes('balances')) {
      return {
        intent: {
          action: 'get',
          entity: 'balances',
          parameters: {},
          confidence: 0.9
        },
        toolCall: {
          name: 'list-accounts',
          parameters: {}
        }
      };
    }

    return {
      intent: {
        action: 'list',
        entity: 'accounts',
        parameters: {},
        confidence: 0.8
      },
      toolCall: {
        name: 'list-accounts',
        parameters: {}
      }
    };
  }

  // Category query processing
  private static isCategoryQuery(query: string): boolean {
    const categoryKeywords = ['category', 'categories', 'group', 'groups'];
    return categoryKeywords.some(keyword => query.includes(keyword));
  }

  private static processCategoryQuery(): QueryResponse {
    return {
      intent: {
        action: 'list',
        entity: 'categories',
        parameters: {},
        confidence: 0.8
      },
      toolCall: {
        name: 'list-categories',
        parameters: {}
      }
    };
  }

  // Spending analysis query processing
  private static isSpendingAnalysisQuery(query: string): boolean {
    const analysisKeywords = [
      'how much', 'total', 'sum', 'analysis', 'analyze', 'report',
      'net worth', 'overview', 'summary'
    ];
    return analysisKeywords.some(phrase => query.includes(phrase));
  }

  private static processSpendingAnalysisQuery(query: string): QueryResponse {
    const category = this.extractCategory(query);
    const timePeriod = this.extractTimePeriod(query);

    if (query.includes('net worth')) {
      return {
        intent: {
          action: 'calculate',
          entity: 'net_worth',
          parameters: {},
          confidence: 0.9
        },
        toolCall: {
          name: 'list-accounts',
          parameters: {}
        }
      };
    }

    return {
      intent: {
        action: 'analyze',
        entity: 'spending',
        parameters: { category, timePeriod },
        confidence: 0.7
      },
      toolCall: {
        name: 'list-transactions',
        parameters: this.buildTransactionParameters(timePeriod)
      }
    };
  }

  // Helper methods for extracting information
  private static extractTimePeriod(query: string): string | undefined {
    if (query.includes('last month') || query.includes('previous month')) return 'last_month';
    if (query.includes('this month') || query.includes('current month')) return 'this_month';
    if (query.includes('last week') || query.includes('past week')) return 'last_week';
    if (query.includes('this week') || query.includes('current week')) return 'this_week';
    if (query.includes('yesterday')) return 'yesterday';
    if (query.includes('today')) return 'today';
    if (query.includes('last year') || query.includes('previous year')) return 'last_year';
    if (query.includes('this year') || query.includes('current year')) return 'this_year';
    
    // Look for specific months
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
                   'july', 'august', 'september', 'october', 'november', 'december'];
    const foundMonth = months.find(month => query.includes(month));
    if (foundMonth) return foundMonth;
    
    return undefined;
  }

  private static extractCategory(query: string): string | undefined {
    const commonCategories = [
      'groceries', 'food', 'restaurant', 'dining', 'coffee', 'gas', 'fuel',
      'utilities', 'rent', 'mortgage', 'insurance', 'medical', 'healthcare',
      'entertainment', 'movies', 'shopping', 'clothing', 'travel', 'transportation'
    ];
    
    return commonCategories.find(category => query.includes(category));
  }

  private static extractPayee(query: string): string | undefined {
    const commonPayees = [
      'starbucks', 'amazon', 'target', 'walmart', 'costco', 'safeway',
      'shell', 'chevron', 'netflix', 'spotify', 'uber', 'lyft'
    ];
    
    return commonPayees.find(payee => query.includes(payee));
  }

  // private static extractAmount(query: string): string | undefined {
  //   const amountMatch = query.match(/\$?(\d+(?:\.\d{2})?)/);
  //   return amountMatch ? amountMatch[1] : undefined;
  // }

  private static buildTransactionParameters(
    timePeriod?: string
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    if (timePeriod) {
      // Convert natural language time periods to date ranges
      const dateRange = this.convertTimePeriodToDate(timePeriod);
      if (dateRange) {
        params['since_date'] = dateRange.start;
        params['until_date'] = dateRange.end;
      }
    }
    
    return params;
  }

  private static convertTimePeriodToDate(timePeriod: string): { start: string; end: string } | undefined {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    switch (timePeriod) {
      case 'this_month':
        return {
          start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
          end: new Date(year, month + 1, 0).toISOString().split('T')[0] || ''
        };
      case 'last_month': {
        const lastMonth = month === 0 ? 11 : month - 1;
        const lastMonthYear = month === 0 ? year - 1 : year;
        return {
          start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          end: new Date(lastMonthYear, lastMonth + 1, 0).toISOString().split('T')[0] || ''
        };
      }
      case 'this_year':
        return {
          start: `${year}-01-01`,
          end: `${year}-12-31`
        };
      case 'last_year':
        return {
          start: `${year - 1}-01-01`,
          end: `${year - 1}-12-31`
        };
      default:
        return undefined;
    }
  }
}