import js from '@eslint/js'
import hooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.pack',
      'coverage',
      'test/legacy',
      'examples/*/.next',
      'examples/*/dist',
      'examples/*/node_modules',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  hooks.configs.flat.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
)
