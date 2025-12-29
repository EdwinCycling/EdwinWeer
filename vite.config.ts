import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        strictPort: true,
        host: '0.0.0.0',
        watch: {
          ignored: ['**/.netlify/**'],
        },
        proxy: {
          '/.netlify/functions': {
            target: 'http://localhost:9998',
            changeOrigin: true,
            secure: false,
          },
        },
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icons/baro.ico', 'icons/baro-icon-192.png'],
          manifest: {
            name: 'Baro Weer',
            short_name: 'Baro',
            description: 'Jouw Persoonlijke Weerman',
            theme_color: '#13b6ec',
            icons: [
              {
                src: 'icons/baro-icon-192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'icons/baro-icon-512.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'icons/baro-icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {},
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              charts: ['recharts'],
              maps: ['leaflet', 'react-leaflet'],
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore']
            }
          }
        },
        chunkSizeWarningLimit: 1000
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
