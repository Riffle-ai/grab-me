import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PORTS, SCRIPT_NAME, installRaycast, isTemporary, raycastScript } from './raycast.js'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'grab-me-raycast-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('raycastScript', () => {
  it('is a Raycast script command that arms on the first Metro port that has grab-me', () => {
    const script = raycastScript({ nodeDir: '/opt/n', cli: '/p/grab-me.js', ports: [8081, 8082] })
    expect(script).toMatch(/^#!\/bin\/bash/)
    expect(script).toContain('# @raycast.schemaVersion 1')
    expect(script).toContain('# @raycast.title Grab me Native')
    expect(script).toContain('# @raycast.mode silent')
    expect(script).toContain('export PATH=\'/opt/n\':/opt/homebrew/bin:/usr/local/bin:"$PATH"')
    expect(script).toContain("for port in 8081 8082; do\n  if node '/p/grab-me.js' arm")
    expect(script).toContain('no app with grab-me on Metro 8081–8082')
  })

  it('quotes paths with spaces and quotes', () => {
    const script = raycastScript({ nodeDir: "/My Apps/no'de", cli: '/c.js' })
    expect(script).toContain(`'/My Apps/no'\\''de'`)
    expect(script).toContain(`for port in ${PORTS.join(' ')}`)
  })

  it('runs: arms through the CLI, and says so when no port answers', () => {
    // A fake node on the script's PATH that succeeds for port 8082 only.
    const bin = join(dir, 'bin')
    execFileSync('mkdir', ['-p', bin])
    const fake = join(dir, 'fake-cli.sh')
    writeFileSync(join(bin, 'node'), '#!/bin/sh\nexec /bin/sh "$@"\n', { mode: 0o755 })
    writeFileSync(fake, '[ "$3" = "8082" ]\n', { mode: 0o755 })
    const script = join(dir, 'run.sh')
    writeFileSync(script, raycastScript({ nodeDir: bin, cli: fake, ports: [8081, 8082] }), {
      mode: 0o755,
    })
    expect(execFileSync(script, { encoding: 'utf8' })).toBe('grab-me armed (Metro :8082)\n')
    writeFileSync(fake, 'exit 1\n')
    expect(() => execFileSync(script, { stdio: 'pipe' })).toThrow()
  })
})

describe('installRaycast', () => {
  it('writes an executable script that points at this node and the real CLI path', () => {
    const cli = join(dir, 'grab-me.js')
    writeFileSync(cli, '')
    const file = installRaycast(join(dir, 'scripts'), cli)
    expect(file).toBe(join(dir, 'scripts', SCRIPT_NAME))
    expect(statSync(file).mode & 0o111).not.toBe(0)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain(`export PATH='${dirname(process.execPath)}'`)
    expect(text).toContain(cli.split('/').pop())
  })

  it('refuses to write without knowing where the CLI is (and never touches the real folder)', () => {
    expect(() => installRaycast(join(dir, 'never'), '')).toThrow('could not tell where')
    expect(() => installRaycast(undefined, undefined)).toThrow('could not tell where')
  })

  it('refuses a CLI that lives in npx’s temporary cache', () => {
    expect(isTemporary('/Users/a/.npm/_npx/1a2b/node_modules/.bin/grab-me')).toBe(true)
    expect(isTemporary('/p/node_modules/@riffle-ai/grab-me/dist/cli/grab-me.js')).toBe(false)
    const npx = join(dir, '_npx')
    execFileSync('mkdir', ['-p', npx])
    writeFileSync(join(npx, 'grab-me.js'), '')
    expect(() => installRaycast(join(dir, 'x'), join(npx, 'grab-me.js'))).toThrow(
      'not through a one-off npx download',
    )
  })
})
