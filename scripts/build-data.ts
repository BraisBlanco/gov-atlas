/**
 * data/ -> site/public/data/
 *
 * Re-runs the validator first and refuses to write anything if it finds an error, so the
 * site can never be built from data the gate has not cleared.
 *
 * Everything written here is also a public download: the JSON the charts read is the
 * same JSON a reader can fetch, and the CSVs are what the "download" buttons serve.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadDataset, valuesOf } from './lib/load.ts';
import { checkDataset } from './lib/rules.ts';
import { countBySeverity, formatIssues } from './lib/issues.ts';
import { SITE_DATA_DIR, rel } from './lib/paths.ts';
import { EU27 } from './lib/scope.ts';
import { toCsv } from './lib/csv.ts';
import {
  deriveCountrySummary,
  deriveEntities,
  derivePolicyMatrix,
  entitiesAsOf,
  type CountrySummary,
  type DerivedEntity,
} from './lib/derive.ts';

const today = process.env.GOV_ATLAS_TODAY ?? new Date().toISOString().slice(0, 10);
/** Overridable so a rebuild of the same commit produces byte-identical output. */
const generatedAt = process.env.GOV_ATLAS_GENERATED_AT ?? new Date().toISOString();

const dataset = await loadDataset();
const issues = [...dataset.issues, ...checkDataset(dataset, { today })];
const { errors, warnings } = countBySeverity(issues);

if (errors > 0) {
  console.log(formatIssues(issues));
  console.error(`\nRefusing to build: ${errors} validation error(s).`);
  process.exit(1);
}

const { taxonomy } = dataset;
if (!taxonomy) {
  console.error('Refusing to build: the taxonomy files could not be loaded.');
  process.exit(1);
}

const countries = valuesOf(dataset.countries);
const cabinets = valuesOf(dataset.cabinets);

/** One row per country, built from its current cabinet. */
const summaries: CountrySummary[] = [];
const entitiesByCountry: { iso2: string; entities: DerivedEntity[] }[] = [];
const uncovered: string[] = [];

for (const { value: country } of countries) {
  const forCountry = cabinets.filter(({ value }) => value.country === country.iso2);
  const current =
    forCountry.find(({ value }) => value.left_office === null) ??
    forCountry.sort((a, b) => b.value.took_office.localeCompare(a.value.took_office))[0];

  if (!current) {
    uncovered.push(country.iso2);
    continue;
  }

  summaries.push(deriveCountrySummary(country, current.value, today));
  entitiesByCountry.push({
    iso2: country.iso2,
    entities: deriveEntities(current.value, entitiesAsOf(current.value, today)),
  });
}

summaries.sort((a, b) => a.iso2.localeCompare(b.iso2));
entitiesByCountry.sort((a, b) => a.iso2.localeCompare(b.iso2));

const allEntities = entitiesByCountry.flatMap((entry) => entry.entities);
const policyMatrix = derivePolicyMatrix(entitiesByCountry, taxonomy);

const metadata = {
  generated_at: generatedAt,
  as_of: today,
  /**
   * The v1 ambition, so "covered" can be reported against what we set out to do. Without
   * it the site would say "1 of 1 countries", which reads as complete coverage.
   */
  target_total: EU27.length,
  countries_total: countries.length,
  countries_covered: summaries.length,
  countries_uncovered: uncovered,
  /** Target countries with no country file at all yet. */
  target_missing: EU27.filter((iso2) => !summaries.some((summary) => summary.iso2 === iso2)),
  cabinets_total: cabinets.length,
  entities_total: allEntities.length,
  ministries_total: allEntities.filter((entity) => entity.counts_as_ministry).length,
  sources_total: cabinets.reduce((sum, { value }) => sum + value.sources.length, 0),
  sources_by_tier: cabinets.reduce<Record<string, number>>((acc, { value }) => {
    for (const source of value.sources) {
      acc[String(source.tier)] = (acc[String(source.tier)] ?? 0) + 1;
    }
    return acc;
  }, {}),
  validation_warnings: warnings,
  license: 'CC-BY-4.0',
  schema_version: 1,
};

await rm(SITE_DATA_DIR, { recursive: true, force: true });
await mkdir(path.join(SITE_DATA_DIR, 'countries'), { recursive: true });

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const target = path.join(SITE_DATA_DIR, relativePath);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`  ${rel(target)}`);
}

async function writeText(relativePath: string, text: string): Promise<void> {
  const target = path.join(SITE_DATA_DIR, relativePath);
  await writeFile(target, text, 'utf8');
  console.log(`  ${rel(target)}`);
}

console.log('Writing:');

await writeJson('metadata.json', metadata);
await writeJson('taxonomy.json', taxonomy);
await writeJson('countries.json', summaries);
await writeJson('ministries.json', allEntities);
await writeJson('policy-matrix.json', policyMatrix);

// Per-country payloads: a country page pulls one small file instead of the whole dataset.
for (const { iso2, entities } of entitiesByCountry) {
  const summary = summaries.find((candidate) => candidate.iso2 === iso2);
  await writeJson(path.join('countries', `${iso2}.json`), { summary, entities });
}

await writeText(
  'counts.csv',
  toCsv(summaries, [
    'iso2',
    'iso3',
    'name_en',
    'name_es',
    'ministries_count',
    'cabinet_seats_count',
    'excluded_count',
    'cabinet_id',
    'took_office',
    'left_office',
  ]),
);

await writeText(
  'ministries.csv',
  toCsv(
    allEntities.map((entity) => ({
      country: entity.country,
      cabinet_id: entity.cabinet_id,
      order: entity.order,
      id: entity.id,
      name_original: entity.name_original,
      name_en: entity.name_en,
      name_es: entity.name_es,
      counts_as_ministry: entity.counts_as_ministry,
      exclusion_reason: entity.exclusion_reason ?? '',
      policy_areas: entity.policy_areas,
      has_cabinet_seat: entity.has_cabinet_seat,
      best_tier: entity.best_tier,
      source_urls: entity.sources.map((source) => source.url),
    })),
    [
      'country',
      'cabinet_id',
      'order',
      'id',
      'name_original',
      'name_en',
      'name_es',
      'counts_as_ministry',
      'exclusion_reason',
      'policy_areas',
      'has_cabinet_seat',
      'best_tier',
      'source_urls',
    ],
  ),
);

console.log(
  `\nBuilt ${summaries.length}/${countries.length} countries, ` +
    `${metadata.ministries_total} counted ministries, ${metadata.sources_total} sources.`,
);
if (warnings > 0) {
  console.log(`${warnings} warning(s) — run \`npm run validate\` to see them.`);
}
if (uncovered.length > 0) {
  console.log(`Uncovered countries: ${uncovered.join(', ')}`);
}
