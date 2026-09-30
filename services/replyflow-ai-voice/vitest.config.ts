import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

// Single unified test runner for the AI voice service.
// Most test files use bare describe/it/before globals and chai-style expect,
// so globals are enabled and files may `import { expect } from 'chai'`.
export default defineConfig({
  resolve: {
    alias: [
      // Force the Node build of `ws`: its package "browser" field points to a
      // browser shim where `Server` is not a constructor, which breaks
      // `import { Server } from 'ws'` inside src/index.ts under vite-node.
      { find: /^ws$/, replacement: req.resolve('ws') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    // src/index.ts binds the HTTP server on module load; PORT=0 lets the OS
    // pick a free port so multiple test files can import the entrypoint.
    env: {
      PORT: '0',
      OPENAI_API_KEY: 'test-openai-key',
    },
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
    // Several suites spawn in-process servers/sockets; run serially to keep
    // the suite deterministic.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
