import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { complexities, crapRows } from './crap.mjs'

// CRAP = CC² × (1 − cov)³ + CC. The expected numbers come from the formula by hand,
// independent of the script.
test('scores each function from its CC and its own statements’ coverage', () => {
  const functions = [
    { file: 'src/a.ts', name: 'full', cc: 6, start: 1, end: 10 },
    { file: 'src/a.ts', name: 'half', cc: 4, start: 11, end: 20 },
  ]
  const coverage = {
    '/repo/src/a.ts': {
      statementMap: {
        0: { start: { line: 2 } },
        1: { start: { line: 12 } },
        2: { start: { line: 13 } },
      },
      s: { 0: 1, 1: 1, 2: 0 },
    },
  }
  const rows = crapRows(functions, coverage, '/repo')
  assert.deepEqual(
    rows.map((r) => [r.name, r.crap]),
    [
      ['full', 6],
      ['half', 6],
    ],
  )
})

test('a function with no statement map counts as uncovered', () => {
  const rows = crapRows([{ file: 'src/b.ts', name: 'f', cc: 3, start: 1, end: 5 }], {}, '/repo')
  assert.equal(rows[0].crap, 12)
})

// Expected CCs are counted by hand: a function starts at 1, and each branch adds 1. For `branchy`
// that is the ternary and the `??`; ESLint's complexity rule counts `??` (checked against
// its output), so the expected value is 3.
test('complexities reports each TypeScript function with its own CC and full line range', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crap-'))
  writeFileSync(
    join(dir, 'f.ts'),
    [
      'function simple() {',
      '  return 1',
      '}',
      'const branchy = (a: number, b?: number) =>',
      '  (a ? 1 : b ?? 2)',
      '',
    ].join('\n'),
  )
  const found = await complexities(['*.ts'], dir)
  assert.deepEqual(found, [
    { file: 'f.ts', name: 'simple', cc: 1, start: 1, end: 3 },
    { file: 'f.ts', name: 'branchy', cc: 3, start: 4, end: 5 },
  ])
})
