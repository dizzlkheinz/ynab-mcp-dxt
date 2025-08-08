# YNAB MCP Server - Claude Desktop Installation

This document explains how to install and use the YNAB MCP Server with Claude Desktop using the `.dxt` extension file.

## What is a DXT File?

A `.dxt` file is a Desktop Extension format that packages a complete MCP server with all its dependencies into a single, installable file for Claude Desktop. It simplifies the installation process by bundling everything needed to run the server.

## Installation

### Prerequisites

1. **Claude Desktop**: Make sure you have Claude Desktop installed and updated to version 0.12.0 or higher.
2. **YNAB Personal Access Token**: You'll need a YNAB Personal Access Token from your YNAB account.

### Getting Your YNAB Personal Access Token

1. Log into your YNAB account at [https://app.youneedabudget.com](https://app.youneedabudget.com)
2. Go to Account Settings → Developer Settings
3. Click "New Token" and give it a name (e.g., "Claude Desktop MCP")
4. Copy the generated token - you'll need this during installation

### Installing the DXT Extension

1. **Download the DXT file**: Get the `ynab-mcp-server.dxt` file
2. **Install in Claude Desktop**:
   - Open Claude Desktop
   - Go to Settings → Extensions (or similar menu option)
   - Click "Install Extension" or drag and drop the `.dxt` file
   - When prompted, enter your YNAB Personal Access Token
3. **Restart Claude Desktop** if required

## Available Tools

Once installed, Claude will have access to the following YNAB tools:

### Budget Management
- `list_budgets` - List all your budgets
- `get_budget` - Get detailed information about a specific budget

### Account Management
- `list_accounts` - List accounts in a budget
- `get_account` - Get account details
- `create_account` - Create a new account

### Transaction Management
- `list_transactions` - List transactions with filtering options
- `get_transaction` - Get transaction details
- `create_transaction` - Create a new transaction
- `update_transaction` - Update an existing transaction
- `delete_transaction` - Delete a transaction

### Category Management
- `list_categories` - List budget categories
- `get_category` - Get category details
- `update_category` - Update category budget amounts

### Payee Management
- `list_payees` - List payees
- `get_payee` - Get payee details

### Monthly Data
- `get_month` - Get budget data for a specific month
- `list_months` - List all months with summary data

### Utility Functions
- `get_user` - Get your YNAB user information
- `convert_amount` - Convert between dollars and milliunits

## Usage Examples

Once installed, you can ask Claude to help with your YNAB budget:

- "Show me all my budgets"
- "What's my checking account balance?"
- "Add a $50 grocery transaction to my budget"
- "How much did I spend on dining out last month?"
- "Update my grocery category budget to $400"

## Security Notes

- Your YNAB Personal Access Token is stored securely by Claude Desktop
- The extension only has access to your YNAB data through the official YNAB API
- All communication is encrypted and follows YNAB's security standards
- The extension runs locally on your machine

## Troubleshooting

### Extension Won't Install
- Make sure you have Claude Desktop 0.12.0 or higher
- Verify the `.dxt` file isn't corrupted
- Check that you have Node.js 18+ installed on your system

### Authentication Errors
- Verify your YNAB Personal Access Token is correct
- Make sure the token hasn't expired
- Check that your YNAB account is active

### Tool Errors
- Ensure you're using valid budget IDs, account IDs, etc.
- Check that you have permission to access the requested data
- Verify your internet connection for API calls

## Support

If you encounter issues:

1. Check the Claude Desktop logs for error messages
2. Verify your YNAB Personal Access Token is still valid
3. Try reinstalling the extension
4. Contact support with specific error messages

## Technical Details

- **Server Type**: Node.js
- **Node.js Version Required**: 18.0.0 or higher
- **Supported Platforms**: Windows, macOS, Linux
- **Package Size**: ~2.3MB
- **Dependencies**: Includes all required Node.js modules