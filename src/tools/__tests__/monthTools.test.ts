import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import {
  handleGetMonth,
  handleListMonths,
  GetMonthSchema,
  ListMonthsSchema,
} from '../monthTools.js';

// Mock the YNAB API
const mockYnabAPI = {
  months: {
    getBudgetMonth: vi.fn(),
    getBudgetMonths: vi.fn(),
  },
} as unknown as ynab.API;

describe('Month Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetMonth', () => {
    it('should return formatted month data on success', async () => {
      const mockMonth = {
        month: '2024-01-01',
        note: 'January budget',
        income: 500000,
        budgeted: 450000,
        activity: -400000,
        to_be_budgeted: 50000,
        age_of_money: 30,
        deleted: false,
        categories: [
          {
            id: 'category-1',
            category_group_id: 'group-1',
            category_group_name: 'Monthly Bills',
            name: 'Rent',
            hidden: false,
            original_category_group_id: null,
            note: 'Monthly rent payment',
            budgeted: 150000,
            activity: -150000,
            balance: 0,
            goal_type: 'TB',
            goal_creation_month: '2024-01-01',
            goal_target: 150000,
            goal_target_month: '2024-01-01',
            goal_percentage_complete: 100,
            goal_months_to_budget: 0,
            goal_under_funded: 0,
            goal_overall_funded: 150000,
            goal_overall_left: 0,
            deleted: false,
          },
        ],
      };

      (mockYnabAPI.months.getBudgetMonth as any).mockResolvedValue({
        data: { month: mockMonth },
      });

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.month.month).toBe('2024-01-01');
      expect(parsedContent.month.note).toBe('January budget');
      expect(parsedContent.month.income).toBe(500000);
      expect(parsedContent.month.budgeted).toBe(450000);
      expect(parsedContent.month.activity).toBe(-400000);
      expect(parsedContent.month.to_be_budgeted).toBe(50000);
      expect(parsedContent.month.age_of_money).toBe(30);
      expect(parsedContent.month.categories).toHaveLength(1);
      expect(parsedContent.month.categories[0].name).toBe('Rent');
    });

    it('should handle 401 authentication errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });

    it('should handle 403 forbidden errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(new Error('403 Forbidden'));

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Insufficient permissions to access YNAB data');
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'invalid-budget',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or month not found');
    });

    it('should handle 429 rate limit errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(
        new Error('429 Too Many Requests'),
      );

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Rate limit exceeded. Please try again later');
    });

    it('should handle 500 server errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(
        new Error('500 Internal Server Error'),
      );

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('YNAB service is currently unavailable');
    });

    it('should handle generic errors', async () => {
      (mockYnabAPI.months.getBudgetMonth as any).mockRejectedValue(new Error('Network error'));

      const result = await handleGetMonth(mockYnabAPI, {
        budget_id: 'budget-1',
        month: '2024-01-01',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Failed to get month data');
    });
  });

  describe('handleListMonths', () => {
    it('should return formatted months list on success', async () => {
      const mockMonths = [
        {
          month: '2024-01-01',
          note: 'January budget',
          income: 500000,
          budgeted: 450000,
          activity: -400000,
          to_be_budgeted: 50000,
          age_of_money: 30,
          deleted: false,
        },
        {
          month: '2024-02-01',
          note: 'February budget',
          income: 520000,
          budgeted: 470000,
          activity: -420000,
          to_be_budgeted: 50000,
          age_of_money: 32,
          deleted: false,
        },
      ];

      (mockYnabAPI.months.getBudgetMonths as any).mockResolvedValue({
        data: { months: mockMonths },
      });

      const result = await handleListMonths(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.months).toHaveLength(2);
      expect(parsedContent.months[0]).toEqual({
        month: '2024-01-01',
        note: 'January budget',
        income: 500000,
        budgeted: 450000,
        activity: -400000,
        to_be_budgeted: 50000,
        age_of_money: 30,
        deleted: false,
      });
      expect(parsedContent.months[1]).toEqual({
        month: '2024-02-01',
        note: 'February budget',
        income: 520000,
        budgeted: 470000,
        activity: -420000,
        to_be_budgeted: 50000,
        age_of_money: 32,
        deleted: false,
      });
    });

    it('should handle 401 authentication errors', async () => {
      (mockYnabAPI.months.getBudgetMonths as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleListMonths(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.months.getBudgetMonths as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleListMonths(mockYnabAPI, { budget_id: 'invalid-budget' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or month not found');
    });

    it('should handle generic errors', async () => {
      (mockYnabAPI.months.getBudgetMonths as any).mockRejectedValue(new Error('Network error'));

      const result = await handleListMonths(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Failed to list months');
    });
  });

  describe('GetMonthSchema', () => {
    it('should validate valid parameters', () => {
      const result = GetMonthSchema.parse({
        budget_id: 'valid-budget-id',
        month: '2024-01-01',
      });
      expect(result.budget_id).toBe('valid-budget-id');
      expect(result.month).toBe('2024-01-01');
    });

    it('should reject empty budget_id', () => {
      expect(() =>
        GetMonthSchema.parse({
          budget_id: '',
          month: '2024-01-01',
        }),
      ).toThrow();
    });

    it('should reject missing budget_id', () => {
      expect(() =>
        GetMonthSchema.parse({
          month: '2024-01-01',
        }),
      ).toThrow();
    });

    it('should reject invalid month format', () => {
      expect(() =>
        GetMonthSchema.parse({
          budget_id: 'valid-budget-id',
          month: '2024-1-1',
        }),
      ).toThrow();
    });

    it('should reject missing month', () => {
      expect(() =>
        GetMonthSchema.parse({
          budget_id: 'valid-budget-id',
        }),
      ).toThrow();
    });

    it('should reject non-ISO date format', () => {
      expect(() =>
        GetMonthSchema.parse({
          budget_id: 'valid-budget-id',
          month: '01/01/2024',
        }),
      ).toThrow();
    });
  });

  describe('ListMonthsSchema', () => {
    it('should validate valid budget_id', () => {
      const result = ListMonthsSchema.parse({ budget_id: 'valid-budget-id' });
      expect(result.budget_id).toBe('valid-budget-id');
    });

    it('should reject empty budget_id', () => {
      expect(() => ListMonthsSchema.parse({ budget_id: '' })).toThrow();
    });

    it('should reject missing budget_id', () => {
      expect(() => ListMonthsSchema.parse({})).toThrow();
    });

    it('should reject non-string budget_id', () => {
      expect(() => ListMonthsSchema.parse({ budget_id: 123 })).toThrow();
    });
  });
});
