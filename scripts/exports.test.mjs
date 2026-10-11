import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

execFileSync('pnpm', ['build'], { stdio: 'inherit' })
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

test('every export in package.json points at built JS and its types', () => {
  for (const [path, target] of Object.entries(pkg.exports)) {
    assert.ok(existsSync(target.default), `${path} → ${target.default} missing`)
    assert.ok(existsSync(target.types), `${path} → ${target.types} missing`)
  }
})

test('client components keep their directive, so Next treats them as client boundaries', () => {
  for (const f of ['dist/overlay.js', 'dist/next/client.js'])
    assert.match(readFileSync(f, 'utf8'), /^['"]use client['"]/, f)
})

test('the Next wrapper reaches its client half only through a dynamic import', () => {
  const src = readFileSync('dist/next/index.js', 'utf8')
  assert.doesNotMatch(src, /^import .*client\.js/m)
  assert.match(src, /import\(['"]\.\/client\.js['"]\)/)
})
