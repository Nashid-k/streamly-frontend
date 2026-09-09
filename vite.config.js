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
    server: { port: 3001, strictPort: false },
    build: {
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('framer-motion') || id.includes('motion-dom')) return 'motion-vendor';
            if (id.includes('@tanstack') || id.includes('react-query')) return 'query-vendor';
            if (id.includes('firebase')) return 'firebase-vendor';
            // The HLS player is only needed after a title is opened. Keeping it
            // out of the shared vendor chunk improves first-load browsing.
            if (id.includes('hls.js')) return 'hls-vendor';
            if (id.includes('lucide-react')) return 'icons-vendor';
            if (id.includes('slugify')) return 'slugify-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
})
