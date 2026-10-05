import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the development badge clear of the sidebar's account row. It is not shown in production.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
