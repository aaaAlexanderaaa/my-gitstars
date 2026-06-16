import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:4000'

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER

  return {
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
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
