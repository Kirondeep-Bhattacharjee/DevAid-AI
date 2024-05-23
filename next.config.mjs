import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias['@aws-crypto/sha256-js'] = path.join(process.cwd(), 'node_modules/@aws-crypto/sha256-js/build/main');
    return config;
  },
};

export default nextConfig;
