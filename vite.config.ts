import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Folio',
        short_name: 'Folio',
        description: 'Private, offline notes. Keep outside, Notion inside.',
        theme_color: '#141416',
        background_color: '#141416',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        // Android (installed app): Folio appears in the share sheet, so a Folio link shared from WhatsApp etc. opens here.
        share_target: { action: '/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        // Long-press the installed icon (Android, Windows, macOS Chrome/Edge) for quick capture.
        // V5.7: installed Folio can be the "Open with" app for PDFs (Margins)
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }],
        shortcuts: [
          { name: 'Read a PDF', short_name: 'Margins', url: '/?view=margins', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Voice memo', short_name: 'Record', url: '/?record=memo', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'New note', short_name: 'Note', url: '/?new=', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Add a task', short_name: 'Task', url: '/?view=tasks&add=1', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: "Speak today's journal", short_name: 'Journal', url: '/?record=journal', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
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
        // Keep the install small: rarely used code-colouring languages and non-latin font files are
        // fetched the first time they're needed (then cached for offline use) instead of up front.
        globIgnores: [
          'assets/{c,cpp,glsl,graphql,haml,haskell,java,jsonc,jsonl,julia,kotlin,latex,less,lua,mdx,mermaid,objective-c,php,postcss,pug,r,regexp,ruby,rust,sass,scala,scss,svelte,swift,vue,vue-html,wasm,wgsl,xml,github-light,jsx,tsx,native}-*.js',
          'assets/*{cyrillic,greek,vietnamese,latin-ext}*.woff2',
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
