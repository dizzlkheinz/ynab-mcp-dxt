import { describe, it, expect, beforeAll } from 'vitest';
import * as ynab from 'ynab';
import { readFileSync } from 'fs';
import {
  handleListTransactions,
  handleGetTransaction,
  handleCreateTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
} from '../transactionTools.js';

describe('Transaction Tools Integration', () => {
  let ynabAPI: ynab.API;
  let testBudgetId: string;
  let testAccountId: string;

  beforeAll(async () => {
    try {
      const apiKeyFile = readFileSync('api_key.txt', 'utf-8').trim();
      const apiKey = apiKeyFile.split('\n')[0].split('=')[1];
      console.log('✅ Loaded YNAB API key for integration tests');

      ynabAPI = new ynab.API(apiKey);

      // Get the first budget for testing
      const budgetsResponse = await ynabAPI.budgets.getBudgets();
      testBudgetId = budgetsResponse.data.budgets[0].id;

      // Get the first account for testing
      const accountsResponse = await ynabAPI.accounts.getAccounts(testBudgetId);
      testAccountId = accountsResponse.data.accounts[0].id;
    } catch (error) {
      console.error('❌ Failed to load API key or connect to YNAB:', error);
      throw error;
    }
  });

  it('should successfully list transactions from real API', async () => {
    const params = {
      budget_id: testBudgetId,
    };

    const result = await handleListTransactions(ynabAPI, params);
    const response = JSON.parse(result.content[0].text);

    expect(response.transactions).toBeDefined();
    expect(Array.isArray(response.transactions)).toBe(true);

    console.log(`✅ Successfully listed ${response.transactions.length} transactions`);
  });

  it('should successfully list transactions with account filter', async () => {
    const params = {
      budget_id: testBudgetId,
      account_id: testAccountId,
    };

    const result = await handleListTransactions(ynabAPI, params);
    const response = JSON.parse(result.content[0].text);

    expect(response.transactions).toBeDefined();
    expect(Array.isArray(response.transactions)).toBe(true);

    // All transactions should be from the specified account
    response.transactions.forEach((transaction: any) => {
      expect(transaction.account_id).toBe(testAccountId);
    });

    console.log(`✅ Successfully listed ${response.transactions.length} transactions for account`);
  });

  it('should successfully list transactions with date filter', async () => {
    const params = {
      budget_id: testBudgetId,
      since_date: '2024-01-01',
    };

    const result = await handleListTransactions(ynabAPI, params);
    const response = JSON.parse(result.content[0].text);

    expect(response.transactions).toBeDefined();
    expect(Array.isArray(response.transactions)).toBe(true);

    console.log(
      `✅ Successfully listed ${response.transactions.length} transactions since 2024-01-01`,
    );
  });

  it('should get transaction details if transactions exist', async () => {
    // First get a list of transactions to find one to test with
    const listParams = {
      budget_id: testBudgetId,
    };

    const listResult = await handleListTransactions(ynabAPI, listParams);
    const listResponse = JSON.parse(listResult.content[0].text);

    if (listResponse.transactions && listResponse.transactions.length > 0) {
      const testTransactionId = listResponse.transactions[0].id;

      const params = {
        budget_id: testBudgetId,
        transaction_id: testTransactionId,
      };

      const result = await handleGetTransaction(ynabAPI, params);
      const response = JSON.parse(result.content[0].text);

      expect(response.transaction).toBeDefined();
      expect(response.transaction.id).toBe(testTransactionId);

      console.log(`✅ Successfully retrieved transaction: ${response.transaction.id}`);
    } else {
      console.log('⚠️ No transactions found to test get transaction');
    }
  });

  it('should handle invalid budget ID gracefully', async () => {
    const params = {
      budget_id: 'invalid-budget-id',
    };

    const result = await handleListTransactions(ynabAPI, params);
    const response = JSON.parse(result.content[0].text);

    expect(response.error).toBeDefined();
    expect(response.error.message).toBeDefined();

    console.log(`✅ Correctly handled invalid budget ID: ${response.error.message}`);
  });

  it('should handle invalid transaction ID gracefully', async () => {
    const params = {
      budget_id: testBudgetId,
      transaction_id: 'invalid-transaction-id',
    };

    const result = await handleGetTransaction(ynabAPI, params);
    const response = JSON.parse(result.content[0].text);

    expect(response.error).toBeDefined();
    expect(response.error.message).toBeDefined();

    console.log(`✅ Correctly handled invalid transaction ID: ${response.error.message}`);
  });

  // Note: We're not testing create/update/delete operations in integration tests
  // to avoid modifying real budget data. These would be tested in a sandbox environment.
});
