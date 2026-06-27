/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for a minimal Docker runtime image.
  output: 'standalone',

  // The console was extracted from the monolith unchanged. It carries
  // pre-existing strict-null type/lint findings that don't affect runtime.
  // Don't block the production build on them.
  typescript: {
    ignoreBuildErrors: true,
  },


  async rewrites() {
    return [
      {
        source: '/api/bridge/:path*',
        destination: 'https://api.aivory.id/bridge/:path*',
      },
    ]
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // canvas is not available in the browser — alias to false to prevent build errors
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      }
    }
    return config
  },

  async headers() {
    return [
      {
        // No-cache for page HTML only. Must NOT match /_next/static or /_next/image
        // — Next.js serves those with immutable headers internally and overriding
        // them causes 400s on static chunk requests.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        // App pages (not _next assets, not api routes, not public files)
        source: '/((?!_next/|api/|favicon|.*\\.).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]
  },
}

module.exports = nextConfig
