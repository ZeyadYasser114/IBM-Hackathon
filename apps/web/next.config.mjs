/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mergemind/api', '@mergemind/domain'],
};

export default nextConfig;
