import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
