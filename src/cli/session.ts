// A Chrome DevTools Protocol session with a React Native app, through the inspector proxy
// Metro serves for React Native DevTools. Metro lets several debuggers attach to one app, so
// this runs beside an open DevTools window.
import { networkInterfaces } from 'node:os'
import WebSocket from 'ws'

export interface Target {
  id: string
  title: string
  deviceName?: string
  webSocketDebuggerUrl: string
  reactNative?: { logicalDeviceId?: string; capabilities?: Record<string, unknown> }
}

export interface Evaluator {
  eval<T>(expression: string): Promise<T>
}

interface Reply {
  id?: number
  result?: unknown
  error?: { message: string }
}
interface Evaluated<T> {
  result: { value?: T }
  exceptionDetails?: { text: string; exception?: { description?: string } }
}

const ALIVE_MS = 3000

export const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)

export async function targets(port: string): Promise<Target[]> {
  const res = await fetch(`http://localhost:${port}/json/list`).catch(() => null)
  if (!res?.ok) throw new Error(`no Metro on port ${port} (start the app's dev server first)`)
  return ((await res.json()) as Target[]).filter((t) => t.webSocketDebuggerUrl)
}

const onDevice = (t: Target, device: string) =>
  (t.deviceName ?? t.title).toLowerCase().includes(device.toLowerCase())

/** The newest React Native page, of the chosen device when one is named: the app's runtime. */
export function choose(list: Target[], device?: string): Target {
  const apps = list.filter((t) => t.reactNative)
  const pool = (apps.length ? apps : list).filter((t) => !device || onDevice(t, device))
  const t = pool.at(-1)
  if (t) return t
  throw new Error(device ? `no app on a device matching "${device}"` : 'no app connected to Metro')
}

export function valueOf<T>(r: Evaluated<T>): T {
  const failed = r.exceptionDetails
  if (failed) throw new Error(failed.exception?.description ?? failed.text)
  return r.result.value as T
}

export class Session implements Evaluator {
  // Set in the constructor rather than as field initializers, which ESLint's complexity rule
  // counts as functions of their own (and scripts/crap.mjs cannot place).
  private next: number
  private waiting: Map<number, (msg: Reply) => void>
  private constructor(private ws: WebSocket) {
    this.next = 1
    this.waiting = new Map()
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as Reply
      if (msg.id) this.waiting.get(msg.id)?.(msg)
    })
  }

  static open(url: string, origin: string): Promise<Session> {
    const ws = new WebSocket(url, { origin })
    return new Promise((ok, fail) => {
      ws.on('open', () => ok(new Session(ws)))
      ws.on('error', (e) => fail(new Error(`could not connect to ${url}: ${e.message}`)))
      ws.on('close', () => fail(new Error(`${url} closed the connection`)))
    })
  }

  /**
   * Metro takes debuggers from a localhost origin only, and Expo's server also wants the
   * origin's host to be its own base URL (127.0.0.1 or a LAN address, by how it started).
   * A refused origin is accepted and then dropped, so each is proven with a round trip.
   */
  static async connect(url: string, port: string, hosts = defaultHosts()): Promise<Session> {
    for (const host of hosts) {
      const s = await Session.open(url, `http://${host}:${port}`).catch(() => null)
      if (s && (await s.alive())) return s
      s?.close()
    }
    throw new Error(`Metro refused the debugger connection from ${hosts.join(', ')}`)
  }

  private async alive(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const ok = await Promise.race([
      this.eval('1').then(() => true),
      new Promise<boolean>((r) => {
        this.ws.once('close', () => r(false))
        timer = setTimeout(() => r(false), ALIVE_MS)
      }),
    ])
    // A pending timer would hold the process open after the command is done.
    clearTimeout(timer)
    return ok
  }

  send(method: string, params: object): Promise<unknown> {
    const id = this.next++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((ok, fail) =>
      this.waiting.set(id, (msg) => {
        this.waiting.delete(id)
        if (msg.error) fail(new Error(msg.error.message))
        else ok(msg.result)
      }),
    )
  }

  async eval<T>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true })
    return valueOf(r as Evaluated<T>)
  }

  close() {
    this.ws.close()
  }
}

const defaultHosts = () => ['127.0.0.1', 'localhost', ...lanAddresses()]
