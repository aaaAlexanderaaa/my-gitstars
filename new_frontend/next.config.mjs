import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

// NEXT_PUBLIC_API_URL is the variable Next.js actually reads. REACT_APP_API_URL is
// kept as a fallback because older .env files (and docker-compose) still set it.
const backendUrl =
  process.env.NEXT_PUBLIC_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:4000'

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER

  return {
    // Type errors used to be ignored, which is how page.tsx and the details modal
    // ended up with two incompatible Repository shapes (and a README image loader
    // pinned to a hard-coded "main" branch). The tree is clean; keep it that way.
    eslint: {
      ignoreDuringBuilds: false,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    images: {
      unoptimized: true,
    },
    trailingSlash: true,
    ...(isDevelopmentServer
      ? {
          async rewrites() {
            return [
              {
                source: '/api/:path*',
                destination: `${backendUrl}/api/:path*`,
              },
              {
                source: '/auth/:path*',
                destination: `${backendUrl}/auth/:path*`,
              },
            ]
          },
        }
      : {
          output: 'export',
          distDir: 'out',
        }),
  }
}

export default nextConfig
