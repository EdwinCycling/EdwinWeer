import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        strictPort: true,
        host: '0.0.0.0',
      },
  plugins: [react()],
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
