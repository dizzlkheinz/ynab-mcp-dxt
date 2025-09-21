# YNAB MCP Reconciliation Workflow Enhancements

This file tracks the development plan for improving the account reconciliation process.

## TODO List

- [x] **1. Enhance Foundational Transaction Tools:**
  - Modify `create_transaction`, `update_transaction`, and `delete_transaction` to return the updated `balance` and `cleared_balance` of the affected account in their response.

- [x] **2. Enhance Comparison Tool:**
  - [x] Add automatic payee lookup/suggestion feature.
  - [ ] Investigate and fix any further reported bugs (e.g., incorrect counts).

- [ ] **3. Implement High-Level Reconciliation Tool:**
  - Create a new `reconcile_account` tool that encapsulates the entire iterative reconciliation logic.
  - This tool will leverage the enhanced foundational tools from the previous steps.
