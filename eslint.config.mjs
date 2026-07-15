import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'web/**',
    'api/**',
    '.playwright-cli/**',
    'tests/playwright_e2e.js',
    'public/demo/**',
    'next-env.d.ts',
  ]),
])
