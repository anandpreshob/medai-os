import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const orthanc = env.VITE_ORTHANC_URL || 'http://localhost:8042';
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 3100,
      proxy: {
        '/dicomweb': { target: orthanc, changeOrigin: true, rewrite: (p) => p.replace(/^\/dicomweb/, '/dicom-web') },
        '/orthanc': { target: orthanc, changeOrigin: true, rewrite: (p) => p.replace(/^\/orthanc/, '') },
      },
    },
    build: { target: 'esnext' },
    worker: { format: 'es' },
  };
});
