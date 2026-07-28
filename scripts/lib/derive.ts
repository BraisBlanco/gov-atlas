import type { Cabinet, Entity } from '../../data/schema/cabinet.schema.ts';
import type { Country } from '../../data/schema/country.schema.ts';
import type { Source } from '../../data/schema/source.schema.ts';
import type { Taxonomy } from '../../data/schema/taxonomy.schema.ts';
import type { Bilingual } from '../../data/schema/common.ts';

/**
 * Every published number is computed here, from the curated entity lists, and nowhere
 * else. No count is ever typed by hand into a data file — which is the whole reason the
 * site can claim that a figure and its list of ministries cannot disagree.
 */

export type QualityGrade = 'A' | 'B' | 'C';

export interface DerivedEntity extends Omit<Entity, 'sources'> {
  country: string;
  cabinet_id: string;
  /** Full source records, resolved from the ids so consumers never have to join. */
  sources: Source[];
  /** Lowest (strongest) tier among this entity's sources. */
  best_tier: 1 | 2 | 3;
}

export interface CountrySummary {
  iso2: string;
  iso3: string;
  name_en: string;
  name_es: string;
  name_original: string;
  continent: string;
  region: string;
  government_system: string;
  eu_member_since: string | null;
  official_languages: string[];
  /**
   * Carries its own citation. Published as context on the country page rather than as a
   * denominator: a reader has to be able to trace it as readily as the ministry count.
   *
   * Nothing here divides by it. A ministries-per-million figure was published briefly and
   * withdrawn — a cabinet is not sized per capita, so the ratio ranked small countries top
   * and invited a comparison the data does not support.
   */
  population: { value: number; year: number; source: Source };

  cabinet_id: string;
  cabinet_name_original: string;
  cabinet_name_en: string;
  cabinet_name_es: string;
  head_of_government_title_original: string;
  head_of_government_title_en: string;
  took_office: string;
  left_office: string | null;

  /** Departments meeting the methodology's definition of a ministry. */
  ministries_count: number;
  /** Distinct people holding a cabinet seat — a different question, reported separately. */
  cabinet_seats_count: number;
  /** Recorded bodies deliberately not counted, each with a reason. */
  excluded_count: number;
  entities_total: number;

  /** Policy areas covered by at least one counted ministry. */
  policy_areas: string[];

  quality: {
    grade: QualityGrade;
    tier1_share: number;
    sources_total: number;
    by_tier: { 1: number; 2: number; 3: number };
  };

  methodology_notes: Bilingual[];
}

/** `YYYY-MM-DD` strings compare correctly as strings. */
function onOrBefore(a: string, b: string): boolean {
  return a <= b;
}

/**
 * The entities in place on a given date. Defaults to the end of the cabinet's term (or
 * today, for a sitting cabinet), which is what "current structure" means. Taking a date
 * rather than assuming "now" is what will let the timeline chart replay a term without
 * any change to the data model.
 */
export function entitiesAsOf(cabinet: Cabinet, asOf?: string): Entity[] {
  const date = asOf ?? cabinet.left_office ?? new Date().toISOString().slice(0, 10);
  return cabinet.entities.filter((entity) => {
    const from = entity.valid_from ?? cabinet.took_office;
    if (!onOrBefore(from, date)) return false;
    if (entity.valid_to !== null && !onOrBefore(date, entity.valid_to)) return false;
    return true;
  });
}

export function countMinistries(entities: Entity[]): number {
  return entities.filter((entity) => entity.counts_as_ministry).length;
}

/**
 * Distinct cabinet seats.
 *
 * A minister holding two portfolios is one person in two departments, so the naive sum
 * over entities overstates the cabinet. Entities linked through `shared_head_with` are
 * merged into groups and each group contributes the largest head count it declares.
 */
export function countCabinetSeats(entities: Entity[]): number {
  const seated = entities.filter((entity) => entity.has_cabinet_seat);
  const index = new Map(seated.map((entity, i) => [entity.id, i]));
  const parent = seated.map((_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    let walk = i;
    while (parent[walk] !== root) {
      const next = parent[walk] as number;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  seated.forEach((entity, i) => {
    for (const otherId of entity.shared_head_with) {
      const j = index.get(otherId);
      if (j !== undefined) union(i, j);
    }
  });

  const groupMax = new Map<number, number>();
  seated.forEach((entity, i) => {
    const root = find(i);
    groupMax.set(root, Math.max(groupMax.get(root) ?? 0, entity.head_count));
  });

  let seats = 0;
  for (const value of groupMax.values()) seats += value;
  return seats;
}

function bestTier(entity: Entity, sourcesById: Map<string, Source>): 1 | 2 | 3 {
  let best: 1 | 2 | 3 = 3;
  for (const id of entity.sources) {
    const tier = sourcesById.get(id)?.tier;
    if (tier !== undefined && tier < best) best = tier;
  }
  return best;
}

/**
 * Data-quality grade for a country.
 *
 * A — every counted ministry rests on a legal instrument (tier 1).
 * B — every counted ministry rests on an official publication (tier 1 or 2).
 * C — at least one counted ministry rests only on a secondary source.
 *
 * Published per country so a reader can weigh a comparison instead of trusting it
 * uniformly. It is graded on counted ministries only: the evidence behind an exclusion
 * matters, but it does not move the headline figure.
 */
export function qualityOf(
  cabinet: Cabinet,
  entities: Entity[],
): CountrySummary['quality'] {
  const sourcesById = new Map(cabinet.sources.map((source) => [source.id, source]));
  const counted = entities.filter((entity) => entity.counts_as_ministry);

  const by_tier = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };
  for (const source of cabinet.sources) by_tier[source.tier] += 1;

  const tiers = counted.map((entity) => bestTier(entity, sourcesById));
  const tier1 = tiers.filter((tier) => tier === 1).length;
  const worst = tiers.reduce<1 | 2 | 3>((acc, tier) => (tier > acc ? tier : acc), 1);

  const grade: QualityGrade = counted.length === 0 ? 'C' : worst === 1 ? 'A' : worst === 2 ? 'B' : 'C';

  return {
    grade,
    tier1_share: counted.length === 0 ? 0 : round(tier1 / counted.length, 3),
    sources_total: cabinet.sources.length,
    by_tier,
  };
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function deriveEntities(cabinet: Cabinet, entities: Entity[]): DerivedEntity[] {
  const sourcesById = new Map(cabinet.sources.map((source) => [source.id, source]));
  return entities
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entity) => {
      const { sources, ...rest } = entity;
      return {
        ...rest,
        country: cabinet.country,
        cabinet_id: cabinet.cabinet_id,
        sources: sources.flatMap((id) => {
          const source = sourcesById.get(id);
          return source ? [source] : [];
        }),
        best_tier: bestTier(entity, sourcesById),
      };
    });
}

export function deriveCountrySummary(
  country: Country,
  cabinet: Cabinet,
  asOf?: string,
): CountrySummary {
  const entities = entitiesAsOf(cabinet, asOf);
  const counted = entities.filter((entity) => entity.counts_as_ministry);
  const ministries_count = counted.length;

  const policy_areas = [...new Set(counted.flatMap((entity) => entity.policy_areas))].sort();

  return {
    iso2: country.iso2,
    iso3: country.iso3,
    name_en: country.name_en,
    name_es: country.name_es,
    name_original: country.name_original,
    continent: country.continent,
    region: country.region,
    government_system: country.government_system,
    eu_member_since: country.eu_member_since,
    official_languages: country.official_languages,
    population: {
      value: country.population.value,
      year: country.population.year,
      source: country.population.source,
    },

    cabinet_id: cabinet.cabinet_id,
    cabinet_name_original: cabinet.cabinet_name_original,
    cabinet_name_en: cabinet.cabinet_name_en,
    cabinet_name_es: cabinet.cabinet_name_es,
    head_of_government_title_original: cabinet.head_of_government_title_original,
    head_of_government_title_en: cabinet.head_of_government_title_en,
    took_office: cabinet.took_office,
    left_office: cabinet.left_office,

    ministries_count,
    cabinet_seats_count: countCabinetSeats(entities),
    excluded_count: entities.length - ministries_count,
    entities_total: entities.length,

    policy_areas,
    quality: qualityOf(cabinet, entities),
    methodology_notes: cabinet.methodology_notes,
  };
}

export interface PolicyMatrixCell {
  iso2: string;
  area: string;
  /** Counted ministries in this country holding this area. 0 means no dedicated ministry. */
  ministries: number;
  /** Ids of those ministries, so a tooltip can name them instead of just counting. */
  entity_ids: string[];
}

/**
 * Country × policy-area coverage.
 *
 * Ministry *names* are not comparable across countries; the areas they own are. This
 * matrix is what turns 27 incommensurable lists into a question you can actually ask —
 * who has a dedicated climate ministry, where digital policy lives, which governments
 * give equality its own department.
 */
export function derivePolicyMatrix(
  summaries: { iso2: string; entities: DerivedEntity[] }[],
  taxonomy: Taxonomy,
): PolicyMatrixCell[] {
  const cells: PolicyMatrixCell[] = [];
  for (const { iso2, entities } of summaries) {
    const counted = entities.filter((entity) => entity.counts_as_ministry);
    for (const area of taxonomy.policyAreas) {
      const holders = counted.filter((entity) => entity.policy_areas.includes(area.id));
      cells.push({
        iso2,
        area: area.id,
        ministries: holders.length,
        entity_ids: holders.map((entity) => entity.id),
      });
    }
  }
  return cells;
}
