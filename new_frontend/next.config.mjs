/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Configure for static export to be served by Express backend
  output: 'export',
  trailingSlash: true,
  distDir: 'out',
  // Remove API rewrites since everything runs on same server
}

export default nextConfig
