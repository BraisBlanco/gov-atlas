import type { CountrySummary, DerivedEntity, Source } from '../lib/data.ts';

/**
 * SYNTHETIC DATA. Not real. Never import this outside a story, a test, or local layout work.
 *
 * It exists so the chart and site tracks can build against 12 countries on day one instead
 * of waiting for curation to finish. Every country here is invented, the "sources" point at
 * example.org, and the names are transparently fake — because a plausible-looking fake
 * dataset that leaks into a page is far worse than an obviously fake one.
 *
 * When your component works against this, check it once against the real
 * site/public/data/countries.json before handing off: the real data has one country, long
 * accented names, and a ministry list four times the length of anything here.
 */

const FIXTURE_SOURCE: Source = {
  id: 'fixture-source',
  tier: 1,
  type: 'official_gazette',
  publisher: 'FIXTURE — not a real publisher',
  title: 'FIXTURE — synthetic decree used for layout work only',
  url: 'https://example.org/fixture/decree',
  archive_url: 'https://web.archive.org/web/20260101000000/https://example.org/fixture/decree',
  lang: 'en',
  published: '2024-01-01',
  accessed: '2026-01-01',
  quote: 'This is synthetic fixture text and supports no factual claim whatsoever.',
  note: 'Fixture only.',
};

interface Seed {
  iso2: string;
  iso3: string;
  name: string;
  ministries: number;
  extraSeats: number;
  population: number;
  grade: 'A' | 'B' | 'C';
}

// Ministry counts here are in a realistic range so layouts get realistic bar lengths, but
// no figure corresponds to any actual government.
const SEEDS: Seed[] = [
  { iso2: 'AA', iso3: 'AAA', name: 'Fixtureland', ministries: 22, extraSeats: 1, population: 48_000_000, grade: 'A' },
  { iso2: 'AB', iso3: 'ABB', name: 'Exampleia', ministries: 15, extraSeats: 1, population: 83_000_000, grade: 'A' },
  { iso2: 'AC', iso3: 'ACC', name: 'Placeholderia', ministries: 18, extraSeats: 2, population: 67_000_000, grade: 'B' },
  { iso2: 'AD', iso3: 'ADD', name: 'Sampleland', ministries: 12, extraSeats: 1, population: 10_500_000, grade: 'A' },
  { iso2: 'AE', iso3: 'AEE', name: 'Mockovia', ministries: 25, extraSeats: 3, population: 38_000_000, grade: 'C' },
  { iso2: 'AF', iso3: 'AFF', name: 'Dummystan', ministries: 9, extraSeats: 1, population: 1_900_000, grade: 'B' },
  { iso2: 'AG', iso3: 'AGG', name: 'Stubbia', ministries: 20, extraSeats: 1, population: 59_000_000, grade: 'A' },
  { iso2: 'AH', iso3: 'AHH', name: 'Testrovina', ministries: 14, extraSeats: 2, population: 5_800_000, grade: 'B' },
  { iso2: 'AI', iso3: 'AII', name: 'Faketonia', ministries: 11, extraSeats: 1, population: 1_300_000, grade: 'A' },
  { iso2: 'AJ', iso3: 'AJJ', name: 'Notrealia', ministries: 17, extraSeats: 1, population: 10_200_000, grade: 'B' },
  { iso2: 'AK', iso3: 'AKK', name: 'Lorem Republic', ministries: 23, extraSeats: 2, population: 21_000_000, grade: 'C' },
  { iso2: 'AL', iso3: 'ALL', name: 'Ipsumgrad', ministries: 16, extraSeats: 1, population: 5_400_000, grade: 'A' },
];

const AREAS = [
  'foreign_affairs',
  'defence',
  'interior',
  'justice',
  'finance',
  'health',
  'education',
  'labour',
  'agriculture',
  'environment',
  'climate',
  'digital',
  'transport',
  'culture',
  'equality',
  'housing',
];

export const FIXTURE_COUNTRIES: CountrySummary[] = SEEDS.map((seed) => ({
  iso2: seed.iso2,
  iso3: seed.iso3,
  name_en: `${seed.name} (fixture)`,
  name_es: `${seed.name} (ficticio)`,
  name_original: seed.name,
  continent: 'europe',
  region: 'western_europe',
  government_system: 'parliamentary_republic',
  eu_member_since: null,
  official_languages: ['en'],
  population: { value: seed.population, year: 2026, source: FIXTURE_SOURCE },

  cabinet_id: `${seed.iso2}-2024-01-01`,
  cabinet_name_original: `${seed.name} cabinet (fixture)`,
  cabinet_name_en: `${seed.name} cabinet (fixture)`,
  cabinet_name_es: `Gabinete de ${seed.name} (ficticio)`,
  head_of_government_title_original: 'Prime Minister',
  head_of_government_title_en: 'Prime Minister',
  took_office: '2024-01-01',
  left_office: null,

  ministries_count: seed.ministries,
  cabinet_seats_count: seed.ministries + seed.extraSeats,
  excluded_count: seed.extraSeats,
  entities_total: seed.ministries + seed.extraSeats,

  policy_areas: AREAS.slice(0, Math.min(AREAS.length, seed.ministries)),
  quality: {
    grade: seed.grade,
    tier1_share: seed.grade === 'A' ? 1 : seed.grade === 'B' ? 0.6 : 0.2,
    sources_total: 3,
    by_tier: { 1: seed.grade === 'A' ? 3 : 1, 2: 1, 3: 1 },
  },
  methodology_notes: [
    {
      en: 'FIXTURE — this note exists to give the notes block realistic length in layout work.',
      es: 'FICTICIO — esta nota existe para dar longitud realista al bloque de notas.',
    },
  ],
}));

export const FIXTURE_MINISTRIES: DerivedEntity[] = FIXTURE_COUNTRIES.flatMap((country) =>
  Array.from({ length: country.ministries_count }, (_, index) => ({
    id: `${country.iso2}-2024-fixture-${index + 1}`,
    order: index + 1,
    name_original: `Ministry of Fixture Affairs ${index + 1}`,
    abbreviation_original: null,
    name_en: `Ministry of Fixture Affairs ${index + 1}`,
    name_es: `Ministerio de Asuntos Ficticios ${index + 1}`,
    name_en_provenance: 'official' as const,
    name_es_provenance: 'translated' as const,
    head_title_original: 'Minister',
    head_title_en: 'Minister',
    has_cabinet_seat: true,
    head_count: 1,
    shared_head_with: [],
    policy_areas: [AREAS[index % AREAS.length] as string],
    counts_as_ministry: true,
    exclusion_reason: null,
    valid_from: null,
    valid_to: null,
    url: null,
    note: null,
    country: country.iso2,
    cabinet_id: country.cabinet_id,
    sources: [FIXTURE_SOURCE],
    best_tier: 1 as const,
  })),
);

export const FIXTURE_SOURCES: Source[] = [FIXTURE_SOURCE];
