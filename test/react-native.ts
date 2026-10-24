// The parts of 'react-native' that src/native uses, for unit tests in Node:
// `vi.mock('react-native', () => import('../../test/react-native.js'))`. Components render as
// host strings, which react-test-renderer keeps with their props.
type Style = Record<string, unknown> | null | undefined | false | Style[]

const flatten = (s: Style): Record<string, unknown> | undefined => {
  if (!s) return undefined
  if (Array.isArray(s)) return Object.assign({}, ...s.map(flatten))
  return { ...s }
}

export const StyleSheet = {
  flatten,
  create: <T>(styles: T) => styles,
  absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
}

export const window = { width: 402.4, height: 874 }
export const Dimensions = { get: () => window }
export const Platform = { OS: 'ios' }
export const scheme = { current: 'light' as string | null }
export const Appearance = { getColorScheme: () => scheme.current }

export const menu: Array<[string, () => void]> = []
export const DevSettings = {
  addMenuItem: (title: string, handler: () => void) => void menu.push([title, handler]),
}

export const modules: Record<string, unknown> = {}
export const TurboModuleRegistry = { get: (name: string) => modules[name] ?? null }

export const View = 'View'
export const Text = 'Text'
export const Pressable = 'Pressable'
