/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.adidas.com', // Allows assets.adidas.com, etc.
      },
      {
        protocol: 'https',
        hostname: '**.blkbrdshoemaker.com', // Allows assets.blkbrdshoemaker.com, etc.
      },
      {
        protocol: 'https',
        hostname: '**.nykaa.com', // Allows assets.nykaa.com, etc.
      },
      {
        protocol: 'https',
        hostname: '**.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.ajio.com', // Allows assets.ajio.com, etc.
      },
      {
        protocol: 'https',
        hostname: '**.converse.in',
      },
      {
        protocol: 'https',
        hostname: '**.tatacliq.com', // Allows img.tatacliq.com, etc.
      },
      {
        protocol: 'https',
        hostname: '**.flixcart.com', // Allows rukmini1.flixcart.com and rukminim2.flixcart.com
      },
      {
        protocol: 'https',
        hostname: '**.myntassets.com', // Allows assets.myntassets.com
      },
      {
        protocol: 'http',
        hostname: '**.myntassets.com', // Allows assets.myntassets.com
      },
      {
        protocol: 'https',
        hostname: '**.zara.net', // Allows static.zara.net
      },
      {
        protocol: 'https',
        hostname: '**.nike.com', // Allows static.nike.com
      },
      {
        protocol: 'https',
        hostname: '**.shoppersstop.com',
      },
    ],
  },
};

export default nextConfig;