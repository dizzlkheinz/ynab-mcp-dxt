/**
 * Configuration module for YNAB MCP Server
 *
 * Handles environment validation and server configuration.
 * Extracted from YNABMCPServer to provide focused, testable configuration management.
 */

import { ServerConfig, ConfigurationError } from '../types/index.js';

/**
 * Validates required environment variables and returns server configuration
 *
 * @returns ServerConfig with validated configuration
 * @throws ConfigurationError if environment validation fails
 */
export function validateEnvironment(): ServerConfig {
  const accessToken = process.env['YNAB_ACCESS_TOKEN'];
  const defaultBudgetId = process.env['YNAB_DEFAULT_BUDGET_ID'];

  if (accessToken === undefined) {
    throw new ConfigurationError('YNAB_ACCESS_TOKEN environment variable is required but not set');
  }

  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw new ConfigurationError('YNAB_ACCESS_TOKEN must be a non-empty string');
  }

  return {
    accessToken: accessToken.trim(),
    defaultBudgetId: defaultBudgetId?.trim(),
  };
}

export type { ServerConfig } from '../types/index.js';
