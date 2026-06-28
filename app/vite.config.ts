import { defineConfig } from 'vite';

// Test-bench web app (ADR-0010). Built with Vite, deployed to GitHub Pages.
//
// `base` is the project-page path: the site is served from
// https://emma-london.github.io/Ringing-Library/. Change it here if the repo is
// renamed or moved to a custom domain.
//
// `server.fs.allow: ['..']` lets the dev server import the library straight from
// `../src` (outside this app/ root). The production build already permits this.
export default defineConfig({
  base: '/Ringing-Library/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Dedicated port so this app never collides with other local Vite servers
    // (e.g. CallChangeTrainer on 5173). strictPort makes Vite fail loudly rather
    // than silently drifting to another port.
    port: 5180,
    strictPort: true,
    fs: { allow: ['..'] },
  },
});
