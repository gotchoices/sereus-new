import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.integration.ts'],
    // Integration tests can be slow - give them time
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Run sequentially by default - parallel can cause port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Increase reporter verbosity
    reporters: ['verbose'],
    coverage: { 
      reporter: ['text', 'html'],
      exclude: ['**/fixtures/**']
    }
  }
})

