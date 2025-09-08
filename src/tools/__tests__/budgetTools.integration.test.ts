import { describe, it, expect, beforeAll } from 'vitest';
import * as ynab from 'ynab';
import { handleListBudgets, handleGetBudget } from '../budgetTools.js';

/**
 * Integration tests for budget tools using real YNAB API
 */
describe('Budget Tools Integration', () => {
  let ynabAPI: ynab.API;
  let testBudgetId: string;

  beforeAll(() => {
    const accessToken = process.env['YNAB_ACCESS_TOKEN'];
    if (!accessToken) {
      throw new Error(
        'YNAB_ACCESS_TOKEN is required. Set it in your .env file to run integration tests.',
      );
    }
    ynabAPI = new ynab.API(accessToken);
  });

  describe('handleListBudgets', () => {
    it('should successfully list budgets from real API', async () => {
      const result = await handleListBudgets(ynabAPI);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.budgets).toBeDefined();
      expect(Array.isArray(parsedContent.budgets)).toBe(true);
      expect(parsedContent.budgets.length).toBeGreaterThan(0);

      // Store first budget ID for next test
      testBudgetId = parsedContent.budgets[0].id;

      // Verify budget structure
      const firstBudget = parsedContent.budgets[0];
      expect(firstBudget.id).toBeDefined();
      expect(firstBudget.name).toBeDefined();
      expect(firstBudget.last_modified_on).toBeDefined();
      expect(firstBudget.first_month).toBeDefined();
      expect(firstBudget.last_month).toBeDefined();

      console.log(`✅ Successfully listed ${parsedContent.budgets.length} budgets`);
    });
  });

  describe('handleGetBudget', () => {
    it('should successfully get budget details from real API', async () => {
      // Use the budget ID from the previous test
      const result = await handleGetBudget(ynabAPI, { budget_id: testBudgetId });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.budget).toBeDefined();

      const budget = parsedContent.budget;
      expect(budget.id).toBe(testBudgetId);
      expect(budget.name).toBeDefined();
      expect(budget.accounts).toBeDefined();
      expect(Array.isArray(budget.accounts)).toBe(true);
      expect(budget.categories).toBeDefined();
      expect(Array.isArray(budget.categories)).toBe(true);

      console.log(`✅ Successfully retrieved budget: ${budget.name}`);
      console.log(`   - ${budget.accounts.length} accounts`);
      console.log(`   - ${budget.categories.length} categories`);
    });

    it('should handle invalid budget ID gracefully', async () => {
      const result = await handleGetBudget(ynabAPI, { budget_id: 'invalid-budget-id' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBeDefined();
      expect(parsedContent.error.message).toBeDefined();

      console.log(`✅ Correctly handled invalid budget ID: ${parsedContent.error.message}`);
    });
  });
});
