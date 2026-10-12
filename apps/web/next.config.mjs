/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Отдельный самодостаточный бандл: образ панели тогда не тащит
  // node_modules всего монорепозитория.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  env: {
    // Адрес бэкенда. В разработке — локальный NestJS, в проде задаётся окружением.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
  },
};

export default nextConfig;
