/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: { serverActions: { bodySizeLimit: '15mb' } },
};

if (process.env.NODE_ENV !== 'production') {
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    initOpenNextCloudflareForDev();
}

export default nextConfig;
