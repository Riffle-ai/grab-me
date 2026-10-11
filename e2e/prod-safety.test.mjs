// The promise in the README: a production build ships none of grab-me. The marker strings
// are proven present in the package first, so their absence from a build means something.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const MARKERS = ['data-grab-me', '__grab-me/', '/__nextjs_original-stack-frames']

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}
const contains = (dir) =>
  files(dir).filter(
    (f) => /\.(js|html)$/.test(f) && MARKERS.some((m) => readFileSync(f, 'utf8').includes(m)),
  )

test('the markers are in the package, so searching a build for them is meaningful', () => {
  const dist = files('dist')
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  for (const m of MARKERS) assert.ok(dist.includes(m), `marker ${m} not in dist`)
})

test('next build ships no grab-me to the browser', () => {
  execFileSync('pnpm', ['build'], { cwd: 'examples/next', stdio: 'inherit' })
  assert.deepEqual(contains('examples/next/.next/static'), [])
})

test('vite build ships no grab-me at all', () => {
  execFileSync('pnpm', ['build'], { cwd: 'examples/vite', stdio: 'inherit' })
  assert.deepEqual(contains('examples/vite/dist'), [])
})
