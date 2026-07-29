import { beforeAll, describe, expect, it } from 'vitest';

import { checkDataset } from '../lib/rules.ts';
import { loadTaxonomy } from '../lib/load.ts';
import type { Taxonomy } from '../../data/schema/taxonomy.schema.ts';
import type { Issue } from '../lib/issues.ts';
import {
  TODAY,
  makeCabinetInput,
  makeCountryInput,
  makeDataset,
  makeMinistry,
  makePresidency,
  makeSource,
} from './fixtures.ts';

/**
 * These are the tests that matter most in the repo.
 *
 * The project's central promise is that every published figure is traceable to a source.
 * That promise is kept by `scripts/lib/rules.ts` and by nothing else — so each rule gets
 * a test that breaks the data on purpose and demands the rule fire. Without them the
 * validator could silently degrade into a no-op and every chart would still render.
 */

let taxonomy: Taxonomy;

beforeAll(async () => {
  const loaded = await loadTaxonomy();
  expect(loaded.issues).toEqual([]);
  expect(loaded.taxonomy).toBeDefined();
  taxonomy = loaded.taxonomy as Taxonomy;
});

function rulesFrom(issues: Issue[]): string[] {
  return issues.map((issue) => issue.rule);
}

function check(options: Parameters<typeof makeDataset>[0]): Issue[] {
  return checkDataset(makeDataset(options), { today: TODAY });
}

describe('the real taxonomy files', () => {
  it('are internally consistent', () => {
    // Also guards the shipped vocabularies: a duplicate id or an area pointing at a
    // group that no longer exists would silently detach ministries from the heatmap.
    const issues = checkDataset(
      { taxonomy, countries: [], cabinets: [], issues: [] },
      { today: TODAY },
    );
    expect(issues).toEqual([]);
  });
});

describe('a valid dataset', () => {
  it('produces no issues at all', () => {
    expect(check({ taxonomy })).toEqual([]);
  });
});

describe('sourcing rules', () => {
  it('rejects a citation that does not resolve', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ sources: ['does-not-exist'] }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-source-unresolved');
  });

  it('requires an archived snapshot for legal instruments and official pages', () => {
    for (const tier of [1, 2] as const) {
      const issues = check({
        taxonomy,
        cabinets: [
          makeCabinetInput({
            sources: [
              makeSource({
                tier,
                type: tier === 1 ? 'official_gazette' : 'government_website',
                archive_url: null,
              }),
            ],
          }),
        ],
      });
      expect(rulesFrom(issues)).toContain('source-archive-required');
    }
  });

  it('accepts a missing snapshot only when the publisher is documented as blocking it', () => {
    // The exemption has to stay countable rather than silent, so it demotes the error to a
    // warning instead of clearing it. A gap nobody can see is the failure mode here.
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          sources: [
            makeSource({
              archive_url: null,
              archive_unavailable_reason:
                'Every Maltese government host serves the archive crawler a challenge page ' +
                'instead of the gazette; Save Page Now returned "Job failed" to every request.',
            }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).not.toContain('source-archive-required');
    const declared = issues.filter((issue) => issue.rule === 'source-archive-unavailable');
    expect(declared).toHaveLength(1);
    expect(declared[0]?.severity).toBe('warning');
    expect(declared[0]?.message).toContain('challenge page');
  });

  it('rejects an exemption left behind once a snapshot exists', () => {
    // Otherwise the note outlives the problem it documents and the next curator trusts it.
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          sources: [
            makeSource({
              archive_unavailable_reason:
                'Left over from when the publisher blocked the crawler, which it no longer does.',
            }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('source-archive-exemption-stale');
  });

  it('catches the live URL being pasted into archive_url', () => {
    const url = 'https://www.boe.es/eli/es/rd/2023/11/20/829';
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ sources: [makeSource({ url, archive_url: url })] })],
    });
    expect(rulesFrom(issues)).toContain('source-archive-same-as-url');
  });

  it('rejects an archive_url that is not on a web archive', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          sources: [makeSource({ archive_url: 'https://example.gov/copy-of-the-decree' })],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('source-archive-host-unknown');
  });

  it('will not let a portal page claim tier 1', () => {
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ sources: [makeSource({ tier: 1, type: 'government_website' })] })],
    });
    expect(rulesFrom(issues)).toContain('source-tier-type-mismatch');
  });

  it('rejects an access date in the future', () => {
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ sources: [makeSource({ accessed: '2099-01-01' })] })],
    });
    expect(rulesFrom(issues)).toContain('source-accessed-future');
  });

  it('rejects a document published after it was allegedly read', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ sources: [makeSource({ published: '2026-07-02', accessed: '2026-07-01' })] }),
      ],
    });
    expect(rulesFrom(issues)).toContain('source-published-after-accessed');
  });

  it('flags a declared source that nothing cites', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          sources: [makeSource(), makeSource({ id: 'gazette-2' })],
        }),
      ],
    });
    const unused = issues.filter((issue) => issue.rule === 'source-unused');
    expect(unused).toHaveLength(1);
    expect(unused[0]?.severity).toBe('warning');
  });

  it('also validates the source attached to a population figure', () => {
    const country = makeCountryInput();
    const issues = check({
      taxonomy,
      countries: [
        {
          ...country,
          population: {
            ...country.population,
            source: makeSource({ id: 'population-1', tier: 1, type: 'official_gazette', archive_url: null }),
          },
        },
      ],
    });
    expect(rulesFrom(issues)).toContain('source-archive-required');
  });
});

describe('counting rules', () => {
  it('requires a reason for every entity left out of the count', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry(), makePresidency({ exclusion_reason: null })],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('exclusion-reason-required');
  });

  it('rejects an exclusion reason on a counted ministry', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ exclusion_reason: 'agency_or_public_body' }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('exclusion-reason-forbidden');
  });

  it('rejects an exclusion reason outside the vocabulary', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry(), makePresidency({ exclusion_reason: 'we_felt_like_it' })],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('exclusion-reason-unknown');
  });

  it('rejects a policy area outside the vocabulary', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ policy_areas: ['agriculture', 'vibes'] }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('policy-area-unknown');
  });

  it('rejects a counted ministry with no policy area', () => {
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ entities: [makeMinistry({ policy_areas: [] }), makePresidency()] })],
    });
    expect(rulesFrom(issues)).toContain('policy-area-required');
  });

  it('rejects a duplicated policy area', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ policy_areas: ['agriculture', 'agriculture'] }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('policy-area-duplicate');
  });
});

describe('identity and cross-file rules', () => {
  it('requires the cabinet id to be derived from country and date', () => {
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ cabinet_id: 'ES-2023-11-22' })],
    });
    expect(rulesFrom(issues)).toContain('cabinet-id-mismatch');
  });

  it('rejects a cabinet for a country with no country file', () => {
    const issues = check({
      taxonomy,
      countries: [],
      cabinets: [makeCabinetInput()],
    });
    expect(rulesFrom(issues)).toContain('country-file-missing');
  });

  it('rejects entity ids that do not carry their country and cabinet year', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ id: 'PT-2019-agricultura' }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-id-country-prefix');
    expect(rulesFrom(issues)).toContain('entity-id-year-prefix');
  });

  it('rejects the same entity id in two files', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ left_office: '2024-01-01' }),
        makeCabinetInput({
          cabinet_id: 'ES-2024-01-02',
          took_office: '2024-01-02',
          entities: [
            makeMinistry({ id: 'ES-2023-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-duplicate-id');
  });

  it('allows only one cabinet to be in office', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput(),
        makeCabinetInput({
          cabinet_id: 'ES-2024-01-02',
          took_office: '2024-01-02',
          entities: [
            makeMinistry({ id: 'ES-2024-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('multiple-current-cabinets');
  });

  it('rejects two cabinets of one country covering the same date', () => {
    // The failure this prevents: a historical series that counts one country's ministries
    // twice over the overlap, which reads as a spike rather than as a modelling error.
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ left_office: '2024-01-05' }),
        makeCabinetInput({
          cabinet_id: 'ES-2024-01-05',
          took_office: '2024-01-05',
          left_office: null,
          entities: [
            makeMinistry({ id: 'ES-2024-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('cabinet-terms-overlap');
  });

  it('treats a later cabinet after an open-ended one as an overlap', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ left_office: null }),
        makeCabinetInput({
          cabinet_id: 'ES-2024-01-02',
          took_office: '2024-01-02',
          left_office: '2024-06-01',
          entities: [
            makeMinistry({ id: 'ES-2024-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('cabinet-terms-overlap');
  });

  it('accepts consecutive cabinets that meet exactly', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ left_office: '2024-01-01' }),
        makeCabinetInput({
          cabinet_id: 'ES-2024-01-02',
          took_office: '2024-01-02',
          entities: [
            makeMinistry({ id: 'ES-2024-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).not.toContain('cabinet-terms-overlap');
    expect(rulesFrom(issues)).not.toContain('cabinet-term-gap');
  });

  it('warns about an uncovered stretch between two cabinets', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({ left_office: '2024-01-01' }),
        makeCabinetInput({
          cabinet_id: 'ES-2024-03-01',
          took_office: '2024-03-01',
          entities: [
            makeMinistry({ id: 'ES-2024-agricultura' }),
            makePresidency({ id: 'ES-2024-presidencia' }),
          ],
        }),
      ],
    });
    const gap = issues.filter((issue) => issue.rule === 'cabinet-term-gap');
    expect(gap).toHaveLength(1);
    expect(gap[0]?.severity).toBe('warning');
    expect(gap[0]?.message).toContain('2024-01-02');
    expect(gap[0]?.message).toContain('2024-02-29');
  });

  it('rejects duplicate listing order', () => {
    const issues = check({
      taxonomy,
      cabinets: [makeCabinetInput({ entities: [makeMinistry({ order: 1 }), makePresidency({ order: 1 })] })],
    });
    expect(rulesFrom(issues)).toContain('entity-order-duplicate');
  });

  it('warns when a country has no cabinet yet', () => {
    const issues = check({ taxonomy, cabinets: [] });
    const gap = issues.filter((issue) => issue.rule === 'country-without-cabinet');
    expect(gap).toHaveLength(1);
    expect(gap[0]?.severity).toBe('warning');
  });
});

describe('shared-head rules', () => {
  it('requires the link to be declared on both sides', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [
            makeMinistry({ shared_head_with: ['ES-2023-presidencia'] }),
            makePresidency(),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('shared-head-symmetry');
  });

  it('rejects a link to an entity that is not in the file', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ shared_head_with: ['ES-2023-ghost'] }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('shared-head-unresolved');
  });

  it('rejects an entity sharing a head with itself', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ shared_head_with: ['ES-2023-agricultura'] }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('shared-head-self');
  });

  it('accepts a symmetric pair', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [
            makeMinistry({ shared_head_with: ['ES-2023-presidencia'] }),
            makePresidency({ shared_head_with: ['ES-2023-agricultura'] }),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).not.toContain('shared-head-symmetry');
  });
});

describe('validity-window rules', () => {
  it('rejects a department that predates its own cabinet', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [makeMinistry({ valid_from: '2020-01-01' }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-validity-before-cabinet');
  });

  it('rejects an inverted validity window', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          entities: [
            makeMinistry({ valid_from: '2024-06-01', valid_to: '2024-01-01' }),
            makePresidency(),
          ],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-validity-order');
  });

  it('rejects a department outliving its cabinet', () => {
    const issues = check({
      taxonomy,
      cabinets: [
        makeCabinetInput({
          left_office: '2024-06-01',
          entities: [makeMinistry({ valid_to: '2025-01-01' }), makePresidency()],
        }),
      ],
    });
    expect(rulesFrom(issues)).toContain('entity-validity-after-cabinet');
  });
});
