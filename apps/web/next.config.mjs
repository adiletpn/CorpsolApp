/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Адрес бэкенда. В разработке — локальный NestJS, в проде задаётся окружением.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
  },
};

export default nextConfig;
