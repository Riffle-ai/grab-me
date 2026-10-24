#!/usr/bin/env node
// grab-me for React Native, from the developer's machine: reads a running app through the
// debugger connection Metro already serves, so neither the app nor the project serves anything
// for it. The app side is `GrabMe` from '@riffle-ai/grab-me/native'. `grab-me` alone prints
// the commands.
import { main } from './main.js'
import { installRaycast } from './raycast.js'
import { Session, choose, targets } from './session.js'

main(process.argv.slice(2), {
  io: {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    note: (text) => process.stderr.write(`${text}\n`),
  },
  env: process.env,
  connect: async (port, device) =>
    Session.connect(choose(await targets(port), device).webSocketDebuggerUrl, port),
  raycast: (dir) => installRaycast(dir, process.argv[1]),
}).then(
  (text) => process.stdout.write(`${text}\n`),
  (e: unknown) => {
    process.stderr.write(`grab-me: ${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  },
)
