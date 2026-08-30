import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const orthanc = env.VITE_ORTHANC_URL || 'http://localhost:8042';
  return {
    plugins: [react(), tailwindcss(), viteCommonjs() as unknown as PluginOption],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    optimizeDeps: {
      // Keep the loader's `new Worker(new URL(...))` + wasm asset URLs intact in dev,
      // and pre-bundle dicom-parser (UMD) so the loader's namespace import works.
      exclude: ['@cornerstonejs/dicom-image-loader', 'itk-wasm', '@itk-wasm/image-io'],
      include: ['dicom-parser'],
    },
    server: {
      port: 3100,
      fs: { allow: ['..', '../../..'] },
      proxy: {
        '/dicomweb': { target: orthanc, changeOrigin: true, rewrite: (p) => p.replace(/^\/dicomweb/, '/dicom-web') },
        '/orthanc': { target: orthanc, changeOrigin: true, rewrite: (p) => p.replace(/^\/orthanc/, '') },
      },
    },
    build: { target: 'esnext' },
    worker: { format: 'es' },
  };
});
