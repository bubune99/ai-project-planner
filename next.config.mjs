/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    turbopack: {
      root: '/mnt/c/Users/bubun/CascadeProjects/ai-project-planner',
    },
  },
}

export default nextConfig
