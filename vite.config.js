import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_TIME: JSON.stringify(Date.now()),
      __VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 3001,
      strictPort: false,
      host: true,
      // Local stand-in for the Vercel function in api/tmdb.js, so
      // `npm run dev` exercises the exact same same-origin `/api/tmdb` path
      // that production visitors use. Forwards path+query to TMDB as-is.
      proxy: {
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/tmdb/, ''),
        },
      },
    },
    preview: {
      port: 3001,
      strictPort: false,
      host: true,
      proxy: {
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/tmdb/, ''),
        },
      },
    },
    build: {
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('framer-motion') || id.includes('motion-dom')) return 'motion-vendor';
            if (id.includes('@tanstack') || id.includes('react-query')) return 'query-vendor';
            if (id.includes('lucide-react')) return 'icons-vendor';
            if (id.includes('slugify')) return 'slugify-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
})
