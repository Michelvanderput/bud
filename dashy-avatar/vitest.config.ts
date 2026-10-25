import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/component/**/*.test.{ts,tsx}'], environment: 'jsdom' } });
