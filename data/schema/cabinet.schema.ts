import { z } from 'zod';
import {
  Bilingual,
  CabinetId,
  EntityId,
  IsoDate,
  Iso2,
  NameProvenance,
  SourceId,
  TaxonomyId,
} from './common.ts';
import { SourceSchema } from './source.schema.ts';

/**
 * A unit of central government, counted or not.
 *
 * The type is called *entity* rather than *ministry* on purpose. Excluded bodies — the
 * prime minister's office, ministers without portfolio, junior ministers — are recorded
 * here too, with `counts_as_ministry: false` and a reason. That is what lets the site
 * answer "why do you say 22 when Wikipedia says 23?" without anyone re-doing the
 * research, and it is why the published counts are reproducible from the raw files.
 */
export const EntitySchema = z.strictObject({
  id: EntityId,

  /** Position in the official listing (precedence order in the gazette). 1-based. */
  order: z.int().min(1),

  /** Official name in the country's own language, exactly as the source spells it. */
  name_original: z.string().min(2),
  /** Official acronym, if the government uses one (e.g. MAPA, BMWK). */
  abbreviation_original: z.string().nullable().default(null),

  name_en: z.string().min(2),
  name_es: z.string().min(2),
  name_en_provenance: NameProvenance,
  name_es_provenance: NameProvenance,

  /** Title of the person in charge, in the original language (e.g. "Ministro/a"). */
  head_title_original: z.string().min(2),
  /** English rendering of that title, for the comparison views. */
  head_title_en: z.string().min(2),

  /**
   * Does the head of this entity sit in the cabinet? Drives `cabinet_seats_count`,
   * which is reported separately from `ministries_count` and is usually a different
   * number: heads of government hold a seat without a portfolio, and one minister can
   * hold two departments.
   */
  has_cabinet_seat: z.boolean(),
  /** Cabinet-rank heads of this entity. Almost always 1; 2 for genuine co-ministers. */
  head_count: z.int().min(0).default(1),
  /**
   * Other entities headed by the same person. Deduplicated when counting seats, so a
   * minister holding two portfolios is one seat and two ministries. Must be symmetric —
   * rule `shared-head-symmetry` enforces it.
   */
  shared_head_with: z.array(EntityId).default([]),

  /** Policy areas from data/taxonomy/policy-areas.yml, most prominent first. */
  policy_areas: z.array(TaxonomyId).default([]),

  counts_as_ministry: z.boolean(),
  /**
   * Required when `counts_as_ministry` is false, forbidden when it is true. Must be an
   * id from data/taxonomy/exclusion-reasons.yml.
   */
  exclusion_reason: TaxonomyId.nullable().default(null),

  /** Defaults to the cabinet's `took_office` when null. Set it for mid-term changes. */
  valid_from: IsoDate.nullable().default(null),
  /** Null means still in place at the end of the cabinet's term. */
  valid_to: IsoDate.nullable().default(null),

  /** Official website of the department. */
  url: z.url().nullable().default(null),

  /** Ids of sources in the same file. At least one — enforced here and in validate.ts. */
  sources: z.array(SourceId).min(1),

  /** Curator's note shown on the country page when the case is not clear-cut. */
  note: Bilingual.nullable().default(null),
});

export type Entity = z.infer<typeof EntitySchema>;
export type EntityInput = z.input<typeof EntitySchema>;

/**
 * One government's structure at one point in time. Self-contained by design: entities
 * *and* their sources live in the same file, so a curator can add a country by creating
 * a single new file and touching nothing that another curator owns.
 */
export const CabinetSchema = z.strictObject({
  country: Iso2,
  cabinet_id: CabinetId,

  cabinet_name_original: z.string().min(2),
  cabinet_name_en: z.string().min(2),
  cabinet_name_es: z.string().min(2),

  head_of_government_title_original: z.string().min(2),
  head_of_government_title_en: z.string().min(2),

  took_office: IsoDate,
  /** Null means this is the cabinet currently in office. At most one per country. */
  left_office: IsoDate.nullable(),

  sources: z.array(SourceSchema).min(1),
  entities: z.array(EntitySchema).min(1),

  /**
   * Country-specific caveats, surfaced verbatim on the country page and in chart
   * footnotes. This is where a contested count gets explained in the open — e.g.
   * "counted as 15; 16 if the Federal Chancellery is treated as a ministry".
   */
  methodology_notes: z.array(Bilingual).default([]),
});

export type Cabinet = z.infer<typeof CabinetSchema>;
export type CabinetInput = z.input<typeof CabinetSchema>;
