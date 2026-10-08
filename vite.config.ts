import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // V6.2: two pages — the welcome page at / and the app at /app/
  build: { rollupOptions: { input: { welcome: 'index.html', app: 'app/index.html' } } },
  plugins: [
    // Local dev/preview: /app → /app/ (Vercel does the same with a rewrite)
    {
      name: 'app-slash',
      configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url === '/app' || req.url?.startsWith('/app?')) { res.statusCode = 301; res.setHeader('Location', req.url.replace('/app', '/app/')); res.end() } else next() }) },
      configurePreviewServer(server) { server.middlewares.use((req, res, next) => { if (req.url === '/app' || req.url?.startsWith('/app?')) { res.statusCode = 301; res.setHeader('Location', req.url.replace('/app', '/app/')); res.end() } else next() }) },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Folio56',
        short_name: 'Folio56',
        description: 'Private, offline notes. Keep outside, Notion inside.',
        theme_color: '#141416',
        background_color: '#141416',
        display: 'standalone',
        orientation: 'any',
        // id stays '/' so copies installed before 6.2 are recognised as the same app
        id: '/',
        scope: '/',
        start_url: '/app/',
        // Android (installed app): Folio appears in the share sheet, so a Folio link shared from WhatsApp etc. opens here.
        share_target: { action: '/app/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        // Long-press the installed icon (Android, Windows, macOS Chrome/Edge) for quick capture.
        // V5.7: installed Folio can be the "Open with" app for PDFs (Margins)
        file_handlers: [{ action: '/app/', accept: { 'application/pdf': ['.pdf'] } }],
        shortcuts: [
          { name: 'Read a PDF', short_name: 'Margins', url: '/app/?view=margins', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Voice memo', short_name: 'Record', url: '/app/?record=memo', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'New note', short_name: 'Note', url: '/app/?new=', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Add a task', short_name: 'Task', url: '/app/?view=tasks&add=1', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: "Speak today's journal", short_name: 'Journal', url: '/app/?record=journal', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // Offline, any /app/… address opens the app; the welcome page is cached as itself.
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
        // Keep the install small: rarely used code-colouring languages and non-latin font files are
        // fetched the first time they're needed (then cached for offline use) instead of up front.
        globIgnores: [
          'assets/{c,cpp,glsl,graphql,haml,haskell,java,jsonc,jsonl,julia,kotlin,latex,less,lua,mdx,mermaid,objective-c,php,postcss,pug,r,regexp,ruby,rust,sass,scala,scss,svelte,swift,vue,vue-html,wasm,wgsl,xml,github-light,jsx,tsx,native}-*.js',
          'assets/*{cyrillic,greek,vietnamese,latin-ext}*.woff2',
          // the welcome page's own fonts are only needed there
          'welcome/**',
        ],
        runtimeCaching: [{
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
          handler: 'CacheFirst',
          options: { cacheName: 'folio-extras', expiration: { maxEntries: 120 } },
        }],
      },
    }),
  ],
})
