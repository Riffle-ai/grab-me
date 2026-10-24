// What each `grab-me` command asks of the app's `globalThis.__GRAB_ME__` (src/native/bridge.ts).
// Long work runs as a job in the app that is polled, which needs no promise support from the
// debugger.
import type { Evaluator } from './session.js'

interface Job {
  done: boolean
  text?: string
  error?: string
}

export const USAGE = `usage:
  grab-me screen          every text and labelled control in view, with where each is written
  grab-me pick            arm the picker in the app and print the element you tap
  grab-me arm             arm the picker and return at once (for a hotkey; grabs go to the clipboard)
  grab-me last            the last element grabbed in the app
  grab-me at X Y          the element at a point of the window, in points
  grab-me raycast [dir]   write a Raycast script command that runs \`grab-me arm\`

options: --port <metro port> (default 8081, or RCT_METRO_PORT), --device <name part>`

export const NOT_MOUNTED =
  "this app has no grab-me: wrap its root in <GrabMe> from '@riffle-ai/grab-me/native' (a development build)"

const POLL_MS = 250
const PICK_TIMEOUT_MS = 5 * 60_000
const WORK_TIMEOUT_MS = 30_000

export interface Io {
  sleep(ms: number): Promise<void>
  now(): number
  note(text: string): void
}

export function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

/** Starts `call` on the app's bridge and polls the job it answers until it is done. */
export async function job(s: Evaluator, call: string, timeout: number, io: Io): Promise<string> {
  const id = await s.eval<number | null>(`globalThis.__GRAB_ME__ ? __GRAB_ME__.${call} : null`)
  if (id == null) throw new Error(NOT_MOUNTED)
  const until = io.now() + timeout
  while (io.now() < until) {
    const text = finished(await s.eval<Job | null>(`__GRAB_ME__.poll(${id})`))
    if (text !== null) return text
    await io.sleep(POLL_MS)
  }
  throw new Error(`timed out after ${timeout / 1000} s`)
}

/** A finished job's text; null while it runs. */
function finished(j: Job | null): string | null {
  if (j?.error) throw new Error(j.error)
  return j?.done ? (j.text ?? '') : null
}

function point(args: string[]): string {
  const [x, y] = args.slice(1, 3).map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(USAGE)
  return `at(${x}, ${y})`
}

async function arm(s: Evaluator): Promise<string> {
  const ok = await s.eval<boolean>('!!globalThis.__GRAB_ME__ && (__GRAB_ME__.arm(), true)')
  if (!ok) throw new Error(NOT_MOUNTED)
  return 'grab-me: armed'
}

async function last(s: Evaluator): Promise<string> {
  const text = await s.eval<string | null | undefined>('globalThis.__GRAB_ME__?.last')
  if (text === undefined) throw new Error(NOT_MOUNTED)
  if (text === null) throw new Error('nothing grabbed yet')
  return text
}

type Command = (s: Evaluator, args: string[], io: Io) => Promise<string>

export const COMMANDS: Record<string, Command> = {
  screen: (s, _, io) => job(s, 'screen()', WORK_TIMEOUT_MS, io),
  at: async (s, args, io) => job(s, point(args), WORK_TIMEOUT_MS, io),
  pick: (s, _, io) => {
    io.note('grab-me: tap an element in the app…')
    return job(s, 'pick()', PICK_TIMEOUT_MS, io)
  },
  arm: (s) => arm(s),
  last: (s) => last(s),
}
