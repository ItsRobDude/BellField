module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  // The estimating engine ships as a built dist for production (nest start), but
  // under jest we point at its TypeScript source so ts-jest transpiles it inline
  // and tests never depend on a prior build step. Anchored so it can't shadow
  // other @bellfield/* packages.
  moduleNameMapper: {
    '^@bellfield/estimating$': '<rootDir>/../../packages/estimating/src/index.ts'
  }
};
