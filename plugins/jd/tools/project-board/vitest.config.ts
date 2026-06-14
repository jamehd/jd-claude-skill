import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts', 'server/src/**/*.test.tsx', 'ui/src/**/*.test.ts', 'ui/src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: true,
  },
})
