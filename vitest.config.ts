import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Use projects to target unit/integration/e2e groups (Vitest v3)
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          setupFiles: ['src/__tests__/setup.ts'],
          include: ['src/**/*.{test,spec}.ts'],
          exclude: [
            'src/**/*.integration.test.ts',
            'src/**/*.e2e.test.ts',
            'src/server/__tests__/YNABMCPServer.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          setupFiles: ['src/__tests__/setup.ts'],
          include: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          globals: true,
          environment: 'node',
          setupFiles: ['src/__tests__/setup.ts'],
          include: ['src/**/*.e2e.test.ts'],
        },
      },
    ],
    exclude: ['src/__tests__/testRunner.ts'], // Exclude test runner from test execution
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 30000, // 30 seconds for e2e tests
    hookTimeout: 10000, // 10 seconds for setup/teardown
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/**/*.d.ts',
        'src/index.ts', // Entry point excluded from coverage
        'src/__tests__/**/*.ts', // Test utilities excluded from coverage
      ],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
