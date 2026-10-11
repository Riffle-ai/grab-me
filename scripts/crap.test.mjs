import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crapRows } from './crap.mjs'

// CRAP = CC² × (1 − cov)³ + CC. The expected numbers come from the formula by hand,
// independent of the script.
test('scores each function from lizard CC and its own statements’ coverage', () => {
  const lizard = [
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
  const rows = crapRows(lizard, coverage, '/repo')
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
