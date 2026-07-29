import path from 'node:path';

import type { Cabinet, Entity } from '../../data/schema/cabinet.schema.ts';
import type { Country } from '../../data/schema/country.schema.ts';
import type { Taxonomy } from '../../data/schema/taxonomy.schema.ts';
import type { Dataset } from './load.ts';
import { valuesOf } from './load.ts';
import { dayAfter, dayBefore } from './dates.ts';
import { error, warning, type Issue } from './issues.ts';

/**
 * Semantic validation: everything that cannot be expressed as the shape of one record.
 *
 * The structural layer (Zod, in data/schema) answers "is this a well-formed cabinet
 * file?". This layer answers the questions that actually protect the dataset's claim to
 * be sourced: does every counted ministry rest on a citation that resolves, is that
 * citation archived, do the ids line up across files, is the count reproducible.
 *
 * Every check carries a stable rule id. scripts/__tests__/rules.test.ts asserts on those
 * ids — including negative tests that deliberately break a file and require the
 * corresponding rule to fire, because a validator nobody tests is a validator that
 * quietly stops validating.
 */

/**
 * Hosts we accept as a web archive. Without this, the commonest curation slip — pasting
 * the live URL into `archive_url` as well — passes silently and the archive requirement
 * becomes decorative.
 */
const ARCHIVE_HOSTS = new Set([
  'web.archive.org',
  'archive.ph',
  'archive.today',
  'archive.is',
  'archive.li',
  'archive.vn',
  'arquivo.pt',
  'timetravel.mementoweb.org',
  'webarchive.org.uk',
  'perma.cc',
]);

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function entityPath(index: number, field?: string): string {
  return field ? `entities[${index}].${field}` : `entities[${index}]`;
}

function sourcePath(index: number, field?: string): string {
  return field ? `sources[${index}].${field}` : `sources[${index}]`;
}

/** Compares `YYYY-MM-DD` strings, which sort lexicographically. */
function isAfter(a: string, b: string): boolean {
  return a > b;
}


export interface CheckOptions {
  /** Injected so the "accessed in the future" rule is testable and not clock-flaky. */
  today: string;
}

export function checkDataset(dataset: Dataset, options: CheckOptions): Issue[] {
  const issues: Issue[] = [];
  const { taxonomy } = dataset;

  const countries = valuesOf(dataset.countries);
  const cabinets = valuesOf(dataset.cabinets);

  if (taxonomy) {
    issues.push(...checkTaxonomy(taxonomy));
  }

  for (const { file, value } of countries) {
    issues.push(...checkCountryFile(file, value, options));
  }

  const countryByIso = new Map(countries.map(({ value }) => [value.iso2, value]));
  const cabinetsByCountry = new Map<string, { file: string; value: Cabinet }[]>();
  const seenCabinetIds = new Map<string, string>();
  const seenEntityIds = new Map<string, string>();

  for (const entry of cabinets) {
    const list = cabinetsByCountry.get(entry.value.country);
    if (list) list.push(entry);
    else cabinetsByCountry.set(entry.value.country, [entry]);
  }

  for (const { file, value } of cabinets) {
    issues.push(
      ...checkCabinetFile(file, value, {
        ...options,
        taxonomy,
        knownCountry: countryByIso.has(value.country),
        seenCabinetIds,
        seenEntityIds,
      }),
    );
  }

  // At most one cabinet in office per country: two open-ended cabinets would make
  // "current" ambiguous and silently double the country's row in every chart.
  for (const [iso2, entries] of cabinetsByCountry) {
    const current = entries.filter(({ value }) => value.left_office === null);
    if (current.length > 1) {
      for (const { file } of current) {
        issues.push(
          error(
            'multiple-current-cabinets',
            file,
            `${iso2} has ${current.length} cabinets with left_office: null (${current
              .map((entry) => entry.value.cabinet_id)
              .join(', ')}); exactly one may be open-ended`,
          ),
        );
      }
    }
  }

  // A country's cabinets must tile time: no date may belong to two of them, and any
  // uncovered stretch must be declared rather than left to look like a flat line.
  for (const [iso2, entries] of cabinetsByCountry) {
    const ordered = entries
      .slice()
      .sort((a, b) => a.value.took_office.localeCompare(b.value.took_office));

    ordered.forEach((entry, index) => {
      const previous = ordered[index - 1];
      if (!previous) return;

      // An open-ended earlier cabinet runs to today, so anything starting after it overlaps.
      const previousEnd = previous.value.left_office;
      if (previousEnd === null || !isAfter(entry.value.took_office, previousEnd)) {
        issues.push(
          error(
            'cabinet-terms-overlap',
            entry.file,
            `${iso2}: ${entry.value.cabinet_id} takes office on ${entry.value.took_office}, ` +
              `which is not after ${previous.value.cabinet_id} left office on ` +
              `${previousEnd ?? 'null (still in office)'}; a date in two cabinets at once ` +
              'counts its ministries twice',
            'took_office',
          ),
        );
        return;
      }

      if (entry.value.took_office !== dayAfter(previousEnd)) {
        issues.push(
          warning(
            'cabinet-term-gap',
            entry.file,
            `${iso2}: no cabinet covers ${dayAfter(previousEnd)} to ` +
              `${dayBefore(entry.value.took_office)}, between ${previous.value.cabinet_id} ` +
              `and ${entry.value.cabinet_id}; a historical series will show a hole there`,
            'took_office',
          ),
        );
      }
    });
  }

  // Coverage gaps are not defects, but they must be visible rather than inferred from
  // a country's absence from a chart.
  for (const { file, value } of countries) {
    if (!cabinetsByCountry.has(value.iso2)) {
      issues.push(
        warning(
          'country-without-cabinet',
          file,
          `${value.iso2} has no cabinet file yet; it will be reported as an uncovered country`,
        ),
      );
    }
  }

  return issues;
}

function checkTaxonomy(taxonomy: Taxonomy): Issue[] {
  const issues: Issue[] = [];
  const file = 'data/taxonomy';

  const groupIds = new Set(taxonomy.policyAreaGroups.map((group) => group.id));
  const seenAreas = new Set<string>();
  for (const area of taxonomy.policyAreas) {
    if (seenAreas.has(area.id)) {
      issues.push(
        error('policy-area-duplicate-id', `${file}/policy-areas.yml`, `duplicate area id "${area.id}"`),
      );
    }
    seenAreas.add(area.id);
    if (!groupIds.has(area.group)) {
      issues.push(
        error(
          'policy-area-group-unknown',
          `${file}/policy-areas.yml`,
          `area "${area.id}" references unknown group "${area.group}"`,
        ),
      );
    }
  }

  const seenReasons = new Set<string>();
  for (const reason of taxonomy.exclusionReasons) {
    if (seenReasons.has(reason.id)) {
      issues.push(
        error(
          'exclusion-reason-duplicate-id',
          `${file}/exclusion-reasons.yml`,
          `duplicate reason id "${reason.id}"`,
        ),
      );
    }
    seenReasons.add(reason.id);
  }

  return issues;
}

function checkCountryFile(file: string, country: Country, options: CheckOptions): Issue[] {
  const issues: Issue[] = [];

  const expected = `${country.iso2}.yml`;
  if (path.basename(file) !== expected) {
    issues.push(
      error(
        'country-filename-mismatch',
        file,
        `file must be named ${expected} to match iso2 "${country.iso2}"`,
      ),
    );
  }

  issues.push(
    ...checkSource(file, country.population.source, 'population.source', options),
  );

  return issues;
}

interface CabinetCheckContext extends CheckOptions {
  taxonomy: Taxonomy | undefined;
  knownCountry: boolean;
  seenCabinetIds: Map<string, string>;
  seenEntityIds: Map<string, string>;
}

function checkCabinetFile(file: string, cabinet: Cabinet, ctx: CabinetCheckContext): Issue[] {
  const issues: Issue[] = [];

  if (!ctx.knownCountry) {
    issues.push(
      error(
        'country-file-missing',
        file,
        `country "${cabinet.country}" has no data/countries/${cabinet.country}.yml`,
        'country',
      ),
    );
  }

  const expectedId = `${cabinet.country}-${cabinet.took_office}`;
  if (cabinet.cabinet_id !== expectedId) {
    issues.push(
      error(
        'cabinet-id-mismatch',
        file,
        `cabinet_id must be "${expectedId}" (country + took_office)`,
        'cabinet_id',
      ),
    );
  }
  if (path.basename(file) !== `${cabinet.cabinet_id}.yml`) {
    issues.push(
      error(
        'cabinet-filename-mismatch',
        file,
        `file must be named ${cabinet.cabinet_id}.yml`,
      ),
    );
  }

  const duplicate = ctx.seenCabinetIds.get(cabinet.cabinet_id);
  if (duplicate) {
    issues.push(
      error('cabinet-duplicate-id', file, `cabinet_id "${cabinet.cabinet_id}" already used in ${duplicate}`),
    );
  } else {
    ctx.seenCabinetIds.set(cabinet.cabinet_id, file);
  }

  if (cabinet.left_office !== null && isAfter(cabinet.took_office, cabinet.left_office)) {
    issues.push(
      error('cabinet-dates-order', file, 'left_office precedes took_office', 'left_office'),
    );
  }
  if (isAfter(cabinet.took_office, ctx.today)) {
    issues.push(
      error('cabinet-took-office-future', file, `took_office ${cabinet.took_office} is in the future`, 'took_office'),
    );
  }

  // --- sources ------------------------------------------------------------------
  const sourceIds = new Set<string>();
  cabinet.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) {
      issues.push(
        error('source-duplicate-id', file, `duplicate source id "${source.id}"`, sourcePath(index, 'id')),
      );
    }
    sourceIds.add(source.id);
    issues.push(...checkSource(file, source, sourcePath(index), ctx));
  });

  // --- entities -----------------------------------------------------------------
  const cabinetYear = cabinet.took_office.slice(0, 4);
  const entityIds = new Set(cabinet.entities.map((entity) => entity.id));
  const referencedSources = new Set<string>();
  const orders = new Map<number, number>();

  cabinet.entities.forEach((entity, index) => {
    const duplicateFile = ctx.seenEntityIds.get(entity.id);
    if (duplicateFile) {
      issues.push(
        error('entity-duplicate-id', file, `entity id "${entity.id}" already used in ${duplicateFile}`, entityPath(index, 'id')),
      );
    } else {
      ctx.seenEntityIds.set(entity.id, file);
    }

    if (!entity.id.startsWith(`${cabinet.country}-`)) {
      issues.push(
        error('entity-id-country-prefix', file, `id must start with "${cabinet.country}-"`, entityPath(index, 'id')),
      );
    }
    if (entity.id.split('-')[1] !== cabinetYear) {
      issues.push(
        error('entity-id-year-prefix', file, `id must carry the cabinet's year "${cabinetYear}"`, entityPath(index, 'id')),
      );
    }

    const previousOrder = orders.get(entity.order);
    if (previousOrder !== undefined) {
      issues.push(
        error('entity-order-duplicate', file, `order ${entity.order} is also used by entities[${previousOrder}]`, entityPath(index, 'order')),
      );
    } else {
      orders.set(entity.order, index);
    }

    issues.push(...checkEntitySources(file, entity, index, sourceIds));
    for (const id of entity.sources) referencedSources.add(id);

    issues.push(...checkEntityClassification(file, entity, index, ctx.taxonomy));
    issues.push(...checkEntityValidity(file, entity, index, cabinet));
    issues.push(...checkSharedHeads(file, entity, index, cabinet, entityIds));
  });

  const maxOrder = Math.max(...cabinet.entities.map((entity) => entity.order));
  if (maxOrder !== cabinet.entities.length) {
    issues.push(
      warning(
        'entity-order-gap',
        file,
        `orders run up to ${maxOrder} for ${cabinet.entities.length} entities; they should be a contiguous 1..n listing order`,
      ),
    );
  }

  // A source nobody cites is either a forgotten citation or dead weight in the file.
  cabinet.sources.forEach((source, index) => {
    if (!referencedSources.has(source.id)) {
      issues.push(
        warning('source-unused', file, `source "${source.id}" is not cited by any entity`, sourcePath(index, 'id')),
      );
    }
  });

  return issues;
}

function checkSource(
  file: string,
  source: { tier: 1 | 2 | 3; type: string; url: string; archive_url: string | null; published: string | null; accessed: string; quote: string },
  at: string,
  options: CheckOptions,
): Issue[] {
  const issues: Issue[] = [];

  if (source.tier <= 2) {
    if (!source.archive_url) {
      // A publisher that blocks the archive crawler would otherwise make a country
      // permanently uncoverable. Declaring why demotes this to a warning, so the gap stays
      // countable instead of becoming invisible; saying nothing keeps it an error.
      issues.push(
        source.archive_unavailable_reason
          ? warning(
              'source-archive-unavailable',
              file,
              `tier ${source.tier} source carries no snapshot; declared unavailable: ` +
                source.archive_unavailable_reason.replace(/\s+/g, ' ').slice(0, 160),
              `${at}.archive_url`,
            )
          : error(
              'source-archive-required',
              file,
              `tier ${source.tier} sources must carry an archive_url snapshot`,
              `${at}.archive_url`,
            ),
      );
    } else {
      if (source.archive_unavailable_reason) {
        issues.push(
          error(
            'source-archive-exemption-stale',
            file,
            'archive_unavailable_reason is set alongside an archive_url; remove the reason ' +
              'now that a snapshot exists',
            `${at}.archive_unavailable_reason`,
          ),
        );
      }
      if (source.archive_url === source.url) {
        issues.push(
          error(
            'source-archive-same-as-url',
            file,
            'archive_url repeats the live url; it must point at an archived snapshot',
            `${at}.archive_url`,
          ),
        );
      }
      const host = hostOf(source.archive_url);
      if (host && !ARCHIVE_HOSTS.has(host)) {
        issues.push(
          error(
            'source-archive-host-unknown',
            file,
            `archive_url host "${host}" is not a recognised web archive`,
            `${at}.archive_url`,
          ),
        );
      }
    }
  }

  if (isAfter(source.accessed, options.today)) {
    issues.push(
      error('source-accessed-future', file, `accessed ${source.accessed} is in the future`, `${at}.accessed`),
    );
  }
  if (source.published !== null && isAfter(source.published, source.accessed)) {
    issues.push(
      error('source-published-after-accessed', file, 'published is later than accessed', `${at}.published`),
    );
  }

  // A tier-1 claim has to rest on a legal instrument; calling a portal page tier 1
  // would let the strongest grade be awarded to the weakest evidence.
  if (source.tier === 1 && source.type !== 'official_gazette' && source.type !== 'statute') {
    issues.push(
      error(
        'source-tier-type-mismatch',
        file,
        `tier 1 requires type official_gazette or statute, got "${source.type}"`,
        `${at}.tier`,
      ),
    );
  }

  if (/^\s*$/.test(source.quote)) {
    issues.push(error('source-quote-empty', file, 'quote must contain the supporting text', `${at}.quote`));
  }

  return issues;
}

function checkEntitySources(
  file: string,
  entity: Entity,
  index: number,
  sourceIds: Set<string>,
): Issue[] {
  const issues: Issue[] = [];
  entity.sources.forEach((id, position) => {
    if (!sourceIds.has(id)) {
      issues.push(
        error(
          'entity-source-unresolved',
          file,
          `cites source "${id}", which is not declared in this file`,
          entityPath(index, `sources[${position}]`),
        ),
      );
    }
  });
  return issues;
}

function checkEntityClassification(
  file: string,
  entity: Entity,
  index: number,
  taxonomy: Taxonomy | undefined,
): Issue[] {
  const issues: Issue[] = [];

  if (entity.counts_as_ministry) {
    if (entity.exclusion_reason !== null) {
      issues.push(
        error(
          'exclusion-reason-forbidden',
          file,
          'a counted ministry must not carry an exclusion_reason',
          entityPath(index, 'exclusion_reason'),
        ),
      );
    }
    if (entity.policy_areas.length === 0) {
      issues.push(
        error(
          'policy-area-required',
          file,
          'a counted ministry needs at least one policy area, otherwise it vanishes from every comparison view',
          entityPath(index, 'policy_areas'),
        ),
      );
    }
    if (!entity.has_cabinet_seat) {
      issues.push(
        warning(
          'counted-ministry-without-seat',
          file,
          'counted as a ministry but its head holds no cabinet seat; confirm this is intended and note it',
          entityPath(index, 'has_cabinet_seat'),
        ),
      );
    }
  } else if (entity.exclusion_reason === null) {
    issues.push(
      error(
        'exclusion-reason-required',
        file,
        'entities that are not counted must say why, using an id from data/taxonomy/exclusion-reasons.yml',
        entityPath(index, 'exclusion_reason'),
      ),
    );
  }

  if (taxonomy) {
    const knownAreas = new Set(taxonomy.policyAreas.map((area) => area.id));
    entity.policy_areas.forEach((area, position) => {
      if (!knownAreas.has(area)) {
        issues.push(
          error(
            'policy-area-unknown',
            file,
            `"${area}" is not in data/taxonomy/policy-areas.yml`,
            entityPath(index, `policy_areas[${position}]`),
          ),
        );
      }
    });

    const seen = new Set<string>();
    for (const area of entity.policy_areas) {
      if (seen.has(area)) {
        issues.push(
          error('policy-area-duplicate', file, `policy area "${area}" is listed twice`, entityPath(index, 'policy_areas')),
        );
      }
      seen.add(area);
    }

    if (entity.exclusion_reason !== null) {
      const knownReasons = new Set(taxonomy.exclusionReasons.map((reason) => reason.id));
      if (!knownReasons.has(entity.exclusion_reason)) {
        issues.push(
          error(
            'exclusion-reason-unknown',
            file,
            `"${entity.exclusion_reason}" is not in data/taxonomy/exclusion-reasons.yml`,
            entityPath(index, 'exclusion_reason'),
          ),
        );
      }
    }
  }

  return issues;
}

function checkEntityValidity(
  file: string,
  entity: Entity,
  index: number,
  cabinet: Cabinet,
): Issue[] {
  const issues: Issue[] = [];

  if (entity.valid_from !== null && isAfter(cabinet.took_office, entity.valid_from)) {
    issues.push(
      error(
        'entity-validity-before-cabinet',
        file,
        `valid_from ${entity.valid_from} precedes the cabinet's took_office ${cabinet.took_office}`,
        entityPath(index, 'valid_from'),
      ),
    );
  }

  const from = entity.valid_from ?? cabinet.took_office;
  if (entity.valid_to !== null && isAfter(from, entity.valid_to)) {
    issues.push(
      error('entity-validity-order', file, 'valid_to precedes valid_from', entityPath(index, 'valid_to')),
    );
  }

  if (
    entity.valid_to !== null &&
    cabinet.left_office !== null &&
    isAfter(entity.valid_to, cabinet.left_office)
  ) {
    issues.push(
      error(
        'entity-validity-after-cabinet',
        file,
        `valid_to ${entity.valid_to} outlives the cabinet's left_office ${cabinet.left_office}`,
        entityPath(index, 'valid_to'),
      ),
    );
  }

  return issues;
}

function checkSharedHeads(
  file: string,
  entity: Entity,
  index: number,
  cabinet: Cabinet,
  entityIds: Set<string>,
): Issue[] {
  const issues: Issue[] = [];

  entity.shared_head_with.forEach((otherId, position) => {
    const at = entityPath(index, `shared_head_with[${position}]`);

    if (otherId === entity.id) {
      issues.push(error('shared-head-self', file, 'an entity cannot share its head with itself', at));
      return;
    }
    if (!entityIds.has(otherId)) {
      issues.push(
        error('shared-head-unresolved', file, `"${otherId}" is not an entity in this file`, at),
      );
      return;
    }
    // Asymmetry would make the seat count depend on which entity we walked first.
    const other = cabinet.entities.find((candidate) => candidate.id === otherId);
    if (other && !other.shared_head_with.includes(entity.id)) {
      issues.push(
        error(
          'shared-head-symmetry',
          file,
          `"${otherId}" does not list "${entity.id}" back; shared_head_with must be symmetric`,
          at,
        ),
      );
    }
  });

  return issues;
}
