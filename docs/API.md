# YNAB MCP Server API Reference

This document provides comprehensive documentation for all tools available in the YNAB MCP Server, including parameters, examples, and error handling.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Data Formats](#data-formats)
- [Budget Management Tools](#budget-management-tools)
- [Account Management Tools](#account-management-tools)
- [Transaction Management Tools](#transaction-management-tools)
- [Category Management Tools](#category-management-tools)
- [Payee Management Tools](#payee-management-tools)
- [Monthly Data Tools](#monthly-data-tools)
- [Financial Analysis Tools](#financial-analysis-tools)
- [Natural Language & AI Tools](#natural-language--ai-tools)
- [Utility Tools](#utility-tools)
- [Error Handling](#error-handling)

## Overview

The YNAB MCP Server provides 21 tools that enable AI assistants to interact with YNAB data. All tools follow consistent patterns for parameters, responses, and error handling.

### Tool Naming Convention

All tools follow a simple naming pattern with an action and resource:
- `list_budgets` - List operation on budgets
- `get_budget` - Get operation on a specific budget
- `create_transaction` - Create operation for transactions

## Authentication

All tools require authentication via a YNAB Personal Access Token set in the `YNAB_ACCESS_TOKEN` environment variable.

```bash
YNAB_ACCESS_TOKEN=your_personal_access_token_here
```

## Data Formats

### Monetary Amounts

All monetary amounts in YNAB are represented in **milliunits** (1/1000th of the currency unit):
- $1.00 = 1000 milliunits
- $-50.25 = -50250 milliunits (negative for outflows)
- Use the `convert_amount` tool for conversions

### Dates

All dates use ISO 8601 format: `YYYY-MM-DD`
- Example: `2024-01-15`
- Time zones are handled by YNAB based on your account settings

### IDs

All YNAB IDs are UUID strings:
- Budget ID: `12345678-1234-1234-1234-123456789012`
- Account ID: `87654321-4321-4321-4321-210987654321`

## Budget Management Tools

### list_budgets

Lists all budgets associated with the user's account.

**Parameters:** None

**Example Request:**
```json
{
  "name": "list_budgets",
  "arguments": {}
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"budgets\": [\n    {\n      \"id\": \"12345678-1234-1234-1234-123456789012\",\n      \"name\": \"My Budget\",\n      \"last_modified_on\": \"2024-01-15T10:30:00.000Z\",\n      \"first_month\": \"2024-01-01\",\n      \"last_month\": \"2024-12-01\",\n      \"date_format\": {\n        \"format\": \"MM/DD/YYYY\"\n      },\n      \"currency_format\": {\n        \"iso_code\": \"USD\",\n        \"example_format\": \"123,456.78\",\n        \"decimal_digits\": 2,\n        \"decimal_separator\": \".\",\n        \"symbol_first\": true,\n        \"group_separator\": \",\",\n        \"currency_symbol\": \"$\",\n        \"display_symbol\": true\n      }\n    }\n  ]\n}"
    }
  ]
}
```

### get_budget

Gets detailed information for a specific budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget to retrieve

**Example Request:**
```json
{
  "name": "get_budget",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012"
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"budget\": {\n    \"id\": \"12345678-1234-1234-1234-123456789012\",\n    \"name\": \"My Budget\",\n    \"last_modified_on\": \"2024-01-15T10:30:00.000Z\",\n    \"first_month\": \"2024-01-01\",\n    \"last_month\": \"2024-12-01\",\n    \"accounts\": [...],\n    \"payees\": [...],\n    \"payee_locations\": [...],\n    \"category_groups\": [...],\n    \"categories\": [...],\n    \"months\": [...],\n    \"transactions\": [...],\n    \"subtransactions\": [...],\n    \"scheduled_transactions\": [...],\n    \"scheduled_subtransactions\": [...]\n  }\n}"
    }
  ]
}
```

## Account Management Tools

### list_accounts

Lists all accounts for a specific budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget

**Example Request:**
```json
{
  "name": "list_accounts",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012"
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"accounts\": [\n    {\n      \"id\": \"87654321-4321-4321-4321-210987654321\",\n      \"name\": \"Checking Account\",\n      \"type\": \"checking\",\n      \"on_budget\": true,\n      \"closed\": false,\n      \"note\": null,\n      \"balance\": 150000,\n      \"cleared_balance\": 145000,\n      \"uncleared_balance\": 5000,\n      \"transfer_payee_id\": \"transfer-payee-id\",\n      \"direct_import_linked\": false,\n      \"direct_import_in_error\": false,\n      \"last_reconciled_at\": null,\n      \"debt_original_balance\": null,\n      \"debt_interest_rates\": {},\n      \"debt_minimum_payments\": {},\n      \"debt_escrow_amounts\": {}\n    }\n  ]\n}"
    }
  ]
}
```

### get_account

Gets detailed information for a specific account.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `account_id` (string, required): The ID of the account

**Example Request:**
```json
{
  "name": "get_account",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "account_id": "87654321-4321-4321-4321-210987654321"
  }
}
```

### create_account

Creates a new account in the specified budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `name` (string, required): The name of the new account
- `type` (string, required): The account type. Valid values:
  - `checking` - Checking account
  - `savings` - Savings account
  - `creditCard` - Credit card account
  - `cash` - Cash account
  - `lineOfCredit` - Line of credit
  - `otherAsset` - Other asset account
  - `otherLiability` - Other liability account
- `balance` (number, optional): Initial balance in milliunits

**Example Request:**
```json
{
  "name": "create_account",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "name": "New Savings Account",
    "type": "savings",
    "balance": 100000
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"account\": {\n    \"id\": \"new-account-id\",\n    \"name\": \"New Savings Account\",\n    \"type\": \"savings\",\n    \"on_budget\": true,\n    \"closed\": false,\n    \"balance\": 100000,\n    \"cleared_balance\": 100000,\n    \"uncleared_balance\": 0\n  }\n}"
    }
  ]
}
```

## Transaction Management Tools

### list_transactions

Lists transactions for a budget with optional filtering.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `account_id` (string, optional): Filter by account ID
- `category_id` (string, optional): Filter by category ID
- `since_date` (string, optional): Only return transactions on or after this date (YYYY-MM-DD)
- `type` (string, optional): Filter by transaction type (`uncategorized` or `unapproved`)

**Example Request:**
```json
{
  "name": "list_transactions",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "account_id": "87654321-4321-4321-4321-210987654321",
    "since_date": "2024-01-01"
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"transactions\": [\n    {\n      \"id\": \"transaction-id\",\n      \"date\": \"2024-01-15\",\n      \"amount\": -5000,\n      \"memo\": \"Coffee shop\",\n      \"cleared\": \"cleared\",\n      \"approved\": true,\n      \"flag_color\": null,\n      \"account_id\": \"87654321-4321-4321-4321-210987654321\",\n      \"payee_id\": \"payee-id\",\n      \"category_id\": \"category-id\",\n      \"transfer_account_id\": null,\n      \"transfer_transaction_id\": null,\n      \"matched_transaction_id\": null,\n      \"import_id\": null,\n      \"import_payee_name\": null,\n      \"import_payee_name_original\": null,\n      \"debt_transaction_type\": null,\n      \"deleted\": false\n    }\n  ]\n}"
    }
  ]
}
```

### get_transaction

Gets detailed information for a specific transaction.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `transaction_id` (string, required): The ID of the transaction

**Example Request:**
```json
{
  "name": "get_transaction",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "transaction_id": "transaction-id"
  }
}
```

### create_transaction

Creates a new transaction in the specified budget and account.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `account_id` (string, required): The ID of the account
- `amount` (number, required): Transaction amount in milliunits (negative for outflows)
- `date` (string, required): Transaction date in ISO format (YYYY-MM-DD)
- `payee_name` (string, optional): The payee name
- `payee_id` (string, optional): The payee ID
- `category_id` (string, optional): The category ID
- `memo` (string, optional): Transaction memo
- `cleared` (string, optional): Transaction cleared status (`cleared`, `uncleared`, `reconciled`)
- `approved` (boolean, optional): Whether the transaction is approved
- `flag_color` (string, optional): Transaction flag color (`red`, `orange`, `yellow`, `green`, `blue`, `purple`)

**Example Request:**
```json
{
  "name": "create_transaction",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "account_id": "87654321-4321-4321-4321-210987654321",
    "amount": -5000,
    "date": "2024-01-15",
    "payee_name": "Coffee Shop",
    "category_id": "category-id",
    "memo": "Morning coffee",
    "cleared": "cleared",
    "approved": true
  }
}
```

### update_transaction

Updates an existing transaction.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `transaction_id` (string, required): The ID of the transaction to update
- `account_id` (string, optional): Update the account ID
- `amount` (number, optional): Update the amount in milliunits
- `date` (string, optional): Update the date (YYYY-MM-DD)
- `payee_name` (string, optional): Update the payee name
- `payee_id` (string, optional): Update the payee ID
- `category_id` (string, optional): Update the category ID
- `memo` (string, optional): Update the memo
- `cleared` (string, optional): Update the cleared status
- `approved` (boolean, optional): Update the approved status
- `flag_color` (string, optional): Update the flag color

**Example Request:**
```json
{
  "name": "update_transaction",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "transaction_id": "transaction-id",
    "amount": -6000,
    "memo": "Updated memo",
    "flag_color": "red"
  }
}
```

### delete_transaction

Deletes a transaction from the specified budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `transaction_id` (string, required): The ID of the transaction to delete

**Example Request:**
```json
{
  "name": "delete_transaction",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "transaction_id": "transaction-id"
  }
}
```

## Category Management Tools

### list_categories

Lists all categories for a specific budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget

**Example Request:**
```json
{
  "name": "list_categories",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012"
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"category_groups\": [\n    {\n      \"id\": \"group-id\",\n      \"name\": \"Monthly Bills\",\n      \"hidden\": false,\n      \"deleted\": false,\n      \"categories\": [\n        {\n          \"id\": \"category-id\",\n          \"category_group_id\": \"group-id\",\n          \"name\": \"Rent/Mortgage\",\n          \"hidden\": false,\n          \"original_category_group_id\": null,\n          \"note\": null,\n          \"budgeted\": 150000,\n          \"activity\": -150000,\n          \"balance\": 0,\n          \"goal_type\": null,\n          \"goal_creation_month\": null,\n          \"goal_target\": null,\n          \"goal_target_month\": null,\n          \"goal_percentage_complete\": null,\n          \"goal_months_to_budget\": null,\n          \"goal_under_funded\": null,\n          \"goal_overall_funded\": null,\n          \"goal_overall_left\": null,\n          \"deleted\": false\n        }\n      ]\n    }\n  ]\n}"
    }
  ]
}
```

### get_category

Gets detailed information for a specific category.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `category_id` (string, required): The ID of the category

### update_category

Updates the budgeted amount for a category in the current month.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `category_id` (string, required): The ID of the category
- `budgeted` (number, required): The budgeted amount in milliunits

**Example Request:**
```json
{
  "name": "update_category",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "category_id": "category-id",
    "budgeted": 50000
  }
}
```

## Payee Management Tools

### list_payees

Lists all payees for a specific budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget

**Example Request:**
```json
{
  "name": "list_payees",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012"
  }
}
```

### get_payee

Gets detailed information for a specific payee.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `payee_id` (string, required): The ID of the payee

## Monthly Data Tools

### get_month

Gets budget data for a specific month.

**Parameters:**
- `budget_id` (string, required): The ID of the budget
- `month` (string, required): The month in ISO format (YYYY-MM-DD, typically first day of month)

**Example Request:**
```json
{
  "name": "get_month",
  "arguments": {
    "budget_id": "12345678-1234-1234-1234-123456789012",
    "month": "2024-01-01"
  }
}
```

### list_months

Lists all months summary data for a budget.

**Parameters:**
- `budget_id` (string, required): The ID of the budget

## Financial Analysis Tools

### financial_overview

Provides comprehensive multi-month financial analysis with AI-generated insights, spending trends, and performance metrics.

**Parameters:**
- `budget_id` (string, optional): Budget ID (uses default budget if not specified)
- `months` (number, optional): Number of months to analyze (1-12, default: 3)
- `include_trends` (boolean, optional): Include spending trends analysis (default: true)
- `include_insights` (boolean, optional): Include AI-generated financial insights (default: true)

**Example Request:**
```json
{
  "name": "financial_overview",
  "arguments": {
    "months": 6,
    "include_trends": true,
    "include_insights": true
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"summary\": {\n    \"period\": \"6 months\",\n    \"budget_name\": \"My Budget\",\n    \"net_worth\": 15420.50,\n    \"liquid_assets\": 8500.25,\n    \"debt\": 2340.75\n  },\n  \"current_month\": {\n    \"income\": 5000000,\n    \"budgeted\": 4500000,\n    \"activity\": -4200000,\n    \"budget_utilization\": 93.3\n  },\n  \"spending_trends\": [\n    {\n      \"category\": \"Groceries\",\n      \"trend\": \"increasing\",\n      \"percentChange\": 15.2,\n      \"significance\": \"medium\"\n    }\n  ],\n  \"insights\": [\n    {\n      \"type\": \"warning\",\n      \"title\": \"Significant Increase in Groceries\",\n      \"description\": \"Spending in Groceries has increased by 15.2%\",\n      \"actionable\": true,\n      \"suggestions\": [\"Review recent transactions\"]\n    }\n  ]\n}"
    }
  ]
}
```

### spending_analysis

Performs detailed spending analysis with category breakdowns, trends, and variability metrics.

**Parameters:**
- `budget_id` (string, optional): Budget ID (uses default budget if not specified)
- `period_months` (number, optional): Analysis period in months (1-12, default: 6)
- `category_id` (string, optional): Focus analysis on specific category

**Example Request:**
```json
{
  "name": "spending_analysis",
  "arguments": {
    "period_months": 6,
    "category_id": "category-id-123"
  }
}
```

### cash_flow_forecast

Generates predictive cash flow modeling based on historical data and scheduled transactions.

**Parameters:**
- `budget_id` (string, optional): Budget ID (uses default budget if not specified)
- `forecast_months` (number, optional): Number of months to forecast (1-12, default: 3)

**Example Request:**
```json
{
  "name": "cash_flow_forecast",
  "arguments": {
    "forecast_months": 3
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"forecast_period\": \"3 months\",\n  \"projections\": [\n    {\n      \"month\": \"2024-02-01\",\n      \"projected_income\": 5000.00,\n      \"projected_expenses\": 4200.00,\n      \"net_cash_flow\": 800.00,\n      \"confidence\": \"high\"\n    }\n  ],\n  \"assumptions\": [\n    \"Based on historical averages and scheduled transactions\"\n  ]\n}"
    }
  ]
}
```

### budget_health_check

Performs comprehensive budget health assessment with scoring and actionable recommendations.

**Parameters:**
- `budget_id` (string, optional): Budget ID (uses default budget if not specified)  
- `include_recommendations` (boolean, optional): Include actionable recommendations (default: true)

**Example Request:**
```json
{
  "name": "budget_health_check",
  "arguments": {
    "include_recommendations": true
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"health_score\": 85,\n  \"score_explanation\": \"Good financial health with minor areas for improvement\",\n  \"metrics\": {\n    \"budget_utilization\": 93.3,\n    \"overspent_categories\": 2,\n    \"emergency_fund_status\": {\n      \"current_amount\": 2500.00,\n      \"status\": \"adequate\"\n    },\n    \"debt_to_asset_ratio\": 15.2\n  },\n  \"recommendations\": [\n    \"Address 2 overspent categories by moving funds or reducing spending\",\n    \"Consider building emergency fund to 6 months of expenses\"\n  ]\n}"
    }
  ]
}
```

## Natural Language & AI Tools

### natural-language-query

Processes natural language queries about budget data and provides structured responses with tool suggestions.

**Parameters:**
- `query` (string, required): Natural language query about budget, transactions, accounts, etc.

**Example Request:**
```json
{
  "name": "natural-language-query",
  "arguments": {
    "query": "How much did I spend on groceries last month?"
  }
}
```

### get-smart-suggestions

Provides contextual AI suggestions for YNAB operations based on recent activity and patterns.

**Parameters:**
- `context` (string, required): Context for suggestions - one of: "budgeting", "transactions", "analysis", "general"

**Example Request:**
```json
{
  "name": "get-smart-suggestions",
  "arguments": {
    "context": "budgeting"
  }
}
```

## Utility Tools

### get_user

Gets information about the authenticated user.

**Parameters:** None

**Example Request:**
```json
{
  "name": "get_user",
  "arguments": {}
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"user\": {\n    \"id\": \"user-id\",\n    \"email\": \"user@example.com\",\n    \"trial_expires_on\": null,\n    \"subscription\": {\n      \"trial_expires_on\": null,\n      \"cancelled_at\": null,\n      \"date_first_current\": \"2020-01-01T00:00:00.000Z\",\n      \"frequency\": \"annually\"\n    }\n  }\n}"
    }
  ]
}
```

### convert_amount

Converts between dollars and milliunits with integer arithmetic for precision.

**Parameters:**
- `amount` (number, required): The amount to convert
- `to_milliunits` (boolean, required): If true, convert from dollars to milliunits. If false, convert from milliunits to dollars

**Example Request (dollars to milliunits):**
```json
{
  "name": "convert_amount",
  "arguments": {
    "amount": 50.25,
    "to_milliunits": true
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"original_amount\": 50.25,\n  \"converted_amount\": 50250,\n  \"conversion_type\": \"dollars_to_milliunits\"\n}"
    }
  ]
}
```

**Example Request (milliunits to dollars):**
```json
{
  "name": "convert_amount",
  "arguments": {
    "amount": 50250,
    "to_milliunits": false
  }
}
```

**Example Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"original_amount\": 50250,\n  \"converted_amount\": 50.25,\n  \"conversion_type\": \"milliunits_to_dollars\"\n}"
    }
  ]
}
```

## Error Handling

All tools implement comprehensive error handling with consistent error response formats.

### Error Response Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"error\": {\n    \"code\": \"ERROR_CODE\",\n    \"message\": \"Human-readable error message\",\n    \"tool\": \"tool_name\",\n    \"operation\": \"operation_description\"\n  }\n}"
    }
  ]
}
```

### Common Error Types

#### Authentication Errors (401)

**Cause**: Invalid or expired YNAB access token

**Example Response:**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid or expired YNAB access token. Please check your YNAB_ACCESS_TOKEN environment variable.",
    "tool": "list_budgets",
    "operation": "listing budgets"
  }
}
```

**Solutions:**
- Verify the `YNAB_ACCESS_TOKEN` environment variable is set correctly
- Check if the token has expired in YNAB Developer Settings
- Generate a new token if necessary

#### Authorization Errors (403)

**Cause**: Insufficient permissions for the requested operation

**Example Response:**
```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Insufficient permissions to access this resource.",
    "tool": "get_budget",
    "operation": "retrieving budget details"
  }
}
```

#### Resource Not Found (404)

**Cause**: Invalid budget_id, account_id, transaction_id, etc.

**Example Response:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found. Please verify the ID is correct.",
    "tool": "get_account",
    "operation": "retrieving account details"
  }
}
```

**Solutions:**
- Verify the ID is correct and exists
- Use list operations to find valid IDs
- Check if the resource has been deleted

#### Rate Limiting (429)

**Cause**: Too many requests to YNAB API

**Example Response:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please wait before making more requests.",
    "tool": "list_transactions",
    "operation": "listing transactions"
  }
}
```

**Solutions:**
- Wait before making additional requests
- Implement exponential backoff in your client
- Reduce the frequency of API calls

#### Validation Errors

**Cause**: Invalid parameters provided to tools

**Example Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameters: date must be in ISO format (YYYY-MM-DD)",
    "tool": "create_transaction",
    "operation": "creating transaction"
  }
}
```

**Solutions:**
- Check parameter formats and types
- Refer to the tool documentation for valid values
- Ensure required parameters are provided

#### Server Errors (500)

**Cause**: YNAB service issues or internal server errors

**Example Response:**
```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An internal server error occurred. Please try again later.",
    "tool": "get_budget",
    "operation": "retrieving budget details"
  }
}
```

**Solutions:**
- Retry the request after a short delay
- Check YNAB service status
- Contact support if the issue persists

## Best Practices

### 1. Error Handling

Always handle errors gracefully in your client applications:

```javascript
try {
  const result = await mcpClient.callTool('list_budgets', {});
  // Process successful result
} catch (error) {
  // Handle error based on error code
  if (error.code === 'AUTHENTICATION_ERROR') {
    // Prompt user to update token
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Implement retry with backoff
  }
}
```

### 2. Parameter Validation

Validate parameters before making tool calls:

```javascript
// Validate date format
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(date)) {
  throw new Error('Date must be in YYYY-MM-DD format');
}

// Validate amount is in milliunits
if (!Number.isInteger(amount)) {
  throw new Error('Amount must be an integer in milliunits');
}
```

### 3. Efficient Data Retrieval

Use filtering parameters to reduce data transfer:

```javascript
// Instead of getting all transactions and filtering client-side
const allTransactions = await mcpClient.callTool('list_transactions', {
  budget_id: budgetId
});

// Use server-side filtering
const recentTransactions = await mcpClient.callTool('list_transactions', {
  budget_id: budgetId,
  since_date: '2024-01-01',
  account_id: specificAccountId
});
```

### 4. Amount Conversions

Use the conversion utility for user-friendly displays:

```javascript
// Convert milliunits to dollars for display
const dollarsResult = await mcpClient.callTool('convert_amount', {
  amount: 50250,
  to_milliunits: false
});
console.log(`Amount: $${dollarsResult.converted_amount}`); // Amount: $50.25

// Convert user input to milliunits for API calls
const milliUnitsResult = await mcpClient.callTool('convert_amount', {
  amount: 50.25,
  to_milliunits: true
});
// Use milliUnitsResult.converted_amount in transaction creation
```

### 5. Caching Strategies

Cache relatively static data to improve performance:

```javascript
// Cache budget and account information
const budgets = await mcpClient.callTool('list_budgets', {});
// Cache for 1 hour

const accounts = await mcpClient.callTool('list_accounts', {
  budget_id: budgetId
});
// Cache for 30 minutes

// Don't cache frequently changing data like transactions
const transactions = await mcpClient.callTool('list_transactions', {
  budget_id: budgetId,
  since_date: today
});
// Always fetch fresh
```

This API reference provides comprehensive documentation for all available tools. For additional information, see the [Developer Guide](DEVELOPER.md) for best practices and common usage patterns.
