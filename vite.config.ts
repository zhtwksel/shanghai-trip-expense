import { defineConfig } from 'vite';

export default defineConfig({
  // Pages CI supplies its repository subpath; ordinary local builds keep '/'.
  base: process.env.VITE_BASE_PATH || '/',
});
