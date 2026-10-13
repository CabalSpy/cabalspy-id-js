import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
  },
  {
    // Separate build so the "use client" directive survives for React Server Components.
    entry: { react: 'src/react.tsx' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    external: ['react'],
    banner: { js: '"use client";' },
  },
]);
