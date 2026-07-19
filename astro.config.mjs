// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import cloudflare from '@astrojs/cloudflare';

// Canonical origin. Drives the sitemap, canonical <link>, og:url, and the
// absolute URLs used for social-preview images. If the domain ever changes,
// update this and public/robots.txt together.
const site = 'https://securesoftwaredelivery.wckd14.xyz';
const repo = 'https://github.com/wckd14/ssda';
const description =
  "A platform engineer's guide to trust, identity, and software supply chains — the architecture behind how mature organizations ship software safely, from a developer's Git commit to a running production workload.";

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: 'Secure Software Delivery Architecture',
      description,
      favicon: '/favicon.svg',
      lastUpdated: true,
      social: [{ icon: 'github', label: 'GitHub', href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/` },
      customCss: ['./src/styles/custom.css'],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
      },
      head: [
        // --- Social preview (Open Graph + Twitter) ---------------------------
        // Starlight emits og:title/description/type/site_name and twitter:card
        // itself, but no image. Supply an absolute one so links unfurl with a
        // rich card everywhere.
        { tag: 'meta', attrs: { property: 'og:image', content: `${site}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content: 'Secure Software Delivery Architecture — the handbook',
          },
        },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${site}/og.png` } },
        // --- Authorship + icons ---------------------------------------------
        { tag: 'meta', attrs: { name: 'author', content: 'wckd14' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#000000' } },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        },
        {
          tag: 'link',
          attrs: { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        },
        // --- Structured data (schema.org) -----------------------------------
        // Helps search engines model the site as an authored reference work.
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Secure Software Delivery Architecture',
            alternateName: 'SSDA Handbook',
            url: site,
            description,
            inLanguage: 'en',
            author: { '@type': 'Person', name: 'wckd14', url: 'https://github.com/wckd14' },
            license: 'https://creativecommons.org/licenses/by/4.0/',
          }),
        },
      ],
      sidebar: [
        { label: 'Start Here', items: ['introduction'] },
        { label: 'Foundations', items: [{ autogenerate: { directory: 'foundations' } }] },
        { label: 'Source Trust', items: [{ autogenerate: { directory: 'source-trust' } }] },
        { label: 'Build Trust', items: [{ autogenerate: { directory: 'build-trust' } }] },
        { label: 'Artifact Trust', items: [{ autogenerate: { directory: 'artifact-trust' } }] },
        { label: 'Deployment Trust', items: [{ autogenerate: { directory: 'deployment-trust' } }] },
        { label: 'Runtime Trust', items: [{ autogenerate: { directory: 'runtime-trust' } }] },
        { label: 'Platform Security', items: [{ autogenerate: { directory: 'platform-security' } }] },
        { label: 'Operations', items: [{ autogenerate: { directory: 'operations' } }] },
        { label: 'Closing', items: ['enduring-principles'] },
      ],
    }),
  ],

  adapter: cloudflare(),
});
