/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Mongoose must run in Node.js runtime, not Edge
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;
