import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    // Use automatic JSX runtime (same as Next.js) so components that
    // don't explicitly import React still work in vitest.
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
