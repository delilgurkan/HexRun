/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  // Monorepodan gelen dosyalar bağımlılıklarını da mobilin node_modules'unda bulsun.
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|@maplibre/.*|@tanstack/.*|h3-js))',
  ],
  // Paylaşılan paketler (ESM dist) monorepodan gelir ve dönüştürülür.
  watchPathIgnorePatterns: ['<rootDir>/node_modules/'],
};
