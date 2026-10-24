import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { Session, choose, lanAddresses, targets, valueOf, type Target } from './session.js'

const target = (id: string, extra: Partial<Target> = {}): Target => ({
  id,
  title: `app (${id})`,
  webSocketDebuggerUrl: `ws://x/${id}`,
  ...extra,
})

describe('choose', () => {
  it('takes the newest React Native page', () => {
    const list = [target('a', { reactNative: {} }), target('b', { reactNative: {} }), target('c')]
    expect(choose(list).id).toBe('b')
  })

  it('falls back to any page when none says it is React Native', () => {
    expect(choose([target('a')]).id).toBe('a')
  })

  it('narrows to the named device, by name or title', () => {
    const list = [
      target('a', { reactNative: {}, deviceName: 'iPhone 17 Pro' }),
      target('b', { reactNative: {}, deviceName: 'Pixel 9' }),
    ]
    expect(choose(list, 'iphone').id).toBe('a')
    expect(choose([target('c', { title: 'app (Galaxy)' })], 'galaxy').id).toBe('c')
  })

  it('says what is missing', () => {
    expect(() => choose([])).toThrow('no app connected to Metro')
    expect(() => choose([target('a')], 'pixel')).toThrow('no app on a device matching "pixel"')
  })
})

describe('valueOf', () => {
  it('answers the value, or throws the app’s exception', () => {
    expect(valueOf({ result: { value: 3 } })).toBe(3)
    expect(() =>
      valueOf({ result: {}, exceptionDetails: { text: 'x', exception: { description: 'Boom' } } }),
    ).toThrow('Boom')
    expect(() => valueOf({ result: {}, exceptionDetails: { text: 'Uncaught' } })).toThrow(
      'Uncaught',
    )
  })
})

describe('targets', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists the debuggable pages Metro reports', async () => {
    const list = [target('a'), { ...target('b'), webSocketDebuggerUrl: '' }]
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(list))),
    )
    await expect(targets('8081')).resolves.toEqual([target('a')])
  })

  it('says when no Metro answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    )
    await expect(targets('9999')).rejects.toThrow('no Metro on port 9999')
  })
})

it('lists LAN addresses as plain IPv4 strings', () => {
  for (const a of lanAddresses()) expect(a).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
})

// A stand-in for Metro's inspector proxy: drops debuggers from an origin it does not accept,
// as Expo's server does, and evaluates by echoing the expression.
function proxy(accepts: string) {
  const wss = new WebSocketServer({ port: 0 })
  wss.on('connection', (ws: WebSocket, req) => {
    if (req.headers.origin !== accepts) return void ws.terminate()
    ws.on('message', (data) => {
      const { id, params } = JSON.parse(String(data)) as {
        id: number
        params: { expression: string }
      }
      const reply =
        params.expression === 'bad'
          ? { id, error: { message: 'no such method' } }
          : { id, result: { result: { value: `ran ${params.expression}` } } }
      ws.send(JSON.stringify(reply))
    })
  })
  const { port } = wss.address() as { port: number }
  return { wss, port, url: `ws://127.0.0.1:${port}/inspector/debug` }
}

describe('Session', () => {
  it('tries origins until the proxy keeps one, then evaluates', async () => {
    // 127.0.0.1 is dropped after the handshake; localhost is kept.
    const server = proxy('http://localhost:4321')
    const s = await Session.connect(server.url, '4321', ['127.0.0.1', 'localhost'])
    await expect(s.eval('1 + 1')).resolves.toBe('ran 1 + 1')
    await expect(s.send('Runtime.evaluate', { expression: 'bad' })).rejects.toThrow(
      'no such method',
    )
    s.close()
    server.wss.close()
  })

  it('names the origins it tried when the proxy keeps none', async () => {
    const server = proxy('http://nowhere:1')
    await expect(Session.connect(server.url, '4321', ['127.0.0.1'])).rejects.toThrow(
      'Metro refused the debugger connection from 127.0.0.1',
    )
    server.wss.close()
  })

  it('says it could not connect when nothing listens', async () => {
    await expect(Session.open('ws://127.0.0.1:1/x', 'http://localhost:1')).rejects.toThrow(
      'could not connect to ws://127.0.0.1:1/x',
    )
  })
})

it('skips an origin whose connection cannot even open', async () => {
  await expect(Session.connect('ws://127.0.0.1:1/x', '1', ['127.0.0.1'])).rejects.toThrow(
    'Metro refused the debugger connection from 127.0.0.1',
  )
})
