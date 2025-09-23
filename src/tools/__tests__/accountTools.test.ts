import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ynab from 'ynab';
import {
  handleListAccounts,
  handleGetAccount,
  handleCreateAccount,
  ListAccountsSchema,
  GetAccountSchema,
  CreateAccountSchema,
} from '../accountTools.js';

// Mock the YNAB API
const mockYnabAPI = {
  accounts: {
    getAccounts: vi.fn(),
    getAccountById: vi.fn(),
    createAccount: vi.fn(),
  },
} as unknown as ynab.API;

describe('Account Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleListAccounts', () => {
    it('should return formatted account list on success', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          name: 'Checking Account',
          type: 'checking',
          on_budget: true,
          closed: false,
          note: 'Main checking account',
          balance: 100000,
          cleared_balance: 95000,
          uncleared_balance: 5000,
          transfer_payee_id: 'payee-1',
          direct_import_linked: false,
          direct_import_in_error: false,
        },
        {
          id: 'account-2',
          name: 'Savings Account',
          type: 'savings',
          on_budget: true,
          closed: false,
          note: 'Emergency fund',
          balance: 500000,
          cleared_balance: 500000,
          uncleared_balance: 0,
          transfer_payee_id: 'payee-2',
          direct_import_linked: true,
          direct_import_in_error: false,
        },
      ];

      (mockYnabAPI.accounts.getAccounts as any).mockResolvedValue({
        data: { accounts: mockAccounts },
      });

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.accounts).toHaveLength(2);
      expect(parsedContent.accounts[0]).toEqual({
        id: 'account-1',
        name: 'Checking Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: 'Main checking account',
        balance: 100,
        cleared_balance: 95,
        uncleared_balance: 5,
        transfer_payee_id: 'payee-1',
        direct_import_linked: false,
        direct_import_in_error: false,
      });
    });

    it('should handle 404 budget not found errors', async () => {
      (mockYnabAPI.accounts.getAccounts as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'invalid-budget' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or account not found');
    });

    it('should handle 401 authentication errors', async () => {
      (mockYnabAPI.accounts.getAccounts as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });

    it('should handle generic errors', async () => {
      (mockYnabAPI.accounts.getAccounts as any).mockRejectedValue(new Error('Network error'));

      const result = await handleListAccounts(mockYnabAPI, { budget_id: 'budget-1' });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Failed to list accounts');
    });
  });

  describe('handleGetAccount', () => {
    it('should return detailed account information on success', async () => {
      const mockAccount = {
        id: 'account-1',
        name: 'Checking Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: 'Main checking account',
        balance: 100000,
        cleared_balance: 95000,
        uncleared_balance: 5000,
        transfer_payee_id: 'payee-1',
        direct_import_linked: false,
        direct_import_in_error: false,
      };

      (mockYnabAPI.accounts.getAccountById as any).mockResolvedValue({
        data: { account: mockAccount },
      });

      const result = await handleGetAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        account_id: 'account-1',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.account).toEqual({
        id: 'account-1',
        name: 'Checking Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: 'Main checking account',
        balance: 100,
        cleared_balance: 95,
        uncleared_balance: 5,
        transfer_payee_id: 'payee-1',
        direct_import_linked: false,
        direct_import_in_error: false,
      });
    });

    it('should handle 404 account not found errors', async () => {
      (mockYnabAPI.accounts.getAccountById as any).mockRejectedValue(new Error('404 Not Found'));

      const result = await handleGetAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        account_id: 'invalid-account',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Budget or account not found');
    });

    it('should handle authentication errors', async () => {
      (mockYnabAPI.accounts.getAccountById as any).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await handleGetAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        account_id: 'account-1',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Invalid or expired YNAB access token');
    });
  });

  describe('handleCreateAccount', () => {
    it('should create account with all supported types', async () => {
      const accountTypes = [
        'checking',
        'savings',
        'creditCard',
        'cash',
        'lineOfCredit',
        'otherAsset',
        'otherLiability',
      ];

      for (const accountType of accountTypes) {
        const mockAccount = {
          id: `account-${accountType}`,
          name: `${accountType} Account`,
          type: accountType,
          on_budget: true,
          closed: false,
          note: null,
          balance: 100000,
          cleared_balance: 100000,
          uncleared_balance: 0,
          transfer_payee_id: `payee-${accountType}`,
          direct_import_linked: false,
          direct_import_in_error: false,
        };

        (mockYnabAPI.accounts.createAccount as any).mockResolvedValue({
          data: { account: mockAccount },
        });

        const result = await handleCreateAccount(mockYnabAPI, {
          budget_id: 'budget-1',
          name: `${accountType} Account`,
          type: accountType as any,
          balance: 100,
        });

        expect(result.content).toHaveLength(1);
        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.account.type).toBe(accountType);
        expect(parsedContent.account.name).toBe(`${accountType} Account`);
      }
    });

    it('should create account without initial balance', async () => {
      const mockAccount = {
        id: 'account-1',
        name: 'New Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: null,
        balance: 0,
        cleared_balance: 0,
        uncleared_balance: 0,
        transfer_payee_id: 'payee-1',
        direct_import_linked: false,
        direct_import_in_error: false,
      };

      (mockYnabAPI.accounts.createAccount as any).mockResolvedValue({
        data: { account: mockAccount },
      });

      const result = await handleCreateAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        name: 'New Account',
        type: 'checking',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.account.balance).toBe(0);

      // Verify the API was called with balance 0 in milliunits
      expect(mockYnabAPI.accounts.createAccount).toHaveBeenCalledWith('budget-1', {
        account: {
          name: 'New Account',
          type: 'checking',
          balance: 0,
        },
      });
    });

    it('should convert balance to milliunits', async () => {
      const mockAccount = {
        id: 'account-1',
        name: 'New Account',
        type: 'checking',
        on_budget: true,
        closed: false,
        note: null,
        balance: 150000,
        cleared_balance: 150000,
        uncleared_balance: 0,
        transfer_payee_id: 'payee-1',
        direct_import_linked: false,
        direct_import_in_error: false,
      };

      (mockYnabAPI.accounts.createAccount as any).mockResolvedValue({
        data: { account: mockAccount },
      });

      await handleCreateAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        name: 'New Account',
        type: 'checking',
        balance: 150, // $150 should become 150000 milliunits
      });

      // Verify the API was called with balance converted to milliunits
      expect(mockYnabAPI.accounts.createAccount).toHaveBeenCalledWith('budget-1', {
        account: {
          name: 'New Account',
          type: 'checking',
          balance: 150000,
        },
      });
    });

    it('should handle creation errors', async () => {
      (mockYnabAPI.accounts.createAccount as any).mockRejectedValue(new Error('400 Bad Request'));

      const result = await handleCreateAccount(mockYnabAPI, {
        budget_id: 'budget-1',
        name: 'New Account',
        type: 'checking',
      });

      expect(result.content).toHaveLength(1);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.message).toBe('Failed to create account');
    });
  });

  describe('Schema Validation', () => {
    describe('ListAccountsSchema', () => {
      it('should validate valid budget_id', () => {
        const result = ListAccountsSchema.parse({ budget_id: 'valid-budget-id' });
        expect(result.budget_id).toBe('valid-budget-id');
      });

      it('should reject empty budget_id', () => {
        expect(() => ListAccountsSchema.parse({ budget_id: '' })).toThrow();
      });

      it('should reject missing budget_id', () => {
        expect(() => ListAccountsSchema.parse({})).toThrow();
      });
    });

    describe('GetAccountSchema', () => {
      it('should validate valid parameters', () => {
        const result = GetAccountSchema.parse({
          budget_id: 'budget-1',
          account_id: 'account-1',
        });
        expect(result.budget_id).toBe('budget-1');
        expect(result.account_id).toBe('account-1');
      });

      it('should reject missing account_id', () => {
        expect(() => GetAccountSchema.parse({ budget_id: 'budget-1' })).toThrow();
      });

      it('should reject empty account_id', () => {
        expect(() =>
          GetAccountSchema.parse({
            budget_id: 'budget-1',
            account_id: '',
          }),
        ).toThrow();
      });
    });

    describe('CreateAccountSchema', () => {
      it('should validate valid account creation parameters', () => {
        const result = CreateAccountSchema.parse({
          budget_id: 'budget-1',
          name: 'New Account',
          type: 'checking',
          balance: 100,
        });
        expect(result.budget_id).toBe('budget-1');
        expect(result.name).toBe('New Account');
        expect(result.type).toBe('checking');
        expect(result.balance).toBe(100);
      });

      it('should validate without optional balance', () => {
        const result = CreateAccountSchema.parse({
          budget_id: 'budget-1',
          name: 'New Account',
          type: 'savings',
        });
        expect(result.balance).toBeUndefined();
      });

      it('should validate all supported account types', () => {
        const validTypes = [
          'checking',
          'savings',
          'creditCard',
          'cash',
          'lineOfCredit',
          'otherAsset',
          'otherLiability',
        ];

        validTypes.forEach((type) => {
          const result = CreateAccountSchema.parse({
            budget_id: 'budget-1',
            name: 'Test Account',
            type,
          });
          expect(result.type).toBe(type);
        });
      });

      it('should reject invalid account type', () => {
        expect(() =>
          CreateAccountSchema.parse({
            budget_id: 'budget-1',
            name: 'Test Account',
            type: 'invalid-type',
          }),
        ).toThrow();
      });

      it('should reject empty name', () => {
        expect(() =>
          CreateAccountSchema.parse({
            budget_id: 'budget-1',
            name: '',
            type: 'checking',
          }),
        ).toThrow();
      });

      it('should reject missing required fields', () => {
        expect(() =>
          CreateAccountSchema.parse({
            budget_id: 'budget-1',
          }),
        ).toThrow();
      });
    });
  });
});
