import type { NextConfig } from "next";

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");
const supabaseIsLocal = ["127.0.0.1", "localhost", "[::1]"].includes(supabaseUrl.hostname);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol === "https:" ? "https" : "http",
        hostname: supabaseUrl.hostname,
        ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Next 16 refuses to optimise images from loopback IPs (SSRF guard). Local
    // Supabase serves them from 127.0.0.1, so allow it only when Supabase itself is
    // local; the optimiser still fetches only the remotePatterns host above.
    dangerouslyAllowLocalIP: supabaseIsLocal,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
