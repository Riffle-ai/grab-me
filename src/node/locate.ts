// Where a component is defined, by name. React 19 keeps a real JSX stack for only the first
// 10k elements per second of rendering, so on a long list most nodes carry a placeholder;
// a name is always there, and the source answers where it lives. Node-only, dev-only.
import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Definition } from '../core/resolver.js'

export interface LocateOptions {
  /** The project root; paths are answered relative to it. */
  root: string
  /** Folders under root to search; the whole project when absent. */
  roots?: string[]
}

const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', 'out'])
const SOURCE = /\.[jt]sx?$/
const NOT_SOURCE = /\.(test|spec|stories)\.[jt]sx?$|\.d\.ts$/
const DEFINES =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+([A-Z]\w*)|(?:const|let)\s+([A-Z]\w*)\s*[:=])/

const skipped = (name: string) => SKIP.has(name) || name.startsWith('.')
const isSource = (entry: Dirent) =>
  entry.isFile() && SOURCE.test(entry.name) && !NOT_SOURCE.test(entry.name)

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !skipped(entry.name)) walk(full, out)
    else if (isSource(entry)) out.push(full)
  }
}

// Files of one root are sorted; the roots keep the order they were given in.
function files(root: string, roots: string[]): string[] {
  const out: string[] = []
  for (const r of roots) {
    if (!existsSync(join(root, r)))
      throw new Error(`grab-me: root "${r}" does not exist under ${root}`)
    const own: string[] = []
    walk(join(root, r), own)
    out.push(...own.sort())
  }
  return out
}

// The component name a line defines, if it defines one.
const definedName = (text: string) => {
  const m = DEFINES.exec(text)
  return m?.[1] ?? m?.[2]
}

export function locate(
  names: string[],
  { root, roots = ['.'] }: LocateOptions,
): Record<string, Definition[]> {
  const wanted = new Set(names)
  const found: Record<string, Definition[]> = {}
  for (const file of files(root, roots)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        const name = definedName(text)
        if (name && wanted.has(name))
          (found[name] ??= []).push({
            file: relative(root, file).split(sep).join('/'),
            line: i + 1,
          })
      })
  }
  return found
}
