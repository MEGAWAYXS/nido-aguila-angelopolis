/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // En GitHub Pages el sitio vive en /<repo>/; el workflow define VITE_BASE_PATH.
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        // La app avisa de versiones nuevas (components/UpdateBanner.tsx) en vez de quedarse con la vieja.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icon-192.png', 'apple-touch-icon.png', 'escudo.png'],
        manifest: {
          name: 'Nido Águila Angelópolis',
          short_name: 'Nido Águila',
          description: 'Gestión de categorías, jugadores, asistencias y convocatorias.',
          lang: 'es-MX',
          theme_color: '#07133D',
          background_color: '#F4F6FA',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Solo se guarda en caché la interfaz. Los datos de Supabase nunca se cachean.
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          // La versión nueva se activa al descargarse; UpdateBanner avisa para recargar.
          skipWaiting: true,
          clientsClaim: true,
          navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/storage/],
          runtimeCaching: [],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'] },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
