// The promise in the README: a production build ships none of grab-me. The marker strings
// are proven present in the package first, so their absence from a build means something.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// Overlay, Vite endpoints, Next resolver, and the core's snippet header (so a leak of the
// core without the overlay is caught too).
const MARKERS = ['data-grab-me', '__grab-me/', '/__nextjs_original-stack-frames', '<grab-me url="']

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}
const contains = (dir, ext = /\.(js|html)$/) =>
  files(dir).filter((f) => ext.test(f) && MARKERS.some((m) => readFileSync(f, 'utf8').includes(m)))

for (const m of MARKERS) {
  test(`marker ${m} is in the package, so searching a build for it is meaningful`, () => {
    const found = files('dist').find((f) => readFileSync(f, 'utf8').includes(m))
    assert.ok(found, `marker ${m} not in any dist file`)
  })
}

test('next build ships no grab-me to the browser', () => {
  execFileSync('pnpm', ['build'], { cwd: 'examples/next', stdio: 'inherit' })
  assert.deepEqual(contains('examples/next/.next/static'), [])
  assert.deepEqual(contains('examples/next/.next/server', /\.html$/), [], 'prerendered html')
})

test('vite build ships no grab-me at all', () => {
  execFileSync('pnpm', ['build'], { cwd: 'examples/vite', stdio: 'inherit' })
  assert.deepEqual(contains('examples/vite/dist'), [])
})
