// Resolver for `next dev`: frames through Next's dev-only /__nextjs_original-stack-frames,
// definitions and the project root through the route createGrabMeRoute() serves.
import type { Frame } from '../core/fiber.js'
import { ok, type Resolver, type Site } from '../core/resolver.js'

export interface NextResolverOptions {
  /** Where createGrabMeRoute() is mounted. */
  endpoint?: string
  /** Next's absolute dist dir (process.env.__NEXT_DIST_DIR, read where the app's bundler defines it). */
  distDir?: string
}

interface NextFrame {
  status: string
  reason?: string
  value?: { originalStackFrame?: { file?: string; line1?: number; ignored?: boolean } | null }
}

export function projectPath(file: string, root: string | null): string {
  const path = decodeURIComponent(file)
    .replace(/^file:\/\//, '')
    .replace(/^\[project\]\//, '')
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

// Turbopack's trace endpoint rejects http(s) URLs ("Unknown url scheme 'http'", Next 16.2.1)
// but traces the chunk's path on disk. This mirrors parseStack in
// next/dist/esm/server/lib/parse-stack.js, which Next's own overlay applies the same way:
// the /_next/static/... part of the URL path moves under distDir (absolute, from
// process.env.__NEXT_DIST_DIR, which Next defines for client bundles in dev). Anchoring on
// the path alone keeps a basePath working. Server frames arrive as file paths and pass through.
export function chunkOnDisk(file: string, distDir: string): string {
  try {
    const url = new URL(file)
    const m = /\/_next(\/static\/.+)/.exec(url.pathname)
    if (!m) return file
    return `file://${distDir.replace(/\\/g, '/').replace(/\/$/, '')}${m[1]}${url.search}`
  } catch {
    return file // not a URL: a file path Next already traces
  }
}

const isProjectFile = (file: string) => !file.includes('node_modules') && !file.startsWith('<')

function original(r: NextFrame) {
  const f = r.value?.originalStackFrame
  return r.status === 'fulfilled' && f?.file && !f.ignored ? { file: f.file, line: f.line1 } : null
}

function usable(r: NextFrame, root: string | null): Site | null {
  const f = original(r)
  const file = f && projectPath(f.file, root)
  return f && file && isProjectFile(file) ? { file, line: f.line ?? null } : null
}

function rejection(data: NextFrame[]): string | undefined {
  return data.find((r) => r.status === 'rejected')?.reason
}

function first(data: NextFrame[], root: string | null): Site | null {
  for (const r of data) {
    const site = usable(r, root)
    if (site) return site
  }
  const reason = rejection(data)
  if (reason !== undefined) throw new Error(reason)
  return null
}

export function nextResolver({
  endpoint = '/api/dev/grab-me',
  distDir,
}: NextResolverOptions = {}): Resolver {
  let root: Promise<string | null> | undefined
  const rootOf = () =>
    (root ??= fetch(`${endpoint}?names=`)
      .then((res) => ok(res, endpoint))
      .then((res) => res.headers.get('x-grab-me-root')))

  return {
    async frames(frames: Frame[], server: boolean) {
      if (!distDir) throw new Error('Next did not expose its dist dir')
      const [res, base] = await Promise.all([
        fetch('/__nextjs_original-stack-frames', {
          method: 'POST',
          body: JSON.stringify({
            frames: frames.map((f) => ({ ...f, file: chunkOnDisk(f.file, distDir) })),
            isServer: server,
            isEdgeServer: false,
            isAppDirectory: true,
          }),
        }).then((r) => ok(r, '/__nextjs_original-stack-frames')),
        rootOf(),
      ])
      return first((await res.json()) as NextFrame[], base)
    },
    async locate(names: string[]) {
      const url = `${endpoint}?names=${encodeURIComponent([...new Set(names)].join(','))}`
      return (await ok(await fetch(url), endpoint)).json()
    },
  }
}
