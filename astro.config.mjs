// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Secure Software Delivery Architecture',
      description: "A Platform Engineer's Guide to Trust, Identity, and Software Supply Chains.",
      // social: { github: 'https://github.com/you/your-repo' },
      customCss: ['./src/styles/custom.css'],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
      },
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
});
