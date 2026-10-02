import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return []
    const api = process.env.API_URL ?? 'http://localhost:4000'
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]
  },
}

export default nextConfig
