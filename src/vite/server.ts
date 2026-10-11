// The dev server's half of grab-me for Vite: frames mapped through the module graph's own
// source maps, and component definitions from the project source.
import { originalPositionFor, TraceMap, type SourceMapInput } from '@jridgewell/trace-mapping'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ViteDevServer } from 'vite'
import type { Frame } from '../core/fiber.js'
import type { Site } from '../core/resolver.js'
import { locate } from '../node/locate.js'

export function toProject(root: string, moduleFile: string, source: string): string | null {
  const abs = isAbsolute(source) ? source : resolve(dirname(moduleFile), source)
  const file = relative(root, abs).split(sep).join('/')
  return file.startsWith('..') || file.includes('node_modules') ? null : file
}

type Mod = Awaited<
  ReturnType<ViteDevServer['environments']['client']['moduleGraph']['getModuleByUrl']>
>

const hasMappings = (map: unknown): map is { mappings: unknown } =>
  typeof map === 'object' && map !== null && 'mappings' in map

function mapped(mod: Mod) {
  const map = mod?.transformResult?.map
  return mod?.file && hasMappings(map) ? { file: mod.file, map: map as SourceMapInput } : null
}

async function mapOf(server: ViteDevServer, f: Frame) {
  if (!URL.canParse(f.file)) return null
  const mod = await server.environments.client.moduleGraph.getModuleByUrl(new URL(f.file).pathname)
  return mapped(mod)
}

/** The project site of one frame; null when it is a dependency, undefined when it cannot be mapped. */
async function site(server: ViteDevServer, f: Frame): Promise<Site | null | undefined> {
  const found = await mapOf(server, f)
  if (!found || !f.line1 || !f.column1) return undefined
  const pos = originalPositionFor(new TraceMap(found.map), { line: f.line1, column: f.column1 - 1 })
  const file = pos.source ? toProject(server.config.root, found.file, pos.source) : null
  return file ? { file, line: pos.line } : null
}

/**
 * The first frame inside the project. Dependencies alone answer null; frames the module graph
 * cannot map, with no project frame found, throw, so the grab warns instead of dropping `jsx:`.
 */
export async function firstSite(server: ViteDevServer, frames: Frame[]): Promise<Site | null> {
  const unmapped: string[] = []
  for (const f of frames) {
    const s = await site(server, f)
    if (s) return s
    if (s === undefined) unmapped.push(f.file)
  }
  if (unmapped.length) throw new Error(`no source map in Vite's module graph for ${unmapped[0]}`)
  return null
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(res: ServerResponse, data: unknown) {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}

type Next = (err?: unknown) => void

export const framesHandler =
  (server: ViteDevServer) => (req: IncomingMessage, res: ServerResponse, next: Next) =>
    body(req)
      .then((b) => firstSite(server, (b as { frames: Frame[] }).frames))
      .then((s) => send(res, s))
      .catch(next)

const namesOf = (url: string | undefined) =>
  new URL(url ?? '', 'http://x').searchParams.get('names')?.split(',').filter(Boolean) ?? []

export const locateHandler =
  (root: string, roots: string[] | undefined) =>
  (req: IncomingMessage, res: ServerResponse, next: Next) => {
    try {
      send(res, locate(namesOf(req.url).slice(0, 50), { root, roots }))
    } catch (e) {
      next(e)
    }
  }
