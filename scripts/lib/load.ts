import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { CabinetSchema, type Cabinet } from '../../data/schema/cabinet.schema.ts';
import { CountrySchema, type Country } from '../../data/schema/country.schema.ts';
import {
  ExclusionReasonsFileSchema,
  PolicyAreasFileSchema,
  SourceTiersFileSchema,
  type Taxonomy,
} from '../../data/schema/taxonomy.schema.ts';
import { CABINETS_DIR, COUNTRIES_DIR, TAXONOMY_DIR, rel } from './paths.ts';
import { error, type Issue } from './issues.ts';

/** A file that parsed and validated, or the reasons it did not. */
export interface Loaded<T> {
  file: string;
  /** Undefined when the file failed to parse or validate. */
  value: T | undefined;
  issues: Issue[];
}

/**
 * Dates must survive as `YYYY-MM-DD` strings all the way to the published JSON. YAML
 * 1.2's core schema has no timestamp type, so `yaml` leaves them alone — but the 1.1
 * schema does, and a stray `schema: 'yaml-1.1'` anywhere would start handing us `Date`
 * objects that serialise with a timezone and shift by a day. Cheaper to assert the
 * assumption than to debug the off-by-one.
 */
function assertNoDateObjects(node: unknown, where: string): void {
  if (node instanceof Date) {
    throw new Error(
      `${where}: parsed to a Date object; dates must stay plain YYYY-MM-DD strings`,
    );
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertNoDateObjects(child, `${where}[${index}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      assertNoDateObjects(child, `${where}.${key}`);
    }
  }
}

/** Renders a Zod issue path the way it appears in the YAML file. */
function formatZodPath(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, '');
}

export async function loadYamlFile<T>(
  absolutePath: string,
  schema: z.ZodType<T>,
): Promise<Loaded<T>> {
  const file = rel(absolutePath);
  let raw: unknown;
  try {
    const text = await readFile(absolutePath, 'utf8');
    raw = parseYaml(text, { schema: 'core' });
    assertNoDateObjects(raw, file);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { file, value: undefined, issues: [error('yaml-parse', file, message)] };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      file,
      value: undefined,
      issues: result.error.issues.map((issue) =>
        error('schema', file, issue.message, formatZodPath(issue.path) || undefined),
      ),
    };
  }
  return { file, value: result.data, issues: [] };
}

async function listYamlFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => path.join(dir, name));
}

export async function loadTaxonomy(): Promise<{ taxonomy: Taxonomy | undefined; issues: Issue[] }> {
  const [areas, reasons, tiers] = await Promise.all([
    loadYamlFile(path.join(TAXONOMY_DIR, 'policy-areas.yml'), PolicyAreasFileSchema),
    loadYamlFile(path.join(TAXONOMY_DIR, 'exclusion-reasons.yml'), ExclusionReasonsFileSchema),
    loadYamlFile(path.join(TAXONOMY_DIR, 'source-tiers.yml'), SourceTiersFileSchema),
  ]);

  const issues = [...areas.issues, ...reasons.issues, ...tiers.issues];
  if (!areas.value || !reasons.value || !tiers.value) {
    return { taxonomy: undefined, issues };
  }

  return {
    taxonomy: {
      policyAreas: areas.value.areas,
      policyAreaGroups: areas.value.groups,
      exclusionReasons: reasons.value.reasons,
      tiers: tiers.value.tiers,
      sourceTypes: tiers.value.source_types,
    },
    issues,
  };
}

export interface Dataset {
  taxonomy: Taxonomy | undefined;
  countries: Loaded<Country>[];
  cabinets: Loaded<Cabinet>[];
  issues: Issue[];
}

/**
 * Reads everything under data/ once. Both `validate` and `build:data` go through here,
 * so the build can never see a shape the validator has not inspected.
 */
export async function loadDataset(): Promise<Dataset> {
  const [{ taxonomy, issues: taxonomyIssues }, countryFiles, cabinetFiles] = await Promise.all([
    loadTaxonomy(),
    listYamlFiles(COUNTRIES_DIR),
    listYamlFiles(CABINETS_DIR),
  ]);

  const countries = await Promise.all(
    countryFiles.map((file) => loadYamlFile(file, CountrySchema)),
  );
  const cabinets = await Promise.all(
    cabinetFiles.map((file) => loadYamlFile(file, CabinetSchema)),
  );

  return {
    taxonomy,
    countries,
    cabinets,
    issues: [
      ...taxonomyIssues,
      ...countries.flatMap((entry) => entry.issues),
      ...cabinets.flatMap((entry) => entry.issues),
    ],
  };
}

/** Successfully loaded values only, for code that runs after validation passed. */
export function valuesOf<T>(loaded: Loaded<T>[]): { file: string; value: T }[] {
  return loaded.flatMap((entry) => (entry.value ? [{ file: entry.file, value: entry.value }] : []));
}
