/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Retailers commonly serve product media from separate CDN hostnames.
    // Direct rendering avoids proxying arbitrary third-party images through
    // the self-hosted MyCart server.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
