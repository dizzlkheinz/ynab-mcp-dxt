# YNAB MCP Server - Comprehensive Testing Guide

This document describes the comprehensive testing suite for the YNAB MCP Server, including setup, execution, and interpretation of test results.

## Overview

The testing suite includes four types of tests:

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test component interactions with mocked dependencies
3. **End-to-End Tests** - Test complete workflows with real YNAB API (optional)
4. **Performance Tests** - Test response times, memory usage, and load handling

## Test Structure

```
src/
├── __tests__/
│   ├── setup.ts                    # Test environment setup
│   ├── testUtils.ts                # Shared test utilities
│   ├── testRunner.ts               # Comprehensive test runner
│   ├── workflows.e2e.test.ts       # End-to-end workflow tests
│   ├── comprehensive.integration.test.ts  # Integration tests
│   └── performance.test.ts         # Performance and load tests
├── server/__tests__/               # Server component tests
├── tools/__tests__/                # Tool-specific tests
└── types/__tests__/                # Type definition tests
```

## Prerequisites

### Required Dependencies

```bash
npm install
```

### Environment Variables

For **unit and integration tests** (using mocks):
```bash
# Optional - will use mock token if not provided
YNAB_ACCESS_TOKEN=your_test_token
```

For **end-to-end tests** (using real YNAB API):
```bash
# Required for E2E tests
YNAB_ACCESS_TOKEN=your_real_ynab_personal_access_token

# Optional - specify test budget/account IDs
TEST_BUDGET_ID=your_test_budget_id
TEST_ACCOUNT_ID=your_test_account_id

# Optional - skip E2E tests
SKIP_E2E_TESTS=true
```

### YNAB API Setup for E2E Tests

1. Create a YNAB Personal Access Token:
   - Go to https://app.youneedabudget.com/settings/developer
   - Generate a new Personal Access Token
   - Copy the token (you won't see it again)

2. Set up a test budget:
   - Create a dedicated test budget in YNAB
   - Add at least one account
   - Add some categories
   - Optionally note the budget and account IDs for targeted testing

## Running Tests

### Quick Test Commands

```bash
# Run all tests with coverage
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests only
npm run test:performance   # Performance tests only

# Generate coverage report
npm run test:coverage

# Run comprehensive test suite with detailed reporting
npm run test:comprehensive
```

### Detailed Test Execution

#### Unit Tests
```bash
npm run test:unit
```
- Tests individual functions and classes in isolation
- Uses mocked dependencies
- Fast execution (< 10 seconds)
- No external API calls

#### Integration Tests
```bash
npm run test:integration
```
- Tests component interactions
- Uses mocked YNAB API responses
- Validates complete tool workflows
- Medium execution time (10-30 seconds)

#### End-to-End Tests
```bash
# With real API key
YNAB_ACCESS_TOKEN=your_token npm run test:e2e

# Skip if no API key available
SKIP_E2E_TESTS=true npm run test:e2e
```
- Tests against real YNAB API
- Validates complete user workflows
- Slower execution (30-60 seconds)
- **Warning**: Creates real data in your test budget

#### Performance Tests
```bash
npm run test:performance
```
- Tests response times and memory usage
- Validates performance under load
- Tests error handling performance
- Medium execution time (15-30 seconds)

#### Comprehensive Test Suite
```bash
npm run test:comprehensive
```
- Runs all test types in sequence
- Generates detailed HTML report
- Provides coverage analysis
- Creates `test-report.md` with full results

## Test Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YNAB_ACCESS_TOKEN` | YNAB Personal Access Token | `test-token-for-mocked-tests` |
| `TEST_BUDGET_ID` | Specific budget ID for E2E tests | First available budget |
| `TEST_ACCOUNT_ID` | Specific account ID for E2E tests | First available account |
| `SKIP_E2E_TESTS` | Skip end-to-end tests | `false` |
| `VERBOSE_TESTS` | Show detailed test output | `false` |
| `NODE_ENV` | Node environment | `test` |

### Coverage Thresholds

The test suite enforces minimum coverage thresholds:

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

## Test Data Management

### Mock Data
- Unit and integration tests use mock data
- Mock responses are defined in test files
- No real API calls or data modification

### E2E Test Data
- E2E tests create real data in your YNAB budget
- Test transactions are automatically cleaned up
- Test accounts cannot be deleted via API (manual cleanup required)
- Use a dedicated test budget to avoid affecting real data

### Test Data Cleanup
```typescript
// Automatic cleanup for E2E tests
const cleanup = new TestDataCleanup();
cleanup.trackTransaction(transactionId);
await cleanup.cleanup(server, budgetId);
```

## Interpreting Test Results

### Success Criteria

A successful test run should show:
```
✅ Unit Tests: All passed
✅ Integration Tests: All passed  
✅ E2E Tests: All passed (or skipped)
✅ Performance Tests: All passed
✅ Coverage: ≥80% overall
```

### Common Issues

#### E2E Tests Skipped
```
⏭️ E2E tests skipped (no API key or SKIP_E2E_TESTS=true)
```
**Solution**: Set `YNAB_ACCESS_TOKEN` environment variable

#### Coverage Below Threshold
```
⚠️ Coverage below target (<80%)
```
**Solution**: Add more tests or remove untestable code from coverage

#### Performance Tests Failing
```
❌ Performance assertion failed: 1500ms > 1000ms
```
**Solution**: Optimize code or adjust performance thresholds

#### API Rate Limiting
```
❌ Rate limit exceeded
```
**Solution**: Wait and retry, or implement exponential backoff

## Test Reports

### Coverage Report
- HTML report: `coverage/index.html`
- JSON report: `coverage/coverage-summary.json`
- Console output during test execution

### Comprehensive Report
- Markdown report: `test-report.md`
- Includes all test results, coverage, and recommendations
- Generated by `npm run test:comprehensive`

### Test Results JSON
- Machine-readable results: `test-results.json`
- Useful for CI/CD integration

## Continuous Integration

### GitHub Actions Example
```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:performance
      - run: npm run test:coverage
      # Skip E2E tests in CI unless token is provided
      - run: SKIP_E2E_TESTS=true npm run test:e2e
```

### Local Development
```bash
# Quick feedback loop
npm run test:watch

# Pre-commit validation
npm run test:all && npm run test:coverage
```

## Troubleshooting

### Common Problems

1. **Tests timeout**
   - Increase timeout in `vitest.config.ts`
   - Check for infinite loops or hanging promises

2. **Mock not working**
   - Verify mock is imported before the module being tested
   - Check mock implementation matches expected interface

3. **E2E tests fail**
   - Verify YNAB token is valid and has necessary permissions
   - Check test budget has required accounts and categories
   - Ensure test budget is not read-only

4. **Coverage gaps**
   - Add tests for uncovered branches
   - Remove dead code
   - Add integration tests for complex workflows

### Debug Mode
```bash
# Enable verbose output
VERBOSE_TESTS=true npm test

# Debug specific test
npx vitest run src/tools/__tests__/budgetTools.test.ts --reporter=verbose
```

## Best Practices

### Writing Tests
1. **Arrange-Act-Assert** pattern
2. **Descriptive test names** that explain the scenario
3. **Mock external dependencies** for unit tests
4. **Test error conditions** as well as success paths
5. **Use test utilities** for common operations

### Test Organization
1. **Group related tests** in describe blocks
2. **Use beforeEach/afterEach** for setup/cleanup
3. **Keep tests independent** - no shared state
4. **Test one thing at a time**

### Performance Considerations
1. **Mock expensive operations** in unit tests
2. **Use realistic data sizes** in performance tests
3. **Test memory usage** for large datasets
4. **Validate response times** for user-facing operations

## Contributing

When adding new features:

1. **Write tests first** (TDD approach)
2. **Maintain coverage** above 80%
3. **Add integration tests** for new tools
4. **Update E2E tests** for new workflows
5. **Document test scenarios** in code comments

### Test Checklist

- [ ] Unit tests for new functions/classes
- [ ] Integration tests for new tools
- [ ] E2E tests for new workflows
- [ ] Performance tests for critical paths
- [ ] Error handling tests
- [ ] Input validation tests
- [ ] Documentation updates

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [YNAB API Documentation](https://api.youneedabudget.com/)
- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- [Testing Best Practices](https://testingjavascript.com/)