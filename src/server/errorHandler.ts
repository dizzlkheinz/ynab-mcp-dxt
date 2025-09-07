import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * YNAB API error codes and their corresponding HTTP status codes
 */
 
export const enum YNABErrorCode {
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
}

/**
 * Security-related error codes
 */
export const enum SecurityErrorCode {
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
 

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  error: {
    code: YNABErrorCode | SecurityErrorCode;
    message: string;
    userMessage: string; // User-friendly message
    details?: string | Record<string, unknown>;
    suggestions?: string[]; // Actionable suggestions for the user
  };
}

/**
 * Custom error classes for different error types
 */
export class YNABAPIError extends Error {
  public readonly code: YNABErrorCode;
  public readonly originalError?: unknown;
  
  constructor(
    code: YNABErrorCode,
    message: string,
    originalError?: unknown
  ) {
    super(message);
    this.name = 'YNABAPIError';
    this.code = code;
    this.originalError = originalError;
  }
}

export class ValidationError extends Error {
  public readonly details?: string | undefined;
  
  constructor(message: string, details?: string | undefined) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Centralized error handling middleware for all YNAB MCP tools
 */
export class ErrorHandler {
  /**
   * Handles errors from YNAB API calls and returns standardized MCP responses
   */
  static handleError(error: unknown, context: string): CallToolResult {
    const errorResponse = this.createErrorResponse(error, context);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
    };
  }

  /**
   * Creates a standardized error response based on the error type
   */
  private static createErrorResponse(error: unknown, context: string): ErrorResponse {
    // Handle custom error types
    if (error instanceof YNABAPIError) {
      const sanitizedDetails = this.sanitizeErrorDetails(error.originalError);
      return {
        error: {
          code: error.code,
          message: this.getErrorMessage(error.code, context),
          userMessage: this.getUserFriendlyMessage(error.code, context),
          suggestions: this.getErrorSuggestions(error.code, context),
          ...(sanitizedDetails && { details: sanitizedDetails }),
        },
      };
    }

    if (error instanceof ValidationError) {
      const sanitizedDetails = error.details ? this.sanitizeErrorDetails(error.details) : undefined;
      return {
        error: {
          code: SecurityErrorCode.VALIDATION_ERROR,
          message: error.message,
          userMessage: this.getUserFriendlyMessage(SecurityErrorCode.VALIDATION_ERROR, context),
          suggestions: this.getErrorSuggestions(SecurityErrorCode.VALIDATION_ERROR, context),
          ...(sanitizedDetails && { details: sanitizedDetails }),
        },
      };
    }

    // Handle generic errors by analyzing the error message
    if (error instanceof Error) {
      const detectedCode = this.detectErrorCode(error);
      if (detectedCode) {
        return {
          error: {
            code: detectedCode,
            message: this.getErrorMessage(detectedCode, context),
            userMessage: this.getUserFriendlyMessage(detectedCode, context),
            suggestions: this.getErrorSuggestions(detectedCode, context),
          },
        };
      }
    }

    // Fallback for unknown errors
    return {
      error: {
        code: SecurityErrorCode.UNKNOWN_ERROR,
        message: this.getGenericErrorMessage(context),
        userMessage: this.getUserFriendlyGenericMessage(context),
        suggestions: ['Try the operation again', 'Check your internet connection', 'Contact support if the issue persists'],
      },
    };
  }

  /**
   * Detects YNAB error codes from error messages
   */
  private static detectErrorCode(error: Error): YNABErrorCode | null {
    const message = error.message.toLowerCase();

    if (message.includes('401') || message.includes('unauthorized')) {
      return YNABErrorCode.UNAUTHORIZED;
    }
    if (message.includes('403') || message.includes('forbidden')) {
      return YNABErrorCode.FORBIDDEN;
    }
    if (message.includes('404') || message.includes('not found')) {
      return YNABErrorCode.NOT_FOUND;
    }
    if (message.includes('429') || message.includes('too many requests')) {
      return YNABErrorCode.TOO_MANY_REQUESTS;
    }
    if (message.includes('500') || message.includes('internal server error')) {
      return YNABErrorCode.INTERNAL_SERVER_ERROR;
    }

    return null;
  }

  /**
   * Returns user-friendly error messages for end users
   */
  private static getUserFriendlyMessage(code: YNABErrorCode | SecurityErrorCode, context: string): string {
    switch (code) {
      case YNABErrorCode.UNAUTHORIZED:
        return 'Your YNAB access token is invalid or has expired. Please check your token and try again.';
      case YNABErrorCode.FORBIDDEN:
        return 'You don\'t have permission to access this YNAB data. Please check your account permissions.';
      case YNABErrorCode.NOT_FOUND:
        return this.getUserFriendlyNotFoundMessage(context);
      case YNABErrorCode.TOO_MANY_REQUESTS:
        return 'We\'re making too many requests to YNAB. Please wait a moment and try again.';
      case YNABErrorCode.INTERNAL_SERVER_ERROR:
        return 'YNAB\'s servers are having issues. Please try again in a few minutes.';
      case SecurityErrorCode.VALIDATION_ERROR:
        return 'Some of the information provided is invalid. Please check your inputs and try again.';
      case SecurityErrorCode.RATE_LIMIT_EXCEEDED:
        return 'Too many requests have been made. Please wait before trying again.';
      default:
        return this.getUserFriendlyGenericMessage(context);
    }
  }

  /**
   * Returns actionable suggestions for users based on error type
   */
  private static getErrorSuggestions(code: YNABErrorCode | SecurityErrorCode, context: string): string[] {
    switch (code) {
      case YNABErrorCode.UNAUTHORIZED:
        return [
          'Go to https://app.youneedabudget.com/settings/developer to generate a new access token',
          'Make sure you copied the entire token without any extra spaces',
          'Check that your token hasn\'t expired'
        ];
      case YNABErrorCode.FORBIDDEN:
        return [
          'Verify that your YNAB account has access to the requested budget',
          'Check if your YNAB subscription is active',
          'Try logging into YNAB directly to confirm access'
        ];
      case YNABErrorCode.NOT_FOUND:
        return this.getNotFoundSuggestions(context);
      case YNABErrorCode.TOO_MANY_REQUESTS:
        return [
          'Wait 1-2 minutes before trying again',
          'Try making fewer requests at once',
          'The system will automatically retry after a short delay'
        ];
      case YNABErrorCode.INTERNAL_SERVER_ERROR:
        return [
          'Check YNAB\'s status page at https://status.youneedabudget.com',
          'Try again in a few minutes',
          'Contact YNAB support if the issue persists'
        ];
      case SecurityErrorCode.VALIDATION_ERROR:
        return [
          'Double-check all required fields are filled out',
          'Verify that amounts are in the correct format',
          'Make sure dates are valid and in the right format'
        ];
      default:
        return [
          'Try the operation again',
          'Check your internet connection',
          'Contact support if the issue persists'
        ];
    }
  }

  /**
   * Returns user-friendly not found messages
   */
  private static getUserFriendlyNotFoundMessage(context: string): string {
    if (context.includes('account')) {
      return 'We couldn\'t find the budget or account you\'re looking for.';
    }
    if (context.includes('budget')) {
      return 'We couldn\'t find that budget. It may have been deleted or you may not have access.';
    }
    if (context.includes('category')) {
      return 'We couldn\'t find that category. It may have been deleted or moved.';
    }
    if (context.includes('transaction')) {
      return 'We couldn\'t find that transaction. It may have been deleted or moved.';
    }
    if (context.includes('payee')) {
      return 'We couldn\'t find that payee in your budget.';
    }
    return 'We couldn\'t find what you\'re looking for. Please check that all information is correct.';
  }

  /**
   * Returns suggestions for not found errors
   */
  private static getNotFoundSuggestions(context: string): string[] {
    const baseSuggestions = [
      'Double-check that the name or ID is spelled correctly',
      'Try refreshing your budget data',
      'Make sure you\'re using the right budget'
    ];

    if (context.includes('account')) {
      return [...baseSuggestions, 'Check if the account was recently closed or renamed'];
    }
    if (context.includes('category')) {
      return [...baseSuggestions, 'Check if the category was deleted or moved to a different group'];
    }
    if (context.includes('transaction')) {
      return [...baseSuggestions, 'Check if the transaction was deleted or is in a different account'];
    }
    
    return baseSuggestions;
  }

  /**
   * Returns user-friendly generic error message
   */
  private static getUserFriendlyGenericMessage(context: string): string {
    if (context.includes('transaction')) {
      return 'There was a problem with your transaction. Please check your information and try again.';
    }
    if (context.includes('budget')) {
      return 'There was a problem accessing your budget data. Please try again.';
    }
    if (context.includes('account')) {
      return 'There was a problem accessing your account information. Please try again.';
    }
    return 'Something went wrong. Please try again in a moment.';
  }

  /**
   * Returns user-friendly error messages for different error codes
   */
  private static getErrorMessage(code: YNABErrorCode, context: string): string {
    switch (code) {
      case YNABErrorCode.UNAUTHORIZED:
        return 'Invalid or expired YNAB access token';
      case YNABErrorCode.FORBIDDEN:
        return 'Insufficient permissions to access YNAB data';
      case YNABErrorCode.NOT_FOUND:
        return this.getNotFoundMessage(context);
      case YNABErrorCode.TOO_MANY_REQUESTS:
        return 'Rate limit exceeded. Please try again later';
      case YNABErrorCode.INTERNAL_SERVER_ERROR:
        return 'YNAB service is currently unavailable';
      default:
        return this.getGenericErrorMessage(context);
    }
  }

  /**
   * Returns context-specific not found error messages
   */
  private static getNotFoundMessage(context: string): string {
    if (context.includes('listing accounts') || context.includes('getting account')) {
      return 'Budget or account not found';
    }
    if (context.includes('listing budgets') || context.includes('getting budget')) {
      return 'Budget not found';
    }
    if (context.includes('listing categories') || context.includes('getting category')) {
      return 'Budget or category not found';
    }
    if (context.includes('listing months') || context.includes('getting month')) {
      return 'Budget or month not found';
    }
    if (context.includes('listing payees') || context.includes('getting payee')) {
      return 'Budget or payee not found';
    }
    if (context.includes('listing transactions') || context.includes('getting transaction')) {
      return 'Budget, account, category, or transaction not found';
    }
    return 'The requested resource was not found. Please verify the provided IDs are correct.';
  }

  /**
   * Returns context-specific generic error messages
   */
  private static getGenericErrorMessage(context: string): string {
    if (context.includes('listing accounts')) {
      return 'Failed to list accounts';
    }
    if (context.includes('getting account')) {
      return 'Failed to get account';
    }
    if (context.includes('creating account')) {
      return 'Failed to create account';
    }
    if (context.includes('listing budgets')) {
      return 'Failed to list budgets';
    }
    if (context.includes('getting budget')) {
      return 'Failed to get budget';
    }
    if (context.includes('listing categories')) {
      return 'Failed to list categories';
    }
    if (context.includes('getting category')) {
      return 'Failed to get category';
    }
    if (context.includes('updating category')) {
      return 'Failed to update category';
    }
    if (context.includes('listing months')) {
      return 'Failed to list months';
    }
    if (context.includes('getting month')) {
      return 'Failed to get month data';
    }
    if (context.includes('listing payees')) {
      return 'Failed to list payees';
    }
    if (context.includes('getting payee')) {
      return 'Failed to get payee';
    }
    if (context.includes('listing transactions')) {
      return 'Failed to list transactions';
    }
    if (context.includes('getting transaction')) {
      return 'Failed to get transaction';
    }
    if (context.includes('creating transaction')) {
      return 'Failed to create transaction';
    }
    if (context.includes('updating transaction')) {
      return 'Failed to update transaction';
    }
    if (context.includes('getting user')) {
      return 'Failed to get user information';
    }
    return `An error occurred while ${context}`;
  }

  /**
   * Sanitizes error details to prevent sensitive data leakage
   */
  private static sanitizeErrorDetails(error: unknown): string | undefined {
    if (!error) return undefined;

    let details = '';
    if (error instanceof Error) {
      details = error.message;
    } else if (typeof error === 'string') {
      details = error;
    } else {
      details = 'Unknown error details';
    }

    // Remove sensitive information patterns
    details = details
      .replace(/token[s]?[:\s=]+[a-zA-Z0-9_-]+/gi, 'token=***')
      .replace(/key[s]?[:\s=]+[a-zA-Z0-9_-]+/gi, 'key=***')
      .replace(/password[s]?[:\s=]+[a-zA-Z0-9_-]+/gi, 'password=***')
      .replace(/authorization[:\s=]+[a-zA-Z0-9\s_-]+/gi, 'authorization=***');

    return details;
  }

  /**
   * Wraps async functions with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T | CallToolResult> {
    try {
      return await operation();
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  /**
   * Creates a validation error for invalid parameters
   */
  static createValidationError(message: string, details?: string): CallToolResult {
    return this.handleError(new ValidationError(message, details), 'validating parameters');
  }

  /**
   * Creates a YNAB API error with specific error code
   */
  static createYNABError(
    code: YNABErrorCode,
    context: string,
    originalError?: unknown
  ): YNABAPIError {
    const message = this.getErrorMessage(code, context);
    return new YNABAPIError(code, message, originalError);
  }
}

/**
 * Utility function for handling errors in tool handlers
 */
export function handleToolError(error: unknown, toolName: string, operation: string): CallToolResult {
  return ErrorHandler.handleError(error, `executing ${toolName} - ${operation}`);
}

/**
 * Utility function for wrapping tool operations with error handling
 */
export async function withToolErrorHandling<T>(
  operation: () => Promise<T>,
  toolName: string,
  operationName: string
): Promise<T | CallToolResult> {
  return ErrorHandler.withErrorHandling(
    operation,
    `executing ${toolName} - ${operationName}`
  );
}