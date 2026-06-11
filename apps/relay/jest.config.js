module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  // Workspace packages ship built dist for production, but under jest we point
  // at TypeScript source so ts-jest transpiles them inline and tests never
  // depend on prior package builds. Anchored so it can't shadow other
  // @bellfield/* packages.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@bellfield/contracts$': '<rootDir>/../../packages/contracts/src/index.ts'
  }
};
