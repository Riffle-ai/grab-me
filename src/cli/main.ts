// The `grab-me` command line, with its connections passed in so it can be tested without an
// app: `raycast` writes the hotkey script, every other command talks to the app.
import { COMMANDS, USAGE, option, type Io } from './commands.js'
import type { Evaluator } from './session.js'

export interface Deps {
  io: Io
  env: Record<string, string | undefined>
  connect(port: string, device?: string): Promise<Evaluator & { close(): void }>
  raycast(dir?: string): string
}

export const RAYCAST_HELP = `In Raycast: Settings → Extensions → + → Add Script Directory → that folder, then select
"Grab me Native" and record a hotkey.`

export async function main(args: string[], deps: Deps): Promise<string> {
  const [command = ''] = args
  if (command === 'raycast') return `wrote ${deps.raycast(args[1])}\n${RAYCAST_HELP}`
  const run = COMMANDS[command]
  if (!run) throw new Error(USAGE)
  const port = option(args, 'port') ?? deps.env.RCT_METRO_PORT ?? '8081'
  const s = await deps.connect(port, option(args, 'device'))
  try {
    return await run(s, args, deps.io)
  } finally {
    s.close()
  }
}
