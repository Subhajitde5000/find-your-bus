import type { NextConfig } from "next";

// The site is exported as static files (`npm run build` writes ./out). It has no server and
// makes no API calls: timetable data is bundled from src/data/kolkata-bus-data.json.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
};

export default nextConfig;
