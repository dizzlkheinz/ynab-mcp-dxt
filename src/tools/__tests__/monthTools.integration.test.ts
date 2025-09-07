import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ynab from 'ynab';
import { handleGetMonth, handleListMonths } from '../monthTools.js';

/**
 * Integration tests for month tools using real YNAB API
 */
describe('Month Tools Integration', () => {
  let ynabAPI: ynab.API;
  let testBudgetId: string;
  let testMonth: string;

  beforeAll(async () => {
    // Load API key from file
    try {
      const apiKeyFile = readFileSync(join(process.cwd(), 'api_key.txt'), 'utf-8');
      const lines = apiKeyFile.split('\n');

      let accessToken = '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'YNAB_API_KEY' && value) {
          accessToken = value.trim();
          break;
        }
      }

      if (!accessToken) {
        throw new Error('YNAB_API_KEY not found in api_key.txt');
      }

      ynabAPI = new ynab.API(accessToken);
      console.log('✅ Loaded YNAB API key for integration tests');

      // Get a test budget ID
      const budgetsResponse = await ynabAPI.budgets.getBudgets();
      if (budgetsResponse.data.budgets.length === 0) {
        throw new Error('No budgets found for testing');
      }
      testBudgetId = budgetsResponse.data.budgets[0].id;

      // Get a test month from the existing months in the budget
      const monthsResponse = await ynabAPI.months.getBudgetMonths(testBudgetId);
      if (monthsResponse.data.months.length === 0) {
        throw new Error('No months found for testing');
      }
      testMonth = monthsResponse.data.months[0].month;

      console.log(`✅ Using test budget: ${testBudgetId}`);
      console.log(`✅ Using test month: ${testMonth}`);
    } catch (error) {
      throw new Error(`Failed to setup integration tests: ${error}`);
    }
  });

  describe('handleListMonths', () => {
    it('should successfully list months from real API', async () => {
      const result = await handleListMonths(ynabAPI, { budget_id: testBudgetId });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.months).toBeDefined();
      expect(Array.isArray(parsedContent.months)).toBe(true);
      expect(parsedContent.months.length).toBeGreaterThan(0);

      // Verify month structure
      const firstMonth = parsedContent.months[0];
      expect(firstMonth.month).toBeDefined();
      expect(typeof firstMonth.income).toBe('number');
      expect(typeof firstMonth.budgeted).toBe('number');
      expect(typeof firstMonth.activity).toBe('number');
      expect(typeof firstMonth.to_be_budgeted).toBe('number');
      expect(typeof firstMonth.deleted).toBe('boolean');

      console.log(`✅ Successfully listed ${parsedContent.months.length} months`);
      console.log(`   - First month: ${firstMonth.month}`);
      console.log(`   - Income: ${firstMonth.income} milliunits`);
      console.log(`   - Budgeted: ${firstMonth.budgeted} milliunits`);
    });

    it('should handle invalid budget ID gracefully', async () => {
      const result = await handleListMonths(ynabAPI, { budget_id: 'invalid-budget-id' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBeDefined();
      expect(parsedContent.error.message).toBeDefined();

      console.log(`✅ Correctly handled invalid budget ID: ${parsedContent.error.message}`);
    });
  });

  describe('handleGetMonth', () => {
    it('should successfully get month details from real API', async () => {
      const result = await handleGetMonth(ynabAPI, {
        budget_id: testBudgetId,
        month: testMonth,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.month).toBeDefined();

      const month = parsedContent.month;
      expect(month.month).toBe(testMonth);
      expect(typeof month.income).toBe('number');
      expect(typeof month.budgeted).toBe('number');
      expect(typeof month.activity).toBe('number');
      expect(typeof month.to_be_budgeted).toBe('number');
      expect(typeof month.deleted).toBe('boolean');

      // Categories should be present
      expect(month.categories).toBeDefined();
      expect(Array.isArray(month.categories)).toBe(true);

      if (month.categories.length > 0) {
        const firstCategory = month.categories[0];
        expect(firstCategory.id).toBeDefined();
        expect(firstCategory.name).toBeDefined();
        expect(typeof firstCategory.budgeted).toBe('number');
        expect(typeof firstCategory.activity).toBe('number');
        expect(typeof firstCategory.balance).toBe('number');
        expect(typeof firstCategory.hidden).toBe('boolean');
        expect(typeof firstCategory.deleted).toBe('boolean');
      }

      console.log(`✅ Successfully retrieved month: ${month.month}`);
      console.log(`   - Income: ${month.income} milliunits`);
      console.log(`   - Budgeted: ${month.budgeted} milliunits`);
      console.log(`   - Activity: ${month.activity} milliunits`);
      console.log(`   - To be budgeted: ${month.to_be_budgeted} milliunits`);
      console.log(`   - Categories: ${month.categories.length}`);
    });

    it('should handle invalid budget ID gracefully', async () => {
      const result = await handleGetMonth(ynabAPI, {
        budget_id: 'invalid-budget-id',
        month: testMonth,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBeDefined();
      expect(parsedContent.error.message).toBeDefined();

      console.log(`✅ Correctly handled invalid budget ID: ${parsedContent.error.message}`);
    });

    it('should handle invalid month format gracefully', async () => {
      const result = await handleGetMonth(ynabAPI, {
        budget_id: testBudgetId,
        month: '2024-13-01', // Invalid month
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBeDefined();
      expect(parsedContent.error.message).toBeDefined();

      console.log(`✅ Correctly handled invalid month: ${parsedContent.error.message}`);
    });
  });
});
