import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained dist/index.html, like HANE Voyage: it opens straight from disk and deploys as a single file.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { cssMinify: false, target: 'es2022' },   // (top-level await: src/fonts.ts)
  server: { host: '127.0.0.1', port: 8780, strictPort: true },
  preview: { host: '127.0.0.1', port: 8781, strictPort: true },
});
