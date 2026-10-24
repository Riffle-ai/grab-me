import { describe, expect, it } from 'vitest'
import { COMMANDS, NOT_MOUNTED, USAGE, job, option, type Io } from './commands.js'
import type { Evaluator } from './session.js'

// An app whose bridge answers each expression from a script, in order, and records them.
function app(...answers: unknown[]): Evaluator & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    eval: <T>(expression: string) => {
      asked.push(expression)
      return Promise.resolve(answers.shift() as T)
    },
  }
}

function clock(): Io & { notes: string[]; slept: number } {
  let t = 0
  const io = {
    notes: [] as string[],
    slept: 0,
    now: () => t,
    sleep: (ms: number) => {
      t += ms
      io.slept += ms
      return Promise.resolve()
    },
    note: (text: string) => void io.notes.push(text),
  }
  return io
}

describe('option', () => {
  it('reads the value after a flag', () => {
    expect(option(['screen', '--port', '8083'], 'port')).toBe('8083')
    expect(option(['screen'], 'port')).toBeUndefined()
  })
})

describe('job', () => {
  it('starts the call and polls until the job is done', async () => {
    const a = app(7, { done: false }, { done: true, text: '<grab-me/>' })
    const io = clock()
    await expect(job(a, 'screen()', 10_000, io)).resolves.toBe('<grab-me/>')
    expect(a.asked).toEqual([
      'globalThis.__GRAB_ME__ ? __GRAB_ME__.screen() : null',
      '__GRAB_ME__.poll(7)',
      '__GRAB_ME__.poll(7)',
    ])
    expect(io.slept).toBe(250)
  })

  it('says how to mount grab-me when the app has none', async () => {
    await expect(job(app(null), 'screen()', 1000, clock())).rejects.toThrow(NOT_MOUNTED)
  })

  it('passes on the app’s error', async () => {
    const a = app(1, { done: true, error: 'grab-me: nothing at 1, 2' })
    await expect(job(a, 'at(1, 2)', 1000, clock())).rejects.toThrow('nothing at 1, 2')
  })

  it('answers empty text for a job that finished without any', async () => {
    await expect(job(app(1, { done: true }), 'pick()', 1000, clock())).resolves.toBe('')
  })

  it('gives up after the timeout', async () => {
    const a = app(1, ...Array(10).fill(null))
    await expect(job(a, 'pick()', 500, clock())).rejects.toThrow('timed out after 0.5 s')
  })
})

describe('commands', () => {
  it('screen polls the screen job', async () => {
    const a = app(1, { done: true, text: 'screen' })
    await expect(COMMANDS.screen?.(a, ['screen'], clock())).resolves.toBe('screen')
    expect(a.asked[0]).toContain('__GRAB_ME__.screen()')
  })

  it('at sends the point and refuses one that is not a number', async () => {
    const a = app(1, { done: true, text: 'el' })
    await expect(COMMANDS.at?.(a, ['at', '10', '20.5'], clock())).resolves.toBe('el')
    expect(a.asked[0]).toContain('__GRAB_ME__.at(10, 20.5)')
    await expect(COMMANDS.at?.(app(), ['at', 'x'], clock())).rejects.toThrow(USAGE)
  })

  it('pick tells the user to tap, then waits for the tap', async () => {
    const io = clock()
    await expect(COMMANDS.pick?.(app(1, { done: true, text: 't' }), ['pick'], io)).resolves.toBe(
      't',
    )
    expect(io.notes).toEqual(['grab-me: tap an element in the app…'])
  })

  it('arm arms the picker, or says grab-me is missing', async () => {
    await expect(COMMANDS.arm?.(app(true), ['arm'], clock())).resolves.toBe('grab-me: armed')
    await expect(COMMANDS.arm?.(app(false), ['arm'], clock())).rejects.toThrow(NOT_MOUNTED)
  })

  it('last answers the last grab, nothing yet, or a missing grab-me', async () => {
    await expect(COMMANDS.last?.(app('<grab-me/>'), [], clock())).resolves.toBe('<grab-me/>')
    await expect(COMMANDS.last?.(app(null), [], clock())).rejects.toThrow('nothing grabbed yet')
    await expect(COMMANDS.last?.(app(undefined), [], clock())).rejects.toThrow(NOT_MOUNTED)
  })
})
