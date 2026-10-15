import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      api: 'src/entries/api.ts',
      thesis: 'src/entries/thesis.ts',
      'trade-feed': 'src/entries/tradeFeed.ts',
      widget: 'src/widget.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    // Shared chunks for ESM and CJS: an error class from `cabalspy-id/api` is the
    // same class as the one from `cabalspy-id`, so instanceof works across entries.
    splitting: true,
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
