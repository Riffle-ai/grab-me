// The handle a tool on the developer's machine reaches the app through: the `grab-me` CLI
// evaluates `globalThis.__GRAB_ME__` over the debugger connection Metro already proxies, so
// the app serves no endpoint. Calls start a job and answer its id; the CLI polls the job,
// which needs no promise support from the debugger.
export interface Job {
  done: boolean
  text?: string
  error?: string
}
export interface Bridge {
  version: 1
  /** Whether the app found a clipboard module to copy grabs to. */
  clipboard?: boolean
  /** The last snippet grabbed in the app, if any. */
  last: string | null
  /** Arms the picker, for a menu item or a gesture; nothing waits on it. */
  arm(): void
  /** Arms the picker; the job finishes with the snippet of the element the user taps. */
  pick(): number
  /** Reads every text and labelled control in view. */
  screen(): number
  /** Grabs the element at a point of the window, in points. */
  at(x: number, y: number): number
  poll(id: number): Job | null
}

export interface Handlers {
  arm(): void
  pick(): Promise<string>
  screen(): Promise<string>
  at(x: number, y: number): Promise<string>
}

const g = globalThis as { __GRAB_ME__?: Bridge }

export function install(handlers: Handlers): Bridge {
  const jobs = new Map<number, Job>()
  let next = 1
  const start = (run: () => Promise<string>) => {
    const id = next++
    const job: Job = { done: false }
    jobs.set(id, job)
    run().then(
      (text) => Object.assign(job, { done: true, text }),
      (e: unknown) =>
        Object.assign(job, { done: true, error: e instanceof Error ? e.message : String(e) }),
    )
    return id
  }
  const bridge: Bridge = {
    version: 1,
    last: g.__GRAB_ME__?.last ?? null,
    arm: () => handlers.arm(),
    pick: () => start(handlers.pick),
    screen: () => start(handlers.screen),
    at: (x, y) => start(() => handlers.at(x, y)),
    poll(id) {
      const job = jobs.get(id) ?? null
      if (job?.done) jobs.delete(id)
      return job
    },
  }
  g.__GRAB_ME__ = bridge
  return bridge
}
