import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.js',
      formats: ['iife'],
      name: 'Dedicated',
      fileName: () => 'main.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
});
