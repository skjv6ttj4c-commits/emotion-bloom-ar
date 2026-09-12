import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGitHubPages ? '/emotion-bloom-ar' : '',
  assetPrefix: isGitHubPages ? '/emotion-bloom-ar/' : undefined,
};

export default nextConfig;
