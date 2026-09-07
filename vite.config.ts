import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  publicDir: 'assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.{cjs,js,ts}'],
    exclude: ['node_modules', 'dist', 'release'],
  },
});
