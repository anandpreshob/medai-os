import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MedaiItkLoader',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        '@medai/core',
        'itk-wasm',
        '@itk-wasm/image-io',
      ],
    },
  },
  optimizeDeps: {
    exclude: ['itk-wasm', '@itk-wasm/image-io'],
  },
});
