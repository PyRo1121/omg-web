import { defineConfig } from 'oxlint';

export default defineConfig({
  ignorePatterns: [
    '**/node_modules/**',
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.continue/**',
    '.cursor/**',
    '.gemini/**',
    '.opencode/**',
    '.pi/**',
    '.roo/**',
    '.windsurf/**',
    'tools/oxlint/**',
    '**/dist/**',
    '**/.output/**',
    '**/coverage/**',
  ],
  jsPlugins: [
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
    {
      name: 'anti-slop-effect',
      specifier: './tools/oxlint/anti-slop/effect/index.ts',
    },
  ],
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  rules: {
    // `_tag` is the project-standard tagged-error discriminator (Effect/anti-slop);
    // `__pagefind` is the pagefind runtime's global window hook.
    'no-underscore-dangle': ['error', { allow: ['_tag', '__pagefind'] }],
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
    'anti-slop-effect/no-service-constructor-imports': 'error',
  },
});
