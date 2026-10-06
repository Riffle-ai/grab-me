// grab-me's lookup: component name → file:line. Answers only under `next dev`; a production
// build keeps the route but drops the import and answers 404.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'development') {
    const { locate } = await import('@/dev/grab-me/locate')
    const names = new URL(request.url).searchParams.get('names')?.split(',').filter(Boolean) ?? []
    return Response.json(locate(names.slice(0, 50)))
  }
  return new Response(null, { status: 404 })
}
