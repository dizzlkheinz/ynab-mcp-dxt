# YNAB MCP Server - Testing Guide

This document describes the comprehensive testing suite for the YNAB MCP Server.

## Overview

The testing suite includes four types of tests:

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test component interactions with mocked dependencies
3. **End-to-End Tests** - Test complete workflows with real YNAB API (optional)
4. **Performance Tests** - Test response times, memory usage, and load handling

## Test Structure

```
src/
├── __tests__/                     # Global test utilities and E2E tests
│   ├── setup.ts                   # Test environment setup
│   ├── testUtils.ts               # Shared test utilities
│   ├── testRunner.ts              # Comprehensive test runner
│   ├── workflows.e2e.test.ts      # End-to-end workflow tests
│   ├── comprehensive.integration.test.ts  # Integration tests
│   └── performance.test.ts        # Performance and load tests
├── server/__tests__/              # Server component tests
├── tools/__tests__/               # Tool-specific tests
└── types/__tests__/               # Type definition tests
```

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

## Environment Setup

### For Unit and Integration Tests (using mocks):
```bash
# Optional - will use mock token if not provided
YNAB_ACCESS_TOKEN=your_test_token
```

### For End-to-End Tests (using real YNAB API):
```bash
# Required for E2E tests
YNAB_ACCESS_TOKEN=your_real_ynab_personal_access_token

# Optional - specify test budget/account IDs
TEST_BUDGET_ID=your_test_budget_id
TEST_ACCOUNT_ID=your_test_account_id

# Optional - skip E2E tests
SKIP_E2E_TESTS=true
```

## Test Types

### Unit Tests
- Test individual functions and classes in isolation
- Use mocked dependencies
- Fast execution (< 10 seconds)
- No external API calls

### Integration Tests
- Test component interactions
- Use mocked YNAB API responses
- Validate complete tool workflows
- Medium execution time (10-30 seconds)

### End-to-End Tests
- Test against real YNAB API
- Validate complete user workflows
- Slower execution (30-60 seconds)
- **Warning**: Creates real data in your test budget

### Performance Tests
- Test response times and memory usage
- Validate performance under load
- Test error handling performance
- Medium execution time (15-30 seconds)

## Coverage Requirements

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

## Common Issues and Solutions

### E2E Tests Skipped
```
⏭️ E2E tests skipped (no API key or SKIP_E2E_TESTS=true)
```
**Solution**: Set `YNAB_ACCESS_TOKEN` environment variable

### Coverage Below Threshold
```
⚠️ Coverage below target (<80%)
```
**Solution**: Add more tests or remove untestable code from coverage

### Performance Tests Failing
```
❌ Performance assertion failed: 1500ms > 1000ms
```
**Solution**: Optimize code or adjust performance thresholds

For more detailed testing information, see the source code in `src/__tests__/`.