import { describe, it, expect, beforeAll } from 'vitest';
import * as ynab from 'ynab';
import { handleListAccounts, handleGetAccount } from '../accountTools.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Account Tools Integration', () => {
  let ynabAPI: ynab.API;
  let testBudgetId: string;

  beforeAll(async () => {
    // Load API key from file
    try {
      const fileContent = readFileSync(join(process.cwd(), 'api_key.txt'), 'utf-8').trim();
      const apiKeyLine = fileContent.split('\n').find((line) => line.startsWith('YNAB_API_KEY='));
      if (!apiKeyLine) {
        throw new Error('YNAB_API_KEY not found in api_key.txt');
      }
      const apiKey = apiKeyLine.split('=')[1];
      console.log('✅ Loaded YNAB API key for integration tests');
      ynabAPI = new ynab.API(apiKey);

      // Get the first budget for testing
      const budgetsResponse = await ynabAPI.budgets.getBudgets();
      testBudgetId = budgetsResponse.data.budgets[0].id;
    } catch (error) {
      console.log('⚠️ Skipping integration tests - no API key found');
      throw error;
    }
  });

  it('should successfully list accounts from real API', async () => {
    const result = await handleListAccounts(ynabAPI, { budget_id: testBudgetId });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.accounts).toBeDefined();
    expect(Array.isArray(parsedContent.accounts)).toBe(true);

    console.log(`✅ Successfully listed ${parsedContent.accounts.length} accounts`);

    // Verify account structure
    if (parsedContent.accounts.length > 0) {
      const account = parsedContent.accounts[0];
      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('type');
      expect(account).toHaveProperty('balance');
    }
  });

  it('should successfully get account details from real API', async () => {
    // First get the list of accounts to get a valid account ID
    const listResult = await handleListAccounts(ynabAPI, { budget_id: testBudgetId });
    const parsedListContent = JSON.parse(listResult.content[0].text);

    if (parsedListContent.accounts.length === 0) {
      console.log('⚠️ No accounts found in test budget, skipping account detail test');
      return;
    }

    const testAccountId = parsedListContent.accounts[0].id;

    const result = await handleGetAccount(ynabAPI, {
      budget_id: testBudgetId,
      account_id: testAccountId,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.account).toBeDefined();
    expect(parsedContent.account.id).toBe(testAccountId);
    expect(parsedContent.account).toHaveProperty('name');
    expect(parsedContent.account).toHaveProperty('type');
    expect(parsedContent.account).toHaveProperty('balance');

    console.log(`✅ Successfully retrieved account: ${parsedContent.account.name}`);
  });

  it('should handle invalid budget ID gracefully', async () => {
    const result = await handleListAccounts(ynabAPI, { budget_id: 'invalid-budget-id' });

    expect(result.content).toHaveLength(1);
    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.error).toBeDefined();
    expect(parsedContent.error.message).toContain('Failed to list accounts');

    console.log('✅ Correctly handled invalid budget ID:', parsedContent.error.message);
  });

  it('should handle invalid account ID gracefully', async () => {
    const result = await handleGetAccount(ynabAPI, {
      budget_id: testBudgetId,
      account_id: 'invalid-account-id',
    });

    expect(result.content).toHaveLength(1);
    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.error).toBeDefined();
    expect(parsedContent.error.message).toContain('Failed to get account');

    console.log('✅ Correctly handled invalid account ID:', parsedContent.error.message);
  });
});
