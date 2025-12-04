import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents: true, // Disabled to allow dynamic routes
  cacheLife: {
    default: { stale: 60, revalidate: 60 },
  },
};

export default nextConfig;
