import js from '@eslint/js'
import globals from 'globals'
import eslintReact from '@eslint-react/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    ...eslintReact.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      ...eslintReact.configs.recommended.rules,
      // Defer hook rules to the canonical eslint-plugin-react-hooks so they
      // aren't reported twice (the existing inline `react-hooks/*` disables stay
      // authoritative). disable-conflict misses a couple, so turn the duplicates
      // off explicitly.
      ...(eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'].rules || {}),
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      // Stylistic / React 19 modernization suggestions left off in this eslint 10
      // upgrade — adopting them would mean refactoring the app (Context provider
      // syntax, `use` vs useContext, list keys, lazy useState). Enable as a
      // follow-up; the rest of @eslint-react's correctness rules stay on.
      '@eslint-react/no-context-provider': 'off',
      '@eslint-react/no-use-context': 'off',
      '@eslint-react/no-array-index-key': 'off',
      '@eslint-react/use-state': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]
