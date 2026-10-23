import type { NextConfig } from "next";

const backendOrigin = process.env.USER_INPUT_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // The browser calls relative /api URLs. Next forwards them to FastAPI server-side.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
