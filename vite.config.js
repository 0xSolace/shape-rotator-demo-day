import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.DEPLOY_TARGET === 'gh' ? '/shape-rotator-demo-day/' : '/',
  build: { outDir: 'dist', emptyOutDir: true },
});
