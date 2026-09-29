module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/server.js",
    "!src/views/**",
    "!src/public/**",
  ],
  verbose: true,
  clearMocks: true,
};
