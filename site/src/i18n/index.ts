import en from './en.json';
import es from './es.json';

/**
 * Bilingual from the first commit, so nothing user-visible can be monolingual.
 *
 * Owned by the site track after M0. Adding a key means adding it to both files —
 * `assertParity` below fails the build if one language drifts behind the other, which is
 * how a half-translated release gets caught before it ships rather than by a reader.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, es };

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** Looks up a key, interpolating `{name}` placeholders. */
export function t(
  locale: Locale,
  key: string,
  values?: Record<string, string | number>,
): string {
  const template = DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Bound translator, so components take one `t` rather than a locale plus a function. */
export function translator(locale: Locale): (key: string, values?: Record<string, string | number>) => string {
  return (key, values) => t(locale, key, values);
}

export type Translate = ReturnType<typeof translator>;

/** Called at build time from the layout: a missing translation must break the build. */
export function assertParity(): void {
  const keys = new Set([...Object.keys(en), ...Object.keys(es)]);
  const missing: string[] = [];
  for (const key of keys) {
    for (const locale of LOCALES) {
      if (!(key in DICTIONARIES[locale])) missing.push(`${locale}: ${key}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Translation keys missing:\n  ${missing.join('\n  ')}`);
  }
}

export function localePath(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  return withBase(clean ? `${locale}/${clean}` : `${locale}/`);
}

/** Prefixes a root-relative path with Astro's deployment base. */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'es' ? 'en' : 'es';
}
