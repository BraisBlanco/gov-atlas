import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// Both locales carry an explicit prefix: /es/ and /en/. Neither language is the
// "unmarked" default in the URL, because a bilingual publication where one language
// lives at the root and the other in a subdirectory reads as a translation of the first.
export default defineConfig({
  site: 'https://gov-atlas.example.org',
  integrations: [react(), mdx()],
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      prefixDefaultLocale: true,
    },
  },
  redirects: {
    '/': '/es/',
  },
  build: {
    format: 'directory',
  },
});
