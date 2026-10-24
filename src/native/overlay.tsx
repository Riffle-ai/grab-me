// The picker over a React Native app, development only. Arm it from the dev menu (Expo's
// through `grabMeMenuItem`, React Native's on its own) or from the `grab-me arm` / `pick`
// CLI, then drag to see what is under your finger and lift to copy it. The bar walks to the
// parent and back, adds more elements, or closes. Styled inline and in raw values: a dev tool laid over the product, not part of it.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DevSettings,
  Pressable,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
  type GestureResponderEvent,
} from 'react-native'
import { install } from './bridge.js'
import { format, formatScreen } from './format.js'
import { grab, screen, type NativeGrabOptions, type NativeGrabResult } from './grab.js'
import { boxOf, fiberOfInstance, hitTest, parentHost, tagOf, type Hit } from './host.js'
import { ownerName } from '../core/fiber.js'

export interface GrabMeProps extends NativeGrabOptions {
  children?: ReactNode
  /** Replaces the default copy-to-clipboard with your own handling. */
  onGrab?: (result: NativeGrabResult, text: string) => void | Promise<void>
}

const PINK = '#ff2d87'

// React Native's own clipboard module is deprecated in JS but still ships natively; the
// community and Expo modules take over when an app has them.
interface ClipboardModule {
  setString?: (s: string) => void
  setStringAsync?: (s: string) => Promise<unknown>
}
const expoClipboard = () =>
  (globalThis as { expo?: { modules?: Record<string, ClipboardModule> } }).expo?.modules
    ?.ExpoClipboard
const clipboard = () =>
  (TurboModuleRegistry.get<never>('Clipboard') ??
    TurboModuleRegistry.get<never>('RNCClipboard') ??
    expoClipboard()) as ClipboardModule | null | undefined
function copy(text: string): boolean {
  const mod = clipboard()
  if (mod?.setString) mod.setString(text)
  else if (mod?.setStringAsync) void mod.setStringAsync(text)
  return !!mod
}

const labelOf = (h: Hit) => {
  const o = h.fiber._debugOwner
  return `${o ? `${ownerName(o)} · ` : ''}${tagOf(h.fiber)} ${Math.round(h.box.w)}×${Math.round(h.box.h)}`
}

/** The view one level up from a trail's top, measured; null at the root. */
function parentHit(top: Hit | undefined): Hit | null {
  const parent = top ? parentHost(top.fiber) : null
  const box = parent && boxOf(parent)
  return parent && box ? { fiber: parent, box } : null
}

/** ↑ adds the parent to the trail, ↓ steps back down it (never below the element tapped). */
export function step(trail: Hit[], up: boolean): Hit[] {
  if (!up) return trail.length > 1 ? trail.slice(0, -1) : trail
  const parent = parentHit(trail.at(-1))
  return parent ? [...trail, parent] : trail
}

const tops = (set: Hit[][]) => set.map((trail) => trail.at(-1)).filter((h): h is Hit => !!h)

export function toastFor(hits: Hit[], copied: boolean): string {
  if (!copied) return 'No clipboard module; snippet logged'
  return `Copied ${hits.length > 1 ? `${hits.length} elements` : labelOf(hits[0] as Hit)}`
}

function remember(text: string) {
  const g = globalThis as { __GRAB_ME__?: { last: string | null } }
  if (g.__GRAB_ME__) g.__GRAB_ME__.last = text
}

// One picker per app; the dev menu item is added once and reaches whichever is mounted.
let arm: (() => void) | null = null
let menuAdded = false

export function NativeOverlay({ children, onGrab, ...opts }: GrabMeProps) {
  const root = useRef<View>(null)
  const [armed, setArmed] = useState(false)
  const [hover, setHover] = useState<Hit | null>(null)
  // Each picked element keeps its trail of parents for ↑ / ↓.
  const [picked, setPicked] = useState<Hit[][]>([])
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const waiting = useRef<Array<(text: string) => void>>([])
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    arm = () => setArmed(true)
    if (!menuAdded) {
      menuAdded = true
      DevSettings.addMenuItem('Grab me Native', () => arm?.())
    }
    const bridge = install({
      arm: () => setArmed(true),
      pick: () =>
        new Promise((done) => {
          waiting.current.push(done)
          setArmed(true)
        }),
      screen: async () => {
        const fiber = fiberOfInstance(root.current)
        if (!fiber) throw new Error('grab-me: the app root is not mounted')
        return formatScreen(await screen(fiber, optsRef.current))
      },
      at: async (x, y) => {
        const hit = await hitTest(root.current, x, y)
        if (!hit) throw new Error(`grab-me: nothing at ${x}, ${y}`)
        const text = format(await grab([hit], optsRef.current))
        remember(text)
        return text
      },
    })
    bridge.clipboard = !!clipboard()
    return () => {
      arm = null
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  async function deliver(set: Hit[][]) {
    const hits = tops(set)
    const result = await grab(hits, optsRef.current)
    const text = format(result)
    remember(text)
    for (const done of waiting.current.splice(0)) done(text)
    if (onGrab) return onGrab(result, text)
    console.log(text)
    setToast(toastFor(hits, copy(text)))
  }

  const at = (e: GestureResponderEvent) =>
    hitTest(root.current, e.nativeEvent.pageX, e.nativeEvent.pageY)

  async function move(e: GestureResponderEvent) {
    setHover(await at(e))
  }
  async function release(e: GestureResponderEvent) {
    const hit = await at(e)
    setHover(null)
    if (!hit) return
    const next = adding ? [...picked, [hit]] : [[hit]]
    setPicked(next)
    await deliver(next)
  }

  // The walk moves the element picked last.
  function walk(up: boolean) {
    const next = picked.map((trail, i) => (i === picked.length - 1 ? step(trail, up) : trail))
    setPicked(next)
    void deliver(next)
  }

  function close() {
    setArmed(false)
    setPicked([])
    setHover(null)
    setAdding(false)
  }

  const boxes = tops(picked)
  return (
    <>
      <View ref={root} collapsable={false} style={s.fill}>
        {children}
      </View>
      {armed && (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={move}
          onResponderMove={move}
          onResponderRelease={release}
        >
          {boxes.map((h, i) => (
            <View key={i} pointerEvents="none" style={[s.box, s.picked, place(h)]} />
          ))}
          {hover && (
            <>
              <View pointerEvents="none" style={[s.box, place(hover)]} />
              <Text pointerEvents="none" style={[s.label, labelAt(hover)]}>
                {labelOf(hover)}
              </Text>
            </>
          )}
          <View style={s.bar}>
            <Text style={s.barText} numberOfLines={1}>
              {boxes.length ? labelOf(boxes.at(-1) as Hit) : 'grab-me: drag, lift to copy'}
            </Text>
            <Button label="↑" onPress={() => walk(true)} disabled={!boxes.length} />
            <Button label="↓" onPress={() => walk(false)} disabled={!boxes.length} />
            <Button label="+" onPress={() => setAdding((a) => !a)} active={adding} />
            <Button label="✕" onPress={close} />
          </View>
        </View>
      )}
      {toast && (
        <View pointerEvents="none" style={s.toast}>
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
    </>
  )
}

function Button(p: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      style={[s.button, p.active && s.buttonOn, p.disabled && s.buttonOff]}
    >
      <Text style={s.buttonText}>{p.label}</Text>
    </Pressable>
  )
}

const place = (h: Hit) => ({ left: h.box.x, top: h.box.y, width: h.box.w, height: h.box.h })
const labelAt = (h: Hit) => ({
  left: h.box.x,
  top: h.box.y > 24 ? h.box.y - 22 : h.box.y + h.box.h + 2,
})

const s = StyleSheet.create({
  fill: { flex: 1 },
  box: { position: 'absolute', borderWidth: 1.5, borderColor: PINK, backgroundColor: '#ff2d8714' },
  picked: { borderStyle: 'dashed' },
  label: {
    position: 'absolute',
    backgroundColor: PINK,
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    paddingLeft: 12,
    borderRadius: 14,
    backgroundColor: '#111',
  },
  barText: { flex: 1, color: '#fff', fontSize: 12 },
  button: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
  },
  buttonOn: { backgroundColor: PINK },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16 },
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: PINK,
  },
  toastText: { color: '#fff', fontSize: 13 },
})
