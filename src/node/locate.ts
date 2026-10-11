// Where a component is defined, by name. React 19 keeps a real JSX stack for only the first
// 10k elements per second of rendering, so on a long list most nodes carry a placeholder;
// a name is always there, and the repo answers where it lives. Node-only, dev-only.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['app', 'features', 'ui', 'lib', 'dev']
const DEFINES =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+([A-Z]\w*)|(?:const|let)\s+([A-Z]\w*)\s*[:=])/

export interface Definition {
  file: string
  line: number
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name))
      out.push(full)
  }
}

export function locate(names: string[]): Record<string, Definition[]> {
  const root = process.cwd()
  const wanted = new Set(names)
  const found: Record<string, Definition[]> = {}
  const files: string[] = []
  for (const r of ROOTS) {
    try {
      walk(join(root, r), files)
    } catch {
      // a root that does not exist in this checkout
    }
  }
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, i) => {
      const m = DEFINES.exec(text)
      const name = m?.[1] ?? m?.[2]
      if (name && wanted.has(name))
        (found[name] ??= []).push({ file: relative(root, file), line: i + 1 })
    })
  }
  return found
}
