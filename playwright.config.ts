import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] },
  projects: [
    { name: 'next', testMatch: 'next.spec.ts', use: { baseURL: 'http://localhost:3101' } },
    { name: 'vite', testMatch: 'vite.spec.ts', use: { baseURL: 'http://localhost:5174' } },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      cwd: 'examples/next',
      url: 'http://localhost:3101',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm dev',
      cwd: 'examples/vite',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
