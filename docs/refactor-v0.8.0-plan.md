# v0.8.0 Refactor Plan

## Goals
- Introduce a reusable tool registry that centralizes metadata, validation, security, and execution for all MCP tools.
- Decompose `YNABMCPServer` into composable services (config, resources, prompts, diagnostics) to shrink responsibilities and improve testability.
- Standardize budget resolution and error handling so missing defaults always yield structured responses.
- Enhance caching observability and resilience while keeping YNAB API usage efficient.
- Break up the largest tool modules into focused units with targeted tests.
- Remove the implicit dependency cycle between the error handler and formatter via explicit injection.
- Land changes incrementally with full test coverage and documentation updates.

## Execution & Branch Strategy
- Create a long-lived feature branch (e.g., `refactor/v0.8.0`) from `main` to isolate refactor work while keeping `main` releasable.
- Deliver each phase through a short-lived branch off the feature branch; merge back after review and green pipelines before starting the next phase.
- Rebase the feature branch on `main` regularly to pull in upstream fixes and resolve conflicts early.
- Keep the server buildable and tests green after every phase, using adapters or temporary shims instead of leaving broken paths.
- Gate each pull request on full unit/integration runs plus the new coverage required for that phase, updating docs/ADRs alongside the code.
- After each merge, run smoke tests for key flows (list/set budget, accounts, reconciliation, diagnostics) to verify parity with v0.7.x apart from intended improvements.

## Phase Breakdown

### Phase 1 – Tool Registry & Shared Plumbing
- Create `src/server/toolRegistry.ts` with injectable dependencies (`withSecurityWrapper`, `ErrorHandler`, `responseFormatter`, cache helpers).
- Define `ToolDefinition` (schema, description, handler, default argument resolver) and a registry class to emit MCP tool metadata and execute handlers through shared security + error flows.
- Move the large switch in `YNABMCPServer` into registry registrations. Ensure `listTools`, prompt wiring, and execution paths reuse registry data so schemas/descriptions stay in sync.
- Extend server tests to cover registry behaviour (unknown tool name, validation failures, minify overrides, security errors).
- Document the registry contract (required fields, return shapes, minify handling) in docs/ADR to guide future tool authors.

### Phase 2 – Modular Server Orchestration
- Extract environment validation into `src/server/config.ts`; pull resource definitions into `resources.ts`, prompts into `prompts.ts`, diagnostics into `diagnostics.ts`.
- Refactor `YNABMCPServer` to orchestrate these modules, still exposing `run`, `validateToken`, and default-budget helpers for tests.
- Pass dependencies through the constructor to simplify unit testing and avoid hidden singletons.
- Update integration tests to assert the refactored handlers match current behaviour.

### Phase 3 – Budget Resolution Consistency
- Introduce a shared helper that resolves budget IDs, returning `ErrorHandler.createValidationError` when no default is set.
- Replace every direct call to `getBudgetId` (registry, prompts, diagnostics, reconciliation helpers) with the helper so error shapes stay consistent.
- Add regression tests for the "no default budget" path.

### Phase 4 – Cache Enhancements
- Extend `CacheManager` with hit/miss counters, last-cleanup timestamp, and configurable `maxEntries` + simple LRU eviction.
- Support per-entry options (custom TTL, optional `staleWhileRevalidate`) and add a `wrap(key, options, loader)` helper that deduplicates concurrent fetches and avoids caching rejected promises.
- Surface metrics via diagnostics and allow manual/interval cleanup triggers.
- Audit tool handlers to standardize key generation with `generateKey` and apply caching where safe; add tests for metrics, eviction, loader concurrency, and failure handling.
- After `set_default_budget`, warm the accounts cache via `wrap` as a best-effort internal optimisation without changing the public response.

### Phase 5 – Tool Module Decomposition
- Split `compareTransactions` into parser/matcher/formatter modules. Keep the exported handler simple and add unit tests around each stage (format autodetect, tolerance windows, matching heuristics).
- Decompose `financialOverviewTools` into utilities for trend analysis, insight generation, and formatting; share them with prompts and expand test coverage.
- Ensure exports remain stable for consumers and update existing tests accordingly.

### Phase 6 – Error Handling Injection
- Refactor `ErrorHandler` to accept a formatter instance (constructor or setter) to remove the circular dependency on `responseFormatter`.
- Update server setup and registry to pass the same formatter instance.
- Add unit tests verifying formatted output honours the injected formatter and handles fallback scenarios.

### Phase 7 – Sequencing, Validation & Documentation
- Land phases sequentially (registry/server split first, then budget helper, cache upgrades, tool decomposition, error injection). Maintain adapters where necessary so tests remain green between steps.
- After each phase, run full test suites and lint/type checks; add new coverage before deleting legacy paths.
- Update README/developer docs with the new architecture, cache options, and warm-cache behaviour. Record decisions in ADRs for future contributors.
- Final verification: exercise end-to-end flows (list/set budget, list accounts, reconciliation tools, diagnostics) to confirm behaviour matches v0.7.x aside from deliberate enhancements.

