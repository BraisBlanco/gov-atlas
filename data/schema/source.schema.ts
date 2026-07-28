import { z } from 'zod';
import { IsoDate, LangCode, SourceId } from './common.ts';

export const SOURCE_TYPES = [
  'official_gazette',
  'statute',
  'government_website',
  'ministry_website',
  'parliament_document',
  'statistical_office',
  'academic',
  'press',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SourceTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type SourceTier = 1 | 2 | 3;

/**
 * A citation. Every factual claim in this dataset points at one of these.
 *
 * `quote` is deliberately mandatory and long-ish: a bare URL rots and cannot be
 * checked without re-reading the whole document, whereas a verbatim fragment lets a
 * reader confirm in seconds that the source really says what we claim it says. It is
 * the difference between a citation and a gesture at one.
 */
export const SourceSchema = z.strictObject({
  id: SourceId,
  tier: SourceTier,
  type: z.enum(SOURCE_TYPES),

  /** Body that published the document, in its own language. */
  publisher: z.string().min(2),
  /** Title of the document, in its original language. */
  title: z.string().min(4),

  url: z.url(),
  /**
   * Snapshot in a web archive. Mandatory for tiers 1 and 2 (enforced by rule
   * `source-archive-required` in scripts/validate.ts): government pages are
   * reorganised constantly, and an unarchived tier-2 citation is a dead source
   * waiting to happen.
   */
  archive_url: z.url().nullable().default(null),

  lang: LangCode,
  published: IsoDate.nullable().default(null),
  /** Date a human actually opened this URL and read it. */
  accessed: IsoDate,

  /**
   * Verbatim fragment supporting the claim, in the source's original language.
   * Do not translate it here; do not paraphrase it.
   */
  quote: z.string().min(15),

  /** Curator's remark about the source itself, e.g. a consolidated-text caveat. */
  note: z.string().nullable().default(null),
});

export type Source = z.infer<typeof SourceSchema>;
export type SourceInput = z.input<typeof SourceSchema>;
