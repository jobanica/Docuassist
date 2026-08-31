/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // A photo of a certificate travels through a Server Action. The browser
    // downscales to 1568px JPEG first, but three of those base64-encoded still
    // clear the 1MB default, and the failure looks like a broken button.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
