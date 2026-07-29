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
  /**
   * Why no snapshot exists, when the publisher is what prevents one.
   *
   * The archive requirement assumes every official document can be archived by
   * somebody. Malta disproves it: every Maltese government host sits behind bot
   * management that serves the archive crawler a challenge page instead of the
   * gazette, so the requirement as first written made the country permanently
   * uncoverable — not because the source is weak, but because its publisher blocks
   * robots.
   *
   * Setting this downgrades `source-archive-required` from an error to the warning
   * `source-archive-unavailable`, which keeps the gap in every validation run and in
   * the published warning count rather than hiding it. It is not a way to defer
   * archiving: write what was tried and what happened, because the next curator's
   * decision about whether to retry rests on it. Leaving it null keeps the error, and
   * setting it alongside an `archive_url` is itself an error — a stale exemption would
   * outlive the problem it documents.
   */
  archive_unavailable_reason: z.string().min(40).nullable().default(null),

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
