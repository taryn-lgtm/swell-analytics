import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // A stray ~/package-lock.json makes Next infer the workspace root as the
  // home directory, so Turbopack tries to crawl all of it and dev-server
  // startup hangs for minutes. Pin the root to this repo.
  turbopack: {
    root: __dirname,
  },
  // Filter state lives in the query string so every view is a shareable
  // link, but a route that reads searchParams is rendered on every request
  // and its `revalidate` is ignored. These rewrites map each query onto a
  // prerendered path, so the URLs are unchanged and the pages are static.
  // beforeFiles, because `/` and `/rankings` are themselves pages and an
  // afterFiles rewrite would never be consulted for them.
  async rewrites() {
    const year = "(?<season>\\d{4})";
    const fmt = "(?<format>final-five|cumulative)";
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "query", key: "all", value: "1" }], destination: "/home/all" },
        {
          source: "/rankings",
          has: [
            { type: "query", key: "season", value: year },
            { type: "query", key: "format", value: fmt },
          ],
          destination: "/rankings/:season/:format",
        },
        {
          source: "/rankings",
          has: [{ type: "query", key: "season", value: year }],
          destination: "/rankings/:season/final-five",
        },
        {
          source: "/rankings",
          has: [{ type: "query", key: "format", value: fmt }],
          destination: "/rankings/latest/:format",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
