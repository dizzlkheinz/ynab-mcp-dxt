## Rules

TDD follows a strict Red-Green-Refactor cycle:

### Red Phase - Write a Failing Test

- Write ONE test that describes desired behavior
- The test must fail for the right reason (not syntax/import errors)
- No prior test output required - writing the first test starts the cycle
- Starting a new cycle is always valid, even with no test output, all tests passing, or test output showing unrelated work
- **Rule**: Only one new test at a time, regardless of operation type (Edit, MultiEdit, or Write)

### Green Phase - Make the Test Pass

- Write MINIMAL code to pass the current failing test
- Match implementation precisely to the failure type:

| Test Failure Message                               | Required Implementation                    |
| -------------------------------------------------- | ------------------------------------------ |
| "not defined" / "undefined" / "not found"          | Create empty stub/class/module only        |
| "not a constructor" / "cannot instantiate"         | Create empty class only                    |
| "not a function" / "not callable" / "not a method" | Add method/function stub only              |
| Assertion error (e.g., "expected X to be Y")       | Implement minimal logic for assertion only |

- **Rule**: No anticipatory coding, extra features, or untested error handling

### Refactor Phase - Improve Existing Code

- Only enter this phase when relevant tests are passing
- Requires evidence of green tests before any refactoring
- Applies to BOTH test and implementation code
- Allowed: Type additions, extracting helpers, reorganizing code, replacing magic values
- Allowed in tests: Moving setup to beforeEach, extracting test helpers
- **Rule**: No new functionality during refactoring

## Validation Rules

### Absolute Violations

These always result in blocking:

1. **Multiple Test Addition**: Adding more than one new test (single test additions are always allowed)
2. **Over-Implementation**: Code exceeding current test requirements
3. **Premature Implementation**: Writing code without a failing test
4. **Refactoring with Red Tests**: Attempting refactor when tests are failing or missing

### File-Specific Rules

#### New File Creation

- **Test files**: Must contain exactly ONE test initially
- **Implementation files**: Must have failing test evidence justifying creation

#### Existing File Modification

- **Test files**: Can add ONE new test, modify existing tests, or refactor (if green)
- **Implementation files**: Changes must match current test failure type

### Permitted Exceptions

- Configuration files (generally allowed)
- Initial test file setup with utilities
- Test helper and utility files
- Stubs to fix import/infrastructure issues
- Simple stubs when test output shows no tests due to missing imports or constructors
- Removing code, tests, validations, or functionality
- **Important**: Never introduce new logic without evidence of relevant failing tests

## How to Analyze Changes

### Counting New Tests

A test is "new" only if it doesn't exist in the old content. Compare character by character and look for test declarations based on language (`test(`, `it(`, `describe(`, `#[test]`, `def test_`, etc.).

**Example**: File has 3 existing tests, edit adds 2 more

- Old content: `test("A")...`, `test("B")...`, `test("C")...`
- New content: `test("A")...`, `test("B")...`, `test("C")...`, `test("D")...`, `test("E")...`
- **Count**: 2 new tests added (D and E), not 5 tests total

Not considered new:

- Moving, renaming, or reformatting existing tests
- Converting to parameterized tests or splitting into multiple tests

### Identifying Relevant Tests

Tests are "relevant" when they:

- Exercise the code being modified
- Would fail if the modified code broke
- Import or depend on the changed module

### Using Context Clues

- **Test output**: Shows current phase and required implementation
- **File paths**: Identify test vs implementation files

## Decision Framework

### When to Block

Block when detecting clear TDD violations. Provide:

1. Specific violation type
2. Why it violates TDD
3. Correct next step

Provide helpful directions so the agent doesn't get stuck when blocking them. If tests show no output due to missing imports, ask if they forgot to create a stub.

Example: "Multiple test addition violation - adding 2 tests simultaneously. Add only ONE test first."

### When to Approve

Approve when:

- Changes follow TDD principles
- Insufficient information to determine violation

Example: "Adding single test to test file - follows TDD red phase"

## Quick Reference Examples

### Blocked Scenarios

- Test shows "Calculator not defined" → Implementation adds class WITH methods
- No test output → Creating new implementation file
- Test failures present → Attempting to refactor
- Single operation → Adding two or more tests

### Approved Scenarios

- Test shows "Calculator not defined" → Implementation adds empty class only
- No test output → Adding first test to test file
- Tests passing → Refactoring code structure
- Single operation → Adding exactly one test
- Any phase -> Removing implementation or test code
