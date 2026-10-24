// `grab-me raycast`: writes a Raycast script command that arms the picker, so a hotkey set in
// Raycast starts a grab without the dev menu. Raycast runs scripts without the shell's PATH, so
// the script sets one: the folder of the node that wrote it, then Homebrew's, whose stable links
// outlive a versioned node path after an upgrade.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const RAYCAST_DIR = join(homedir(), '.config', 'raycast', 'scripts')
export const SCRIPT_NAME = 'grab-me-arm.sh'
/** Metro's default port and the next few, which a second app or worktree takes. */
export const PORTS = [8081, 8082, 8083, 8084]

export interface ScriptOptions {
  /** The folder of the node that runs the CLI. */
  nodeDir: string
  cli: string
  ports?: number[]
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export function raycastScript({ nodeDir, cli, ports = PORTS }: ScriptOptions): string {
  return `#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Grab me Native
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🎯
# @raycast.packageName grab-me
# @raycast.description Arms the grab-me picker in the React Native app on the simulator or phone.

# Written by \`grab-me raycast\`. Each Metro may run on its own port: the first app with
# grab-me that answers is armed.
export PATH=${quote(nodeDir)}:/opt/homebrew/bin:/usr/local/bin:"$PATH"
for port in ${ports.join(' ')}; do
  if node ${quote(cli)} arm --port "$port" >/dev/null 2>&1; then
    echo "grab-me armed (Metro :$port)"
    exit 0
  fi
done
echo "grab-me: no app with grab-me on Metro ${ports[0]}–${ports.at(-1)}"
exit 1
`
}

/** A path under npx's cache is gone once the cache is cleaned; an installed package stays. */
export const isTemporary = (path: string) => /[/\\]_npx[/\\]/.test(path)

export function installRaycast(dir = RAYCAST_DIR, cliPath?: string): string {
  if (!cliPath) throw new Error('grab-me: could not tell where this CLI is installed')
  const cli = realpathSync(cliPath)
  if (isTemporary(cli))
    throw new Error(
      'run this from a project that has @riffle-ai/grab-me installed (pnpm add -D @riffle-ai/grab-me), not through a one-off npx download: the script must point at a lasting copy',
    )
  mkdirSync(dir, { recursive: true })
  const file = join(dir, SCRIPT_NAME)
  writeFileSync(file, raycastScript({ nodeDir: dirname(process.execPath), cli }), { mode: 0o755 })
  return file
}
