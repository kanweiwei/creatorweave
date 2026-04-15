/**
 * EdgeOne Pages middleware for SPA history fallback.
 *
 * Why:
 * - edgeone.json rewrites do not support SPA route rewrites.
 * - On direct refresh of client routes (e.g. /projects/xxx), Pages may return platform 404.
 *
 * Strategy:
 * - For browser HTML navigation requests (GET + Accept: text/html) without file extensions,
 *   internally rewrite to "/" so the SPA entry is served.
 * - Keep static assets / API / function routes untouched.
 */
export function middleware(context) {
  const { request, next, rewrite } = context
  const url = new URL(request.url)
  const { pathname } = url

  // Only handle document navigations.
  if (request.method !== 'GET') return next()

  const accept = request.headers.get('accept') || ''
  const wantsHtml = accept.includes('text/html')
  if (!wantsHtml) return next()

  // Keep known non-SPA routes unchanged.
  if (
    pathname === '/' ||
    pathname.includes('.') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/wasm/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/cloud-functions/') ||
    pathname.startsWith('/edge-functions/')
  ) {
    return next()
  }

  // SPA fallback for history routes.
  return rewrite('/')
}

export const config = {
  matcher: ['/:path*'],
}

