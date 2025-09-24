import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import {
  handleListCategories,
  handleGetCategory,
  handleUpdateCategory,
  ListCategoriesSchema,
  GetCategorySchema,
  UpdateCategorySchema,
} from '../categoryTools.js';

// Mock the YNAB API
const mockYnabAPI = {
  categories: {
    getCategories: vi.fn(),
    getCategoryById: vi.fn(),
    updateMonthCategory: vi.fn(),
  },
} as unknown as ynab.API;

describe('Category Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleListCategories', () => {
    it('should return formatted category list on success', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Immediate Obligations',
          hidden: false,
          deleted: false,
          categories: [
            {
              id: 'category-1',
              category_group_id: 'group-1',
              name: 'Rent/Mortgage',
              hidden: false,
              original_category_group_id: null,
              note: 'Monthly housing payment',
              budgeted: 150000,
              activity: -150000,
              balance: 0,
              goal_type: null,
              goal_creation_month: null,
              goal_target: null,
              goal_target_month: null,
              goal_percentage_complete: null,
            },
            {
              id: 'category-2',
              category_group_id: 'group-1',
              name: 'Utilities',
              hidden: false,
              original_category_group_id: null,
              note: null,
              budgeted: 20000,
              activity: -18000,
              balance: 2000,
              goal_type: null,
              goal_creation_month: null,
              goal_target: null,
              goal_target_month: null,
              goal_percentage_complete: null,
            },
          ],
        },
        {
          id: 'group-2',
          name: 'True Expenses',
          hidden: false,
          deleted: false,
          categories: [
            {
              id: 'category-3',
              category_group_id: 'group-2',
              name: 'Car Maintenance',
              hidden: false,
              original_category_group_id: null,
              note: null,
              budgeted: 5000,
              activity: 0,
              balance: 5000,
              goal_type: 'TBD',
              goal_creation_month: '2024-01-01',
              goal_target: 100000,
              goal_target_month: '2024-12-01',
              goal_percentage_complete: 5,
            },
          ],
        },
      ];

      (mockYnabAPI.categories.getCategories as any).mockResolvedValue({
        data: { category_groups: mockCategoryGroups },
      });

      const result = await handleListCategories(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.categories).toHaveLength(3);
      expect(parsedContent.category_groups).toHaveLength(2);

      // Check first category
      expect(parsedContent.categories[0]).toEqual({
        id: 'category-1',
        category_group_id: 'group-1',
        category_group_name: 'Immediate Obligations',
        name: 'Rent/Mortgage',
        hidden: false,
        original_category_group_id: null,
        note: 'Monthly housing payment',
        budgeted: 150,
        activity: -150,
        balance: 0,
        goal_type: null,
        goal_creation_month: null,
        goal_target: null,
        goal_target_month: null,
        goal_percentage_complete: null,
      });

      // Check category groups
      expect(parsedContent.category_groups[0]).toEqual({
        id: 'group-1',
        name: 'Immediate Obligations',
        hidden: false,
        deleted: false,
      });
    });

    it('should handle 401 authentication errors', async () => {
      (mockYnabAPI.categories.getCategories as any).mockRejectedValue(
        new Error('401 Unauthorized'),
      );

      const result = await handleListCategories(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.categories.getCategories as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleListCategories(mockYnabAPI, { budget_id: 'invalid-budget' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or category not found');
    });
  });

  describe('handleGetCategory', () => {
    it('should return detailed category information on success', async () => {
      const mockCategory = {
        id: 'category-1',
        category_group_id: 'group-1',
        name: 'Groceries',
        hidden: false,
        original_category_group_id: null,
        note: 'Food and household items',
        budgeted: 50000,
        activity: -45000,
        balance: 5000,
        goal_type: 'TBD',
        goal_creation_month: '2024-01-01',
        goal_target: 60000,
        goal_target_month: '2024-12-01',
        goal_percentage_complete: 83,
      };

      (mockYnabAPI.categories.getCategoryById as any).mockResolvedValue({
        data: { category: mockCategory },
      });

      const result = await handleGetCategory(mockYnabAPI, {
        budget_id: 'budget-1',
        category_id: 'category-1',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.category).toEqual({
        id: 'category-1',
        category_group_id: 'group-1',
        name: 'Groceries',
        hidden: false,
        original_category_group_id: null,
        note: 'Food and household items',
        budgeted: 50,
        activity: -45,
        balance: 5,
        goal_type: 'TBD',
        goal_creation_month: '2024-01-01',
        goal_target: 60000,
        goal_target_month: '2024-12-01',
        goal_percentage_complete: 83,
      });
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.categories.getCategoryById as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleGetCategory(mockYnabAPI, {
        budget_id: 'budget-1',
        category_id: 'invalid-category',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or category not found');
    });
  });

  describe('handleUpdateCategory', () => {
    it('should update category budget for current month on success', async () => {
      const mockUpdatedCategory = {
        id: 'category-1',
        category_group_id: 'group-1',
        name: 'Groceries',
        hidden: false,
        original_category_group_id: null,
        note: 'Food and household items',
        budgeted: 60000, // Updated amount
        activity: -45000,
        balance: 15000,
        goal_type: 'TBD',
        goal_creation_month: '2024-01-01',
        goal_target: 60000,
        goal_target_month: '2024-12-01',
        goal_percentage_complete: 100,
      };

      (mockYnabAPI.categories.updateMonthCategory as any).mockResolvedValue({
        data: { category: mockUpdatedCategory },
      });

      const result = await handleUpdateCategory(mockYnabAPI, {
        budget_id: 'budget-1',
        category_id: 'category-1',
        budgeted: 60000,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.category.budgeted).toBe(60);
      expect(parsedContent.updated_month).toMatch(/^\d{4}-\d{2}-01$/);

      // Verify the API was called with correct parameters
      expect(mockYnabAPI.categories.updateMonthCategory).toHaveBeenCalledWith(
        'budget-1',
        expect.stringMatching(/^\d{4}-\d{2}-01$/),
        'category-1',
        { category: { budgeted: 60000 } },
      );
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.categories.updateMonthCategory as any).mockRejectedValue(
        new Error('404 Not Found'),
      );

      const result = await handleUpdateCategory(mockYnabAPI, {
        budget_id: 'budget-1',
        category_id: 'invalid-category',
        budgeted: 50000,
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or category not found');
    });

    it('should handle 403 forbidden errors', async () => {
      (mockYnabAPI.categories.updateMonthCategory as any).mockRejectedValue(
        new Error('403 Forbidden'),
      );

      const result = await handleUpdateCategory(mockYnabAPI, {
        budget_id: 'budget-1',
        category_id: 'category-1',
        budgeted: 50000,
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Insufficient permissions to access YNAB data');
    });
  });

  describe('Schema Validation', () => {
    describe('ListCategoriesSchema', () => {
      it('should validate valid budget_id', () => {
        const result = ListCategoriesSchema.parse({ budget_id: 'valid-budget-id' });
        expect(result.budget_id).toBe('valid-budget-id');
      });

      it('should reject empty budget_id', () => {
        expect(() => ListCategoriesSchema.parse({ budget_id: '' })).toThrow();
      });

      it('should reject missing budget_id', () => {
        expect(() => ListCategoriesSchema.parse({})).toThrow();
      });
    });

    describe('GetCategorySchema', () => {
      it('should validate valid parameters', () => {
        const result = GetCategorySchema.parse({
          budget_id: 'budget-1',
          category_id: 'category-1',
        });
        expect(result.budget_id).toBe('budget-1');
        expect(result.category_id).toBe('category-1');
      });

      it('should reject empty category_id', () => {
        expect(() =>
          GetCategorySchema.parse({
            budget_id: 'budget-1',
            category_id: '',
          }),
        ).toThrow();
      });

      it('should reject missing category_id', () => {
        expect(() => GetCategorySchema.parse({ budget_id: 'budget-1' })).toThrow();
      });
    });

    describe('UpdateCategorySchema', () => {
      it('should validate valid parameters', () => {
        const result = UpdateCategorySchema.parse({
          budget_id: 'budget-1',
          category_id: 'category-1',
          budgeted: 50000,
        });
        expect(result.budget_id).toBe('budget-1');
        expect(result.category_id).toBe('category-1');
        expect(result.budgeted).toBe(50000);
      });

      it('should reject non-integer budgeted amount', () => {
        expect(() =>
          UpdateCategorySchema.parse({
            budget_id: 'budget-1',
            category_id: 'category-1',
            budgeted: 50.5,
          }),
        ).toThrow();
      });

      it('should reject missing budgeted amount', () => {
        expect(() =>
          UpdateCategorySchema.parse({
            budget_id: 'budget-1',
            category_id: 'category-1',
          }),
        ).toThrow();
      });

      it('should accept negative budgeted amounts', () => {
        const result = UpdateCategorySchema.parse({
          budget_id: 'budget-1',
          category_id: 'category-1',
          budgeted: -10000,
        });
        expect(result.budgeted).toBe(-10000);
      });

      it('should accept zero budgeted amount', () => {
        const result = UpdateCategorySchema.parse({
          budget_id: 'budget-1',
          category_id: 'category-1',
          budgeted: 0,
        });
        expect(result.budgeted).toBe(0);
      });
    });
  });
});
