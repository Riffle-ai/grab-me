// Hand-built fiber trees with the fields React Native's dev renderer keeps, for the native
// tests: host views (tag 5), host text (tag 6) and components, linked child/sibling/return.
import type { HostFiber } from '../src/native/host.js'

export const BUNDLE = 'http://localhost:8081/index.bundle?platform=ios&dev=true'

/** A JSX stack whose call site is bundle line `line`. */
export const stackAt = (line: number) =>
  Object.assign(new Error(), {
    stack: `Error\n    at jsxDEV (${BUNDLE}:1:1)\n    at Render (${BUNDLE}:${line}:1)`,
  })

interface Spec {
  tag?: number
  type?: unknown
  props?: Record<string, unknown> | string
  owner?: HostFiber
  line?: number
  box?: { x: number; y: number; width: number; height: number }
  children?: HostFiber[]
}

export function fiber({
  tag = 5,
  type = 'RCTView',
  props = {},
  owner,
  line,
  box,
  children = [],
}: Spec): HostFiber {
  const f = {
    tag,
    type,
    memoizedProps: props,
    child: children[0] ?? null,
    sibling: null,
    return: null,
    _debugOwner: owner ?? null,
    _debugStack: line ? stackAt(line) : null,
    stateNode: box ? { canonical: { publicInstance: { getBoundingClientRect: () => box } } } : null,
  } as unknown as HostFiber
  children.forEach((c, i) => {
    c.return = f
    c.sibling = children[i + 1] ?? null
  })
  return f
}

export const text = (s: string) => fiber({ tag: 6, type: null, props: s })

/** A function component's fiber. */
export const component = (
  name: string,
  line?: number,
  owner?: HostFiber,
  children: HostFiber[] = [],
) =>
  fiber({ tag: 0, type: Object.assign(() => null, { displayName: name }), line, owner, children })
