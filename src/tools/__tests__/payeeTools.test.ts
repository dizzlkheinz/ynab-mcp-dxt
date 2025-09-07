import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import {
  handleListPayees,
  handleGetPayee,
  ListPayeesSchema,
  GetPayeeSchema,
} from '../payeeTools.js';

// Mock the YNAB API
const mockYnabAPI = {
  payees: {
    getPayees: vi.fn(),
    getPayeeById: vi.fn(),
  },
} as unknown as ynab.API;

describe('Payee Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleListPayees', () => {
    it('should return formatted payee list on success', async () => {
      const mockPayees = [
        {
          id: 'payee-1',
          name: 'Grocery Store',
          transfer_account_id: null,
          deleted: false,
        },
        {
          id: 'payee-2',
          name: 'Gas Station',
          transfer_account_id: null,
          deleted: false,
        },
        {
          id: 'payee-3',
          name: 'Transfer : Savings',
          transfer_account_id: 'account-2',
          deleted: false,
        },
      ];

      (mockYnabAPI.payees.getPayees as any).mockResolvedValue({
        data: { payees: mockPayees },
      });

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.payees).toHaveLength(3);
      expect(parsedContent.payees[0]).toEqual({
        id: 'payee-1',
        name: 'Grocery Store',
        transfer_account_id: null,
        deleted: false,
      });
      expect(parsedContent.payees[2]).toEqual({
        id: 'payee-3',
        name: 'Transfer : Savings',
        transfer_account_id: 'account-2',
        deleted: false,
      });
    });

    it('should handle 401 authentication errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });

    it('should handle 403 forbidden errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(new Error('403 Forbidden'));

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Insufficient permissions to access YNAB data');
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'invalid-budget' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or payee not found');
    });

    it('should handle 429 rate limit errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(new Error('429 Too Many Requests'));

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Rate limit exceeded. Please try again later');
    });

    it('should handle 500 server errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(
        new Error('500 Internal Server Error'),
      );

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('YNAB service is currently unavailable');
    });

    it('should handle generic errors', async () => {
      (mockYnabAPI.payees.getPayees as any).mockRejectedValue(new Error('Network error'));

      const result = await handleListPayees(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Failed to list payees');
    });
  });

  describe('handleGetPayee', () => {
    it('should return detailed payee information on success', async () => {
      const mockPayee = {
        id: 'payee-1',
        name: 'Grocery Store',
        transfer_account_id: null,
        deleted: false,
      };

      (mockYnabAPI.payees.getPayeeById as any).mockResolvedValue({
        data: { payee: mockPayee },
      });

      const result = await handleGetPayee(mockYnabAPI, {
        budget_id: 'budget-1',
        payee_id: 'payee-1',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.payee).toEqual({
        id: 'payee-1',
        name: 'Grocery Store',
        transfer_account_id: null,
        deleted: false,
      });
    });

    it('should return transfer payee information on success', async () => {
      const mockPayee = {
        id: 'payee-2',
        name: 'Transfer : Savings',
        transfer_account_id: 'account-2',
        deleted: false,
      };

      (mockYnabAPI.payees.getPayeeById as any).mockResolvedValue({
        data: { payee: mockPayee },
      });

      const result = await handleGetPayee(mockYnabAPI, {
        budget_id: 'budget-1',
        payee_id: 'payee-2',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.payee.transfer_account_id).toBe('account-2');
    });

    it('should handle 404 not found errors', async () => {
      (mockYnabAPI.payees.getPayeeById as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleGetPayee(mockYnabAPI, {
        budget_id: 'budget-1',
        payee_id: 'invalid-payee',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or payee not found');
    });

    it('should handle authentication errors', async () => {
      (mockYnabAPI.payees.getPayeeById as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleGetPayee(mockYnabAPI, {
        budget_id: 'budget-1',
        payee_id: 'payee-1',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });
  });

  describe('ListPayeesSchema', () => {
    it('should validate valid budget_id', () => {
      const result = ListPayeesSchema.parse({ budget_id: 'valid-budget-id' });
      expect(result.budget_id).toBe('valid-budget-id');
    });

    it('should reject empty budget_id', () => {
      expect(() => ListPayeesSchema.parse({ budget_id: '' })).toThrow();
    });

    it('should reject missing budget_id', () => {
      expect(() => ListPayeesSchema.parse({})).toThrow();
    });

    it('should reject non-string budget_id', () => {
      expect(() => ListPayeesSchema.parse({ budget_id: 123 })).toThrow();
    });
  });

  describe('GetPayeeSchema', () => {
    it('should validate valid parameters', () => {
      const result = GetPayeeSchema.parse({
        budget_id: 'valid-budget-id',
        payee_id: 'valid-payee-id',
      });
      expect(result.budget_id).toBe('valid-budget-id');
      expect(result.payee_id).toBe('valid-payee-id');
    });

    it('should reject empty budget_id', () => {
      expect(() =>
        GetPayeeSchema.parse({
          budget_id: '',
          payee_id: 'valid-payee-id',
        }),
      ).toThrow();
    });

    it('should reject empty payee_id', () => {
      expect(() =>
        GetPayeeSchema.parse({
          budget_id: 'valid-budget-id',
          payee_id: '',
        }),
      ).toThrow();
    });

    it('should reject missing budget_id', () => {
      expect(() =>
        GetPayeeSchema.parse({
          payee_id: 'valid-payee-id',
        }),
      ).toThrow();
    });

    it('should reject missing payee_id', () => {
      expect(() =>
        GetPayeeSchema.parse({
          budget_id: 'valid-budget-id',
        }),
      ).toThrow();
    });

    it('should reject non-string parameters', () => {
      expect(() =>
        GetPayeeSchema.parse({
          budget_id: 123,
          payee_id: 456,
        }),
      ).toThrow();
    });
  });
});
