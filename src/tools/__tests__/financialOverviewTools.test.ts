import { describe, it, expect } from 'vitest';
import * as ynab from 'ynab';

// Import all named exports from the legacy shim
import * as LegacyTools from '../financialOverviewTools.js';

// Import all named exports from the new source module
import * as NewTools from '../financialOverview/index.js';

// Mock the YNAB API
const mockYnabApi = {} as ynab.API;

describe('financialOverviewTools backward compatibility shim', () => {
  it('should re-export all named exports from the new module', () => {
    // This test ensures that the shim exports the exact same members as the new module.
    // It guards against the shim becoming stale if the new module's exports change.
    expect(Object.keys(LegacyTools).sort()).toEqual(Object.keys(NewTools).sort());
  });

  it('should ensure all re-exported members are referentially identical', () => {
    // This test verifies that the re-exported members are not just named the same,
    // but are the exact same functions/objects, ensuring true backward compatibility.
    for (const exportName in NewTools) {
      if (Object.prototype.hasOwnProperty.call(NewTools, exportName)) {
        const key = exportName as keyof typeof NewTools;
        expect(LegacyTools[key]).toBe(NewTools[key]);
      }
    }
  });

  // Optional: A smoke test for a few key exports to be extra sure.
  it('should correctly export key handlers and schemas', () => {
    expect(LegacyTools.handleFinancialOverview).toBe(NewTools.handleFinancialOverview);
    expect(LegacyTools.FinancialOverviewSchema).toBe(NewTools.FinancialOverviewSchema);
    expect(LegacyTools.handleBudgetHealthCheck).toBe(NewTools.handleBudgetHealthCheck);
  });
});

describe('Financial Overview Handlers Contract', () => {
  it('should return an error if budget_id is missing in handleFinancialOverview', async () => {
    const params = { months: 3, include_trends: true, include_insights: true };
    // @ts-expect-error - Testing invalid params
    const result = await LegacyTools.handleFinancialOverview(mockYnabApi, params);
    const resultObject = JSON.parse(result.content[0].text);
    expect(resultObject.error.message).toContain('An error occurred while executing');
    expect(resultObject.error.message).toContain('financial-overview');
  });

  it('should return an error if budget_id is missing in handleSpendingAnalysis', async () => {
    const params = { period_months: 6 };
    // @ts-expect-error - Testing invalid params
    const result = await LegacyTools.handleSpendingAnalysis(mockYnabApi, params);
    const resultObject = JSON.parse(result.content[0].text);
    expect(resultObject.error.message).toContain('An error occurred while executing');
    expect(resultObject.error.message).toContain('spending-analysis');
  });

  it('should return an error if budget_id is missing in handleBudgetHealthCheck', async () => {
    const params = { include_recommendations: true };
    // @ts-expect-error - Testing invalid params
    const result = await LegacyTools.handleBudgetHealthCheck(mockYnabApi, params);
    const resultObject = JSON.parse(result.content[0].text);
    expect(resultObject.error.message).toContain('An error occurred while executing');
    expect(resultObject.error.message).toContain('budget-health-check');
  });
});
