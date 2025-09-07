#!/usr/bin/env node

// Load environment variables from a .env file if present
import 'dotenv/config';

import { YNABMCPServer } from './server/YNABMCPServer.js';
import { AuthenticationError, ConfigurationError } from './types/index.js';

/**
 * Global server instance for graceful shutdown
 */
let serverInstance: YNABMCPServer | null = null;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.error(`Received ${signal}, initiating graceful shutdown...`);
  
  try {
    if (serverInstance) {
      console.error('Cleaning up server resources...');
      // The MCP server will handle its own cleanup when the process exits
      serverInstance = null;
    }
    
    console.error('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Enhanced error reporting with specific error types
 */
function reportError(error: unknown): void {
  if (error instanceof ConfigurationError) {
    console.error('❌ Configuration Error:', error.message);
    console.error('Please check your environment variables and try again.');
    process.exit(1);
  } else if (error instanceof AuthenticationError) {
    console.error('❌ Authentication Error:', error.message);
    console.error('Please verify your YNAB access token and try again.');
    process.exit(1);
  } else if (error instanceof Error) {
    console.error('❌ Server Error:', error.message);
    if (process.env['NODE_ENV'] === 'development') {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } else {
    console.error('❌ Unknown error:', error);
    process.exit(1);
  }
}

/**
 * Server startup validation
 */
function validateStartupEnvironment(): void {
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0] || '0');
  
  if (majorVersion < 18) {
    console.error('❌ Node.js version 18 or higher is required');
    console.error(`Current version: ${nodeVersion}`);
    process.exit(1);
  }
  
  // Validate environment
  if (!process.env['YNAB_ACCESS_TOKEN']) {
    console.error('❌ YNAB_ACCESS_TOKEN environment variable is required');
    console.error('Please set your YNAB Personal Access Token and try again.');
    process.exit(1);
  }
  
  console.error('✅ Environment validation passed');
}

/**
 * Main entry point for the YNAB MCP Server
 */
async function main(): Promise<void> {
  try {
    console.error('🚀 Starting YNAB MCP Server...');
    
    // Validate startup environment
    validateStartupEnvironment();
    
    // Create and start server
    serverInstance = new YNABMCPServer();
    console.error('✅ Server instance created successfully');
    
    await serverInstance.run();
    console.error('✅ YNAB MCP Server started successfully');
    
  } catch (error) {
    reportError(error);
  }
}

// Handle graceful shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  if (process.env['NODE_ENV'] === 'development') {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch(reportError);
