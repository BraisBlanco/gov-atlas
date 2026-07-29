import { describe, expect, it } from 'vitest';

import {
  countCabinetSeats,
  countMinistries,
  deriveCountrySummary,
  derivePolicyMatrix,
  deriveEntities,
  deriveTimeline,
  entitiesAsOf,
  qualityOf,
} from '../lib/derive.ts';
import { toCsv } from '../lib/csv.ts';
import {
  TODAY,
  makeCabinetInput,
  makeCountryInput,
  makeMinistry,
  makePresidency,
  makeSource,
  parseCabinet,
  parseCountry,
} from './fixtures.ts';

/**
 * The counts are derived, never typed. These tests pin the derivation, because the moment
 * `ministries_count` can disagree with the list of ministries beneath it the project has
 * lost the only thing that distinguishes it from a blog post with a number in it.
 */

describe('ministry and seat counts', () => {
  it('counts only entities that meet the definition', () => {
    const cabinet = parseCabinet(makeCabinetInput());
    expect(countMinistries(cabinet.entities)).toBe(1);
    expect(cabinet.entities).toHaveLength(2);
  });

  it('counts the head of government as a seat but not as a ministry', () => {
    const cabinet = parseCabinet(makeCabinetInput());
    expect(countMinistries(cabinet.entities)).toBe(1);
    expect(countCabinetSeats(cabinet.entities)).toBe(2);
  });

  it('counts a minister holding two portfolios once', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        entities: [
          makeMinistry({ shared_head_with: ['ES-2023-pesca'] }),
          makeMinistry({
            id: 'ES-2023-pesca',
            order: 2,
            name_original: 'Ministerio de Pesca',
            name_en: 'Ministry of Fisheries',
            name_es: 'Ministerio de Pesca',
            policy_areas: ['fisheries'],
            shared_head_with: ['ES-2023-agricultura'],
          }),
          makePresidency({ order: 3 }),
        ],
      }),
    );
    // Two departments, one person: the two figures must diverge, and that divergence is
    // itself something the site reports.
    expect(countMinistries(cabinet.entities)).toBe(2);
    expect(countCabinetSeats(cabinet.entities)).toBe(2);
  });

  it('merges a chain of three shared portfolios into a single seat', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        entities: [
          makeMinistry({ shared_head_with: ['ES-2023-pesca'] }),
          makeMinistry({
            id: 'ES-2023-pesca',
            order: 2,
            policy_areas: ['fisheries'],
            shared_head_with: ['ES-2023-agricultura', 'ES-2023-alimentacion'],
          }),
          makeMinistry({
            id: 'ES-2023-alimentacion',
            order: 3,
            policy_areas: ['food_safety'],
            shared_head_with: ['ES-2023-pesca'],
          }),
        ],
      }),
    );
    expect(countMinistries(cabinet.entities)).toBe(3);
    expect(countCabinetSeats(cabinet.entities)).toBe(1);
  });

  it('ignores entities whose head holds no cabinet seat', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        entities: [
          makeMinistry(),
          makePresidency({
            has_cabinet_seat: false,
            exclusion_reason: 'not_headed_by_minister',
          }),
        ],
      }),
    );
    expect(countCabinetSeats(cabinet.entities)).toBe(1);
  });

  it('respects co-ministers heading one department', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({ entities: [makeMinistry({ head_count: 2 }), makePresidency()] }),
    );
    expect(countMinistries(cabinet.entities)).toBe(1);
    expect(countCabinetSeats(cabinet.entities)).toBe(3);
  });
});

describe('validity windows', () => {
  const cabinet = parseCabinet(
    makeCabinetInput({
      left_office: null,
      entities: [
        makeMinistry({ valid_to: '2025-03-31' }),
        makeMinistry({
          id: 'ES-2023-alimentacion',
          order: 2,
          policy_areas: ['food_safety'],
          valid_from: '2025-04-01',
        }),
        makePresidency({ order: 3 }),
      ],
    }),
  );

  it('returns the structure in place on a given date', () => {
    const before = entitiesAsOf(cabinet, '2025-01-01').map((entity) => entity.id);
    expect(before).toEqual(['ES-2023-agricultura', 'ES-2023-presidencia']);

    const after = entitiesAsOf(cabinet, '2025-06-01').map((entity) => entity.id);
    expect(after).toEqual(['ES-2023-alimentacion', 'ES-2023-presidencia']);
  });

  it('keeps the count stable across a mid-term replacement', () => {
    expect(countMinistries(entitiesAsOf(cabinet, '2025-01-01'))).toBe(1);
    expect(countMinistries(entitiesAsOf(cabinet, '2025-06-01'))).toBe(1);
  });

  it('includes a department on the exact day it takes effect', () => {
    const ids = entitiesAsOf(cabinet, '2025-04-01').map((entity) => entity.id);
    expect(ids).toContain('ES-2023-alimentacion');
    expect(ids).not.toContain('ES-2023-agricultura');
  });
});

describe('source-quality grading', () => {
  it('awards A when every counted ministry rests on a legal instrument', () => {
    const cabinet = parseCabinet(makeCabinetInput());
    const quality = qualityOf(cabinet, cabinet.entities);
    expect(quality.grade).toBe('A');
    expect(quality.tier1_share).toBe(1);
  });

  it('drops to B when a ministry rests only on an official web page', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        sources: [
          makeSource(),
          makeSource({
            id: 'portal-1',
            tier: 2,
            type: 'government_website',
            url: 'https://www.lamoncloa.gob.es/gobierno',
            archive_url: 'https://web.archive.org/web/20240101/https://www.lamoncloa.gob.es/gobierno',
          }),
        ],
        entities: [
          makeMinistry({ sources: ['portal-1'] }),
          makeMinistry({ id: 'ES-2023-pesca', order: 2, policy_areas: ['fisheries'] }),
          makePresidency({ order: 3 }),
        ],
      }),
    );
    const quality = qualityOf(cabinet, cabinet.entities);
    expect(quality.grade).toBe('B');
    expect(quality.tier1_share).toBe(0.5);
  });

  it('drops to C when a ministry rests only on a secondary source', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        sources: [
          makeSource(),
          makeSource({
            id: 'press-1',
            tier: 3,
            type: 'press',
            url: 'https://elpais.com/example',
            archive_url: null,
          }),
        ],
        entities: [makeMinistry({ sources: ['press-1'] }), makePresidency()],
      }),
    );
    expect(qualityOf(cabinet, cabinet.entities).grade).toBe('C');
  });

  it('grades on the strongest source an entity cites, not the weakest', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        sources: [
          makeSource(),
          makeSource({ id: 'press-1', tier: 3, type: 'press', url: 'https://elpais.com/x', archive_url: null }),
        ],
        entities: [
          makeMinistry({ sources: ['press-1', 'gazette-1'] }),
          makePresidency(),
        ],
      }),
    );
    expect(qualityOf(cabinet, cabinet.entities).grade).toBe('A');
  });
});

describe('country summary', () => {
  const summary = deriveCountrySummary(
    parseCountry(makeCountryInput()),
    parseCabinet(makeCabinetInput()),
    TODAY,
  );

  it('reports ministries and seats as separate figures', () => {
    expect(summary.ministries_count).toBe(1);
    expect(summary.cabinet_seats_count).toBe(2);
    expect(summary.excluded_count).toBe(1);
    expect(summary.entities_total).toBe(2);
  });

  it('republishes the sourced population without deriving a ratio from it', () => {
    expect(summary.population.value).toBe(48_797_875);
    expect(summary.population.source.url).toBe(makeCountryInput().population.source.url);
    expect(summary).not.toHaveProperty('ministries_per_million');
  });

  it('lists the policy areas covered by counted ministries only', () => {
    expect(summary.policy_areas).toEqual(['agriculture', 'fisheries', 'food_safety']);
  });
});

describe('policy matrix', () => {
  it('names the ministries behind each cell rather than only counting them', () => {
    const cabinet = parseCabinet(makeCabinetInput());
    const entities = deriveEntities(cabinet, cabinet.entities);
    const matrix = derivePolicyMatrix([{ iso2: 'ES', entities }], {
      policyAreas: [
        { id: 'agriculture', group: 'land_environment', label_en: 'Agriculture', label_es: 'Agricultura' },
        { id: 'defence', group: 'state_core', label_en: 'Defence', label_es: 'Defensa' },
      ],
      policyAreaGroups: [],
      exclusionReasons: [],
      tiers: [],
      sourceTypes: [],
    });

    const agriculture = matrix.find((cell) => cell.area === 'agriculture');
    expect(agriculture?.ministries).toBe(1);
    expect(agriculture?.entity_ids).toEqual(['ES-2023-agricultura']);

    // A country with no dedicated ministry for an area gets an explicit zero, not a
    // missing cell — the absence is the finding.
    const defence = matrix.find((cell) => cell.area === 'defence');
    expect(defence?.ministries).toBe(0);
    expect(defence?.entity_ids).toEqual([]);
  });
});

describe('derived entities', () => {
  it('embeds resolved sources so consumers never have to join by id', () => {
    const cabinet = parseCabinet(makeCabinetInput());
    const [first] = deriveEntities(cabinet, cabinet.entities);
    expect(first?.sources[0]?.url).toBe('https://www.boe.es/eli/es/rd/2023/11/20/829');
    expect(first?.best_tier).toBe(1);
  });

  it('returns entities in official listing order', () => {
    const cabinet = parseCabinet(
      makeCabinetInput({
        entities: [makePresidency({ order: 2 }), makeMinistry({ order: 1 })],
      }),
    );
    expect(deriveEntities(cabinet, cabinet.entities).map((entity) => entity.order)).toEqual([1, 2]);
  });
});

describe('the history series', () => {
  const idsOf = (point: { ministries: { id: string }[] } | undefined): string[] =>
    (point?.ministries ?? []).map((ministry) => ministry.id);

  /** One cabinet, two mid-term changes: a replacement that holds the count, then a closure. */
  const ninth = makeCabinetInput({
    cabinet_id: 'ES-2008-04-14',
    took_office: '2008-04-14',
    left_office: '2011-12-21',
    entities: [
      makeMinistry({ id: 'ES-2008-agricultura' }),
      makeMinistry({
        id: 'ES-2008-sanidad-consumo',
        order: 2,
        policy_areas: ['health'],
        valid_to: '2009-04-06',
      }),
      makeMinistry({
        id: 'ES-2008-sanidad-social',
        order: 3,
        policy_areas: ['health'],
        valid_from: '2009-04-07',
      }),
      makeMinistry({
        id: 'ES-2008-vivienda',
        order: 4,
        policy_areas: ['housing'],
        valid_to: '2010-10-20',
      }),
      makePresidency({ id: 'ES-2008-presidencia', order: 5 }),
    ],
  });

  it('emits one point per structural change, not one per cabinet', () => {
    const points = deriveTimeline('ES', [parseCabinet(ninth)]);
    expect(points.map((point) => point.date)).toEqual([
      '2008-04-14',
      '2009-04-07',
      '2010-10-21',
    ]);
  });

  it('closes each point on the day before the next one begins', () => {
    const points = deriveTimeline('ES', [parseCabinet(ninth)]);
    expect(points.map((point) => point.until)).toEqual([
      '2009-04-06',
      '2010-10-20',
      '2011-12-21',
    ]);
  });

  it('keeps a repeated count rather than compressing it away', () => {
    // The reshuffle that renames a department without changing the total is exactly the
    // event a bare number hides, so the point must survive with its own ministry list.
    const points = deriveTimeline('ES', [parseCabinet(ninth)]);
    expect(points.map((point) => point.ministries_count)).toEqual([3, 3, 2]);
    expect(idsOf(points[0])).toContain('ES-2008-sanidad-consumo');
    expect(idsOf(points[1])).toContain('ES-2008-sanidad-social');
    expect(idsOf(points[1])).not.toContain('ES-2008-sanidad-consumo');
  });

  it('counts a department that ends mid-term for the period it existed', () => {
    const points = deriveTimeline('ES', [parseCabinet(ninth)]);
    expect(idsOf(points[1])).toContain('ES-2008-vivienda');
    expect(idsOf(points[2])).not.toContain('ES-2008-vivienda');
    expect(points.map((point) => point.cabinet_seats_count)).toEqual([4, 4, 3]);
  });

  it('runs the last point of a sitting cabinet open-ended', () => {
    const points = deriveTimeline(
      'ES',
      [parseCabinet(makeCabinetInput({ left_office: null }))],
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.until).toBeNull();
  });

  it('orders points across cabinets by date', () => {
    const points = deriveTimeline('ES', [
      parseCabinet(makeCabinetInput({ left_office: null })),
      parseCabinet(ninth),
    ]);
    expect(points.map((point) => point.date)).toEqual([
      '2008-04-14',
      '2009-04-07',
      '2010-10-21',
      '2023-11-21',
    ]);
  });

  it('ignores cabinets belonging to another country', () => {
    const portuguese = makeCabinetInput({
      country: 'PT',
      cabinet_id: 'PT-2024-04-02',
      took_office: '2024-04-02',
      entities: [makeMinistry({ id: 'PT-2024-agricultura' }), makePresidency({ id: 'PT-2024-presidencia' })],
    });
    const points = deriveTimeline('ES', [parseCabinet(ninth), parseCabinet(portuguese)]);
    expect(points.every((point) => point.iso2 === 'ES')).toBe(true);
    expect(points).toHaveLength(3);
  });

  it('flags a point whose departments are recorded but deliberately not counted', () => {
    // An uncounted department that existed at this date makes the figure a floor rather
    // than a count. Drawing it as a real dip would invent a reorganisation.
    const points = deriveTimeline('ES', [
      parseCabinet(
        makeCabinetInput({
          left_office: null,
          entities: [
            makeMinistry(),
            makeMinistry({
              id: 'ES-2023-vivienda',
              order: 2,
              policy_areas: [],
              counts_as_ministry: false,
              exclusion_reason: 'superseded_within_cabinet',
              valid_to: '2024-06-30',
            }),
            makePresidency({ order: 3 }),
          ],
        }),
      ),
    ]);
    expect(points[0]?.reconstructed).toBe(false);
    expect(points[1]?.reconstructed).toBe(true);
  });
});

describe('csv output', () => {
  it('quotes separators, quotes and newlines', () => {
    const csv = toCsv(
      [{ name: 'Ministerio de Agricultura, Pesca y Alimentación', note: 'a "quoted" word\nand a break' }],
      ['name', 'note'],
    );
    expect(csv).toBe(
      'name,note\n"Ministerio de Agricultura, Pesca y Alimentación","a ""quoted"" word\nand a break"\n',
    );
  });

  it('joins list values with a pipe so a cell never contains a bare comma list', () => {
    expect(toCsv([{ areas: ['agriculture', 'fisheries'] }], ['areas'])).toBe(
      'areas\nagriculture | fisheries\n',
    );
  });
});
