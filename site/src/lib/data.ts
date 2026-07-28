import type { CountrySummary, DerivedEntity, PolicyMatrixCell } from '../../../scripts/lib/derive.ts';
import type { Source } from '../../../data/schema/source.schema.ts';
import type { Taxonomy } from '../../../data/schema/taxonomy.schema.ts';
import type { Locale } from '../i18n/index.ts';

/**
 * Reads the build output of `npm run build:data`.
 *
 * Type-only imports reach across into scripts/ and data/ on purpose: the site consumes the
 * exact types the pipeline produces, so a change to a derived field is a type error here
 * rather than an undefined at runtime. They erase at compile time, so nothing crosses the
 * package boundary in the bundle.
 */

export type { CountrySummary, DerivedEntity, PolicyMatrixCell, Source, Taxonomy };

export interface Metadata {
  generated_at: string;
  as_of: string;
  target_total: number;
  countries_total: number;
  countries_covered: number;
  countries_uncovered: string[];
  target_missing: string[];
  cabinets_total: number;
  entities_total: number;
  ministries_total: number;
  sources_total: number;
  sources_by_tier: Record<string, number>;
  validation_warnings: number;
  license: string;
  schema_version: number;
}

export interface CountryPayload {
  summary: CountrySummary;
  entities: DerivedEntity[];
}

/*
 * The build output is imported, not read from disk.
 *
 * Reading with `fs` and a path relative to `import.meta.url` looks equivalent and is not:
 * after bundling, `import.meta.url` points at the emitted chunk rather than at this source
 * file, so the path silently resolves inside `dist/`. Importing the JSON hands resolution to
 * Vite, which inlines the data at build time — pages render fully without JavaScript, and a
 * missing file fails the build loudly instead of at render time.
 *
 * These imports require `npm run build:data` to have run. The repo-root `npm run build`
 * chains them in the right order; if you build the site alone, run it first.
 */
import metadataJson from '../../public/data/metadata.json';
import countriesJson from '../../public/data/countries.json';
import ministriesJson from '../../public/data/ministries.json';
import policyMatrixJson from '../../public/data/policy-matrix.json';
import taxonomyJson from '../../public/data/taxonomy.json';

const countryModules = import.meta.glob<{ default: CountryPayload }>(
  '../../public/data/countries/*.json',
  { eager: true },
);

const COUNTRY_PAYLOADS = new Map<string, CountryPayload>(
  Object.entries(countryModules).map(([path, module]) => [
    path.replace(/^.*\/([A-Z]{2})\.json$/, '$1'),
    module.default,
  ]),
);

export const loadMetadata = async (): Promise<Metadata> => metadataJson as Metadata;
export const loadCountries = async (): Promise<CountrySummary[]> =>
  countriesJson as unknown as CountrySummary[];
export const loadMinistries = async (): Promise<DerivedEntity[]> =>
  ministriesJson as unknown as DerivedEntity[];
export const loadPolicyMatrix = async (): Promise<PolicyMatrixCell[]> =>
  policyMatrixJson as unknown as PolicyMatrixCell[];
export const loadTaxonomy = async (): Promise<Taxonomy> => taxonomyJson as unknown as Taxonomy;

export async function loadCountry(iso2: string): Promise<CountryPayload> {
  const payload = COUNTRY_PAYLOADS.get(iso2);
  if (!payload) {
    throw new Error(
      `No payload for ${iso2}. Either the country is not curated yet, or \`npm run build:data\` has not run.`,
    );
  }
  return payload;
}

/**
 * ISO2 codes with published data, for `getStaticPaths`.
 *
 * Cross-checked against `metadata.countries_covered`, which the same `build:data` run
 * wrote. The two can only disagree in one situation, and it is a baffling one to debug: a
 * dev server that was already running when `build:data` added a country. Vite re-reads the
 * plain JSON imports above, but the eager `import.meta.glob` keeps the file list it
 * resolved at startup — so the index page lists every country while `getStaticPaths` still
 * knows only the ones that existed then, and the rest 404 with no explanation. One country
 * works, the others are "broken", and nothing in the code is wrong.
 *
 * At build time both sides come from the same fresh write and always agree, so this costs
 * nothing there and turns the dev case into an error that says what to do.
 */
export function coveredCountries(): string[] {
  const codes = [...COUNTRY_PAYLOADS.keys()].sort();
  const expected = (metadataJson as Metadata).countries_covered;
  if (codes.length !== expected) {
    throw new Error(
      `Stale route data: ${codes.length} per-country payload(s) (${codes.join(', ') || 'none'}) ` +
        `but metadata.json reports ${expected} covered countries. Restart the dev server — ` +
        `countries added by a later \`npm run build:data\` have no route until you do.`,
    );
  }
  return codes;
}

/** Country name in the reader's language. The original always appears alongside it. */
export function countryName(country: Pick<CountrySummary, 'name_en' | 'name_es'>, locale: Locale): string {
  return locale === 'es' ? country.name_es : country.name_en;
}

/** Ministry name in the reader's language, plus whether that name is the government's own. */
export function ministryName(
  entity: Pick<DerivedEntity, 'name_en' | 'name_es' | 'name_en_provenance' | 'name_es_provenance'>,
  locale: Locale,
): { name: string; isOfficial: boolean } {
  return locale === 'es'
    ? { name: entity.name_es, isOfficial: entity.name_es_provenance === 'official' }
    : { name: entity.name_en, isOfficial: entity.name_en_provenance === 'official' };
}

/**
 * The citations a chart must show: every source actually behind the values drawn, with
 * legal instruments first, deduplicated by URL.
 *
 * Charts call this rather than hand-picking a source, so a chart cannot end up displaying a
 * citation that supports something other than what it drew.
 */
export function chartSources(...groups: readonly Source[][]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const group of groups) {
    for (const source of group) {
      if (!byUrl.has(source.url)) byUrl.set(source.url, source);
    }
  }
  return [...byUrl.values()].sort((a, b) => a.tier - b.tier || a.publisher.localeCompare(b.publisher));
}

export function areaLabel(taxonomy: Taxonomy, id: string, locale: Locale): string {
  const area = taxonomy.policyAreas.find((candidate) => candidate.id === id);
  if (!area) return id;
  return locale === 'es' ? area.label_es : area.label_en;
}

export function exclusionLabel(taxonomy: Taxonomy, id: string | null, locale: Locale): string | null {
  if (!id) return null;
  const reason = taxonomy.exclusionReasons.find((candidate) => candidate.id === id);
  if (!reason) return id;
  return locale === 'es' ? reason.label_es : reason.label_en;
}

export function formatNumber(value: number, locale: Locale, decimals = 0): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
