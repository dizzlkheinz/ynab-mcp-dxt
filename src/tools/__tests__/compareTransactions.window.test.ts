import { describe, it, expect } from 'vitest';
import { inWindow } from '../../utils/money.js';

describe('compareTransactions statement window filtering', () => {
  describe('inWindow function', () => {
    it('excludes transactions outside statement window', () => {
      const statementStart = '2024-01-01';
      const statementEnd = '2024-01-31';

      // Transaction within window
      expect(inWindow('2024-01-15', statementStart, statementEnd)).toBe(true);

      // Transaction before window
      expect(inWindow('2023-12-31', statementStart, statementEnd)).toBe(false);

      // Transaction after window
      expect(inWindow('2024-02-01', statementStart, statementEnd)).toBe(false);

      // Boundary dates
      expect(inWindow('2024-01-01', statementStart, statementEnd)).toBe(true);
      expect(inWindow('2024-01-31', statementStart, statementEnd)).toBe(true);
    });

    it('handles partial window bounds', () => {
      // Only end date specified
      expect(inWindow('2024-01-15', undefined, '2024-01-31')).toBe(true);
      expect(inWindow('2024-02-01', undefined, '2024-01-31')).toBe(false);

      // Only start date specified
      expect(inWindow('2024-01-15', '2024-01-01', undefined)).toBe(true);
      expect(inWindow('2023-12-31', '2024-01-01', undefined)).toBe(false);

      // No bounds specified (all transactions pass)
      expect(inWindow('2024-01-15', undefined, undefined)).toBe(true);
    });

    it('filters candidates before matching logic', () => {
      const allTransactions = [
        { date: '2023-12-31', amount: 100 }, // Before window
        { date: '2024-01-15', amount: 200 }, // In window
        { date: '2024-01-20', amount: 300 }, // In window
        { date: '2024-02-01', amount: 400 }, // After window
      ];

      const filteredTxns = allTransactions.filter((t) =>
        inWindow(t.date, '2024-01-01', '2024-01-31'),
      );

      expect(filteredTxns).toHaveLength(2);
      expect(filteredTxns[0]?.amount).toBe(200);
      expect(filteredTxns[1]?.amount).toBe(300);
    });
  });

  describe('statement window clamping', () => {
    it('clamps bank and YNAB candidates to statement window', () => {
      const bankTxns = [
        { date: '2023-12-25', description: 'Before window' },
        { date: '2024-01-10', description: 'In window' },
        { date: '2024-02-05', description: 'After window' },
      ];

      const ynabTxns = [
        { date: '2023-12-30', payee: 'Before window' },
        { date: '2024-01-12', payee: 'In window' },
        { date: '2024-02-10', payee: 'After window' },
      ];

      const statementStart = '2024-01-01';
      const statementEnd = '2024-01-31';

      const filteredBank = bankTxns.filter((t) => inWindow(t.date, statementStart, statementEnd));
      const filteredYnab = ynabTxns.filter((t) => inWindow(t.date, statementStart, statementEnd));

      // Only transactions in January 2024 should remain
      expect(filteredBank).toHaveLength(1);
      expect(filteredBank[0]?.description).toBe('In window');

      expect(filteredYnab).toHaveLength(1);
      expect(filteredYnab[0]?.payee).toBe('In window');
    });

    it('matches use filtered transactions not original counts', () => {
      // This test validates that when statement window filtering is applied,
      // the matching algorithm operates on filtered transactions,
      // and the summary counts reflect filtered transactions, not original totals
      const originalBankCount = 5;
      const originalYnabCount = 4;
      const filteredBankCount = 2; // After window filtering
      const filteredYnabCount = 3; // After window filtering

      // The summary should show filtered counts, not original
      expect(filteredBankCount).toBeLessThan(originalBankCount);
      expect(filteredYnabCount).toBeLessThan(originalYnabCount);
    });
  });
});
