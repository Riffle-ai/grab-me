// CRAP per function: CC from ESLint's complexity rule, coverage from Vitest's istanbul JSON, restricted to the
// statements inside the function's lines. Exits 1 when any function in src/ scores over 6.
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

const LIMIT = 6

export function crapRows(functions, coverage, root) {
  const byFile = new Map(Object.entries(coverage).map(([abs, data]) => [relative(root, abs), data]))
  return functions.map((f) => {
    const data = byFile.get(f.file)
    const ids = Object.entries(data?.statementMap ?? {})
      .filter(([, loc]) => loc.start.line >= f.start && loc.start.line <= f.end)
      .map(([id]) => id)
    const cov = ids.length ? ids.filter((id) => data.s[id] > 0).length / ids.length : 0
    const crap = Math.round((f.cc ** 2 * (1 - cov) ** 3 + f.cc) * 100) / 100
    return { ...f, cov, crap }
  })
}

// ESLint's `complexity` rule reports only a function's head, so a second, local rule reports each
// function's full extent and name from the same typescript-eslint AST. Both run in one pass and
// are joined by containment: a complexity head lies inside exactly one innermost function extent.
const extent = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const named = (node) => {
      const { parent } = node
      const id = node.id ?? (parent.type === 'VariableDeclarator' ? parent.id : parent.key)
      return id?.name ?? '(anonymous)'
    }
    const visit = (node) => {
      const owner = node.parent
      const whole = ['MethodDefinition', 'Property'].includes(owner.type) ? owner : node
      context.report({ loc: whole.loc, message: named(node) })
    }
    return { FunctionDeclaration: visit, FunctionExpression: visit, ArrowFunctionExpression: visit }
  },
}

const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column)
const within = (outer, inner) =>
  before(outer, inner) &&
  before(
    { line: inner.line, column: inner.column },
    {
      line: outer.endLine,
      column: outer.endColumn,
    },
  )

export async function complexities(patterns, cwd = process.cwd()) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['**/*.test.ts', '**/*.test.tsx'] },
      {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: tseslint.parser },
        plugins: { crap: { rules: { extent } } },
        rules: { complexity: ['error', 0], 'crap/extent': 'error' },
      },
    ],
  })
  const results = await eslint.lintFiles(patterns)
  return results.flatMap((result) => {
    const messages = result.messages
    for (const m of messages) if (m.fatal) throw new Error(`${result.filePath}: ${m.message}`)
    const extents = messages.filter((m) => m.ruleId === 'crap/extent')
    return messages
      .filter((m) => m.ruleId === 'complexity')
      .map((m) => {
        const [innermost] = extents
          .filter((e) => within(e, m))
          .sort((x, y) => (before(x, y) ? 1 : -1))
        return {
          file: relative(cwd, result.filePath),
          name: innermost.message,
          cc: Number(/complexity of (\d+)/.exec(m.message)[1]),
          start: innermost.line,
          end: innermost.endLine,
        }
      })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const coverage = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'))
  const functions = await complexities(['src/**/*.{ts,tsx}'])
  const rows = crapRows(functions, coverage, process.cwd())
  for (const r of rows)
    console.log(
      `${r.crap > LIMIT ? 'FAIL' : 'ok  '} ${r.crap.toFixed(2).padStart(7)}  cc ${r.cc}  cov ${(r.cov * 100).toFixed(0)}%  ${r.file}:${r.start} ${r.name}`,
    )
  if (rows.some((r) => r.crap > LIMIT)) process.exit(1)
}
