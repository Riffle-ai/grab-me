// Packs the package exactly as npm would ship it and reinstalls the examples from that
// tarball, so the examples (and the e2e and production-safety tests on them) exercise the
// published artifact, `files` and `exports` included, not the source tree.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'

const run = (args, cwd = '.') => execFileSync('pnpm', args, { cwd, stdio: 'inherit' })

rmSync('.pack', { recursive: true, force: true })
mkdirSync('.pack')
run(['build'])
run(['pack', '--pack-destination', '.pack'])
const [tgz] = readdirSync('.pack')
renameSync(`.pack/${tgz}`, '.pack/grab-me.tgz')
for (const example of ['next', 'vite'].filter((e) => existsSync(`examples/${e}`)))
  run(['install', '--force', '--no-frozen-lockfile'], `examples/${example}`)
