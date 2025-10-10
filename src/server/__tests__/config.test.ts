/**
 * Unit tests for config module
 *
 * Tests environment validation and server configuration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironment } from '../config.js';
import { ConfigurationError } from '../../types/index.js';

describe('config module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should return valid configuration when YNAB_ACCESS_TOKEN is set', () => {
      const testToken = 'test-token-12345';
      process.env.YNAB_ACCESS_TOKEN = testToken;

      const result = validateEnvironment();

      expect(result).toEqual({
        accessToken: testToken,
        defaultBudgetId: undefined,
      });
    });

    it('should trim whitespace from access token', () => {
      const testToken = '  test-token-with-spaces  ';
      const expectedToken = 'test-token-with-spaces';
      process.env.YNAB_ACCESS_TOKEN = testToken;

      const result = validateEnvironment();

      expect(result).toEqual({
        accessToken: expectedToken,
        defaultBudgetId: undefined,
      });
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is not set', () => {
      delete process.env.YNAB_ACCESS_TOKEN;

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow(
        'YNAB_ACCESS_TOKEN environment variable is required but not set',
      );
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is undefined', () => {
      delete process.env.YNAB_ACCESS_TOKEN;

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow(
        'YNAB_ACCESS_TOKEN environment variable is required but not set',
      );
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is empty string', () => {
      process.env.YNAB_ACCESS_TOKEN = '';

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow('YNAB_ACCESS_TOKEN must be a non-empty string');
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is only whitespace', () => {
      process.env.YNAB_ACCESS_TOKEN = '   ';

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow('YNAB_ACCESS_TOKEN must be a non-empty string');
    });

    it('should throw ConfigurationError when YNAB_ACCESS_TOKEN is not a string', () => {
      // TypeScript normally prevents this, but test runtime validation
      (process.env as any).YNAB_ACCESS_TOKEN = 123;

      expect(() => validateEnvironment()).toThrow(ConfigurationError);
      expect(() => validateEnvironment()).toThrow('YNAB_ACCESS_TOKEN must be a non-empty string');
    });

    it('should handle various valid token formats', () => {
      const validTokens = [
        'abc123',
        'token-with-dashes',
        'token_with_underscores',
        'MixedCaseToken',
        '1234567890',
        'very-long-token-with-many-characters-abcdefghijklmnopqrstuvwxyz',
      ];

      validTokens.forEach((token) => {
        process.env.YNAB_ACCESS_TOKEN = token;
        const result = validateEnvironment();
        expect(result.accessToken).toBe(token);
        expect(result.defaultBudgetId).toBeUndefined();
      });
    });

    it('should handle edge cases with leading and trailing whitespace', () => {
      const testCases = [
        { input: '\ntest-token\n', expected: 'test-token' },
        { input: '\ttest-token\t', expected: 'test-token' },
        { input: ' \t\ntest-token \t\n', expected: 'test-token' },
      ];

      testCases.forEach(({ input, expected }) => {
        process.env.YNAB_ACCESS_TOKEN = input;
        const result = validateEnvironment();
        expect(result.accessToken).toBe(expected);
        expect(result.defaultBudgetId).toBeUndefined();
      });
    });
  });

  describe('error handling', () => {
    it('should throw proper ConfigurationError instances', () => {
      delete process.env.YNAB_ACCESS_TOKEN;

      try {
        validateEnvironment();
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error).toBeInstanceOf(Error);
        expect((error as ConfigurationError).name).toBe('ConfigurationError');
      }
    });

    it('should provide helpful error messages', () => {
      const testCases = [
        {
          setup: () => delete process.env.YNAB_ACCESS_TOKEN,
          expectedMessage: 'YNAB_ACCESS_TOKEN environment variable is required but not set',
        },
        {
          setup: () => (process.env.YNAB_ACCESS_TOKEN = ''),
          expectedMessage: 'YNAB_ACCESS_TOKEN must be a non-empty string',
        },
        {
          setup: () => (process.env.YNAB_ACCESS_TOKEN = '   '),
          expectedMessage: 'YNAB_ACCESS_TOKEN must be a non-empty string',
        },
      ];

      testCases.forEach(({ setup, expectedMessage }) => {
        setup();
        try {
          validateEnvironment();
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toBe(expectedMessage);
        }
      });
    });
  });
});
