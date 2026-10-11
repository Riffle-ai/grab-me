// grab-me's lookup for Next: component name → file:line, plus the project root in a header
// so the client can make Next's frame paths relative. Answers only under `next dev`;
// production keeps the route but drops the import and answers 404.
export function createGrabMeRoute({ roots }: { roots?: string[] } = {}) {
  return async function GET(request: Request): Promise<Response> {
    if (process.env.NODE_ENV !== 'development') return new Response(null, { status: 404 })
    const { locate } = await import('../node/locate.js')
    const names = new URL(request.url).searchParams.get('names')?.split(',').filter(Boolean) ?? []
    const root = process.cwd()
    return Response.json(locate(names.slice(0, 50), { root, roots }), {
      headers: { 'x-grab-me-root': root },
    })
  }
}
