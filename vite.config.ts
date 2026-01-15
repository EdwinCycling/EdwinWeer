import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3010,
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
          registerType: 'prompt',
          includeAssets: ['icons/baro.ico', 'icons/baro-icon-192.png'],
          workbox: {
            cleanupOutdatedCaches: true,
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            navigateFallbackDenylist: [/^\/\.netlify\/functions/],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200]
                  }
                }
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200]
                  },
                }
              }
            ]
          },
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
            ],
            screenshots: [
              {
                src: 'landing/vakantie-weer-planner.png',
                sizes: '1280x720',
                type: 'image/png',
                form_factor: 'wide',
                label: 'Vakantie Weer Planner'
              },
              {
                src: 'landing/baro weerbericht.jpg',
                sizes: '1280x720',
                type: 'image/jpg',
                form_factor: 'wide',
                label: 'Persoonlijk Weerbericht'
              }
            ]
          }
        })
      ],
      define: {
        '__APP_VERSION__': JSON.stringify(packageJson.version),
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              charts: ['recharts', 'chart.js', 'react-chartjs-2'],
              maps: ['leaflet', 'react-leaflet'],
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
              pdf: ['jspdf', 'html-to-image']
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
