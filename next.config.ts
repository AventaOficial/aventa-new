import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/**' }] : []),
      { protocol: 'https', hostname: 'placehold.co', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'aventaofertas.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
