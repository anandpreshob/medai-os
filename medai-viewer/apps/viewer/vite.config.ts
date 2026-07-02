import { defineConfig, Plugin, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve, dirname } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { readFileSync } from 'fs';

/**
 * Custom plugin to handle @icr/polyseg-wasm WASM imports
 * The polyseg-wasm package uses `import wasm from './ICRPolySeg.wasm'` which
 * Rollup can't handle directly. This plugin intercepts WASM imports and
 * returns a URL string that the Emscripten locateFile can use at runtime.
 */
function polySegWasmPlugin(): Plugin {
  const wasmVirtualId = '\0polyseg-wasm-url';

  return {
    name: 'polyseg-wasm-handler',
    enforce: 'pre',

    resolveId(id, importer) {
      // Handle relative WASM import from polyseg-wasm index.js
      if (id === './ICRPolySeg.wasm' && importer?.includes('@icr/polyseg-wasm')) {
        return wasmVirtualId;
      }
      // Handle any WASM file reference in polyseg-wasm paths
      if (id.includes('ICRPolySeg.wasm')) {
        return wasmVirtualId;
      }
      // Catch any .wasm imports from polyseg-wasm
      if (id.endsWith('.wasm') && importer?.includes('@icr/polyseg-wasm')) {
        return wasmVirtualId;
      }
      return null;
    },

    load(id) {
      // Return a module that exports the WASM URL as a string
      // The polyseg-wasm index.js uses this in its locateFile function
      if (id === wasmVirtualId) {
        return `export default '/wasm/ICRPolySeg.wasm';`;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env files based on mode
  const env = loadEnv(mode, process.cwd(), '');
  const monaiServerUrl = env.VITE_MONAI_SERVER_URL;
  if (!monaiServerUrl) {
    console.warn('VITE_MONAI_SERVER_URL not set in environment. Set it in .env.local');
  }

  return {
    plugins: [
      // Handle polyseg WASM imports before other plugins
      polySegWasmPlugin(),
      react(),
      wasm(),
      topLevelAwait(),
      // Copy WASM files to output directory for runtime loading
      viteStaticCopy({
        targets: [
          {
            // Use more flexible glob for pnpm's structure
            src: '../../node_modules/.pnpm/@icr+polyseg-wasm@*/node_modules/@icr/polyseg-wasm/dist/*.wasm',
            dest: 'wasm',
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      exclude: ['itk-wasm', '@itk-wasm/image-io', '@icr/polyseg-wasm'],
      include: ['@cornerstonejs/core', '@cornerstonejs/tools'],
    },
    server: {
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        // Proxy API requests to MONAI Label server to bypass CORS
        '/api/monai': {
          target: monaiServerUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/monai/, ''),
        },
        // Proxy /monai requests to MONAI Label server (for triage, report, etc.)
        '/monai': {
          target: monaiServerUrl,
          changeOrigin: true,
        },
        // Proxy DICOMweb requests to Orthanc (or MONAI Label proxy)
        // In development, route to MONAI Label server which proxies to Orthanc
        // Or directly to Orthanc at localhost:8042
        '/proxy/dicom': {
          target: env.VITE_ORTHANC_URL || 'http://localhost:8042',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/dicom/, '/dicom-web'),
        },
        // Proxy Orthanc native REST API for DICOM file retrieval
        '/proxy/orthanc': {
          target: env.VITE_ORTHANC_URL || 'http://localhost:8042',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/orthanc/, ''),
        },
      },
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: {
            cornerstone: ['@cornerstonejs/core', '@cornerstonejs/tools'],
          },
        },
      },
    },
    worker: {
      format: 'es',
      plugins: () => [
        polySegWasmPlugin(),
        wasm(),
        topLevelAwait(),
      ],
    },
    assetsInclude: ['**/*.wasm'],
  };
});
