import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

function apiDevServerPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/auth' || url.pathname === '/api/sync' || url.pathname === '/api/publicCollections') {
          try {
            const endpoint = url.pathname === '/api/auth' ? './api/auth.js'
              : url.pathname === '/api/sync' ? './api/sync.js'
              : './api/publicCollections.js';
            const { default: handler } = await import(endpoint);
            let body = {};
            if (req.method === 'POST') {
              const buffers = [];
              for await (const chunk of req) {
                buffers.push(chunk);
              }
              const raw = Buffer.concat(buffers).toString('utf-8');
              try {
                body = JSON.parse(raw);
              } catch {
                body = {};
              }
            }
            req.body = body;
            req.query = Object.fromEntries(url.searchParams.entries());
            res.status = function(code) {
              this.statusCode = code;
              return this;
            };
            res.json = function(data) {
              this.setHeader('Content-Type', 'application/json');
              this.end(JSON.stringify(data));
            };
            res.send = function(data) {
              this.end(data);
            };
            await handler(req, res);
            return;
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Dev API execution error' }));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), tailwindcss(), apiDevServerPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
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
      // Inject <link rel="modulepreload"> for every chunk — measurable LCP win on first visit
      modulePreload: { polyfill: true },
      cssCodeSplit: true,
      // Skip per-chunk gzip stats in CI output for faster builds
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600,
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
          // Stable, content-hashed filenames — lets Vercel/CDN cache assets for 1 year
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
})
