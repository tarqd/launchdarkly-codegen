import { defineConfig } from 'vitepress';

// Served from GitHub Pages at https://tarqd.github.io/launchdarkly-codegen/.
export default defineConfig({
  title: 'launchtarqly-codegen',
  description: 'Type-safe wrappers around the official LaunchDarkly SDKs, generated from your flags.',
  base: '/launchdarkly-codegen/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'Targets', link: '/targets/' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Checking output in CI', link: '/guide/ci' },
          { text: 'Flag properties', link: '/guide/flag-properties' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI', link: '/reference/cli' },
          { text: 'Configuration', link: '/reference/configuration' },
        ],
      },
      {
        text: 'Targets',
        link: '/targets/',
        items: [
          { text: 'ts-server', link: '/targets/ts-server' },
          { text: 'go', link: '/targets/go' },
          { text: 'java', link: '/targets/java' },
          { text: 'dotnet', link: '/targets/dotnet' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/tarqd/launchdarkly-codegen' }],
    editLink: {
      pattern: 'https://github.com/tarqd/launchdarkly-codegen/edit/main/website/:path',
    },
  },
});
