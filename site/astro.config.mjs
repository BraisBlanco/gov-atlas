import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// GitHub Pages serves project sites below /<repository>/ rather than at the domain root.
// Keep this in one place so Astro assets, generated URLs and application links agree.
const githubPagesBase = '/gov-atlas';

// Both locales carry an explicit prefix: /es/ and /en/. Neither language is the
// "unmarked" default in the URL, because a bilingual publication where one language
// lives at the root and the other in a subdirectory reads as a translation of the first.
export default defineConfig({
  site: 'https://braisblanco.github.io',
  base: githubPagesBase,
  integrations: [react(), mdx()],
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      prefixDefaultLocale: true,
    },
  },
  redirects: {
    '/': `${githubPagesBase}/es/`,
  },
  build: {
    format: 'directory',
  },
});
