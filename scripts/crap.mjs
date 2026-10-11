// CRAP per function: CC from lizard, coverage from Vitest's istanbul JSON, restricted to the
// statements inside the function's lines. Exits 1 when any function in src/ scores over 6.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function lizard() {
  const csv = execFileSync('uvx', ['lizard', '--csv', 'src'], { encoding: 'utf8' })
  return csv
    .trim()
    .split('\n')
    .map((line) => line.split(','))
    .map((c) => ({
      cc: Number(c[1]),
      file: c[6].replaceAll('"', ''),
      name: c[7].replaceAll('"', ''),
      // long_name (c[8]) may hold commas, so the line range is read from the end.
      start: Number(c.at(-2)),
      end: Number(c.at(-1)),
    }))
    .filter((f) => !/\.test\.tsx?$/.test(f.file))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const coverage = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'))
  const rows = crapRows(lizard(), coverage, process.cwd())
  for (const r of rows)
    console.log(
      `${r.crap > LIMIT ? 'FAIL' : 'ok  '} ${r.crap.toFixed(2).padStart(7)}  cc ${r.cc}  cov ${(r.cov * 100).toFixed(0)}%  ${r.file}:${r.start} ${r.name}`,
    )
  if (rows.some((r) => r.crap > LIMIT)) process.exit(1)
}
