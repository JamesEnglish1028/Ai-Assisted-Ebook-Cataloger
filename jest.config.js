export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.d.ts',
    '!server/index.ts', // Exclude main entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for file processing tests
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};