import { z } from 'zod';

/**
 * Shared primitives for every data file.
 *
 * Dates are plain `YYYY-MM-DD` strings, never `Date` objects: the `yaml` parser's
 * default (YAML 1.2 core) schema leaves them as strings, and keeping them that way
 * means a value survives the round trip YAML -> validation -> JSON unchanged, with no
 * timezone drift. `scripts/lib/load.ts` asserts this assumption at load time.
 */
export const IsoDate = z
  .iso
  .date()
  .describe('Calendar date as YYYY-MM-DD');

export const Iso2 = z
  .string()
  .regex(/^[A-Z]{2}$/, 'must be an upper-case ISO 3166-1 alpha-2 code, e.g. ES');

export const Iso3 = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be an upper-case ISO 3166-1 alpha-3 code, e.g. ESP');

export const LangCode = z
  .string()
  .regex(/^[a-z]{2,3}$/, 'must be a lower-case ISO 639 language code, e.g. es');

export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lower-case kebab-case slug');

/**
 * Identifier in a controlled vocabulary: `snake_case`.
 *
 * Deliberately a different shape from `Slug`. Taxonomy ids (`foreign_affairs`,
 * `official_gazette`) are read as compound words, while record ids (`boe-2023-24512`)
 * are read as path-like handles; keeping the two alphabets distinct means a
 * copy-and-paste between the two fails validation instead of creating a dangling
 * reference that looks plausible.
 */
export const TaxonomyId = z
  .string()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'must be a lower-case snake_case taxonomy id');

/** Identifier of a source, unique within its cabinet file. */
export const SourceId = Slug;

/** Identifier of a government entity: `<ISO2>-<year the cabinet took office>-<slug>`. */
export const EntityId = z
  .string()
  .regex(
    /^[A-Z]{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must look like ES-2023-agricultura',
  );

/** Identifier of a cabinet: `<ISO2>-<date it took office>`. */
export const CabinetId = z
  .string()
  .regex(/^[A-Z]{2}-\d{4}-\d{2}-\d{2}$/, 'must look like ES-2023-11-21');

/**
 * Free text that the site renders in both languages. Nothing user-visible may be
 * monolingual — the site is bilingual from the first commit, so a Spanish-only note
 * would silently degrade the English pages.
 */
export const Bilingual = z.strictObject({
  en: z.string().min(1),
  es: z.string().min(1),
});
export type Bilingual = z.infer<typeof Bilingual>;

/**
 * Where a translated name comes from. `official` means the government itself
 * publishes that name in that language; anything else is our rendering and the site
 * labels it as such. Without this distinction a bilingual site quietly passes its own
 * translations off as official nomenclature.
 */
export const NAME_PROVENANCES = ['official', 'translated', 'transliterated'] as const;
export const NameProvenance = z.enum(NAME_PROVENANCES);
export type NameProvenance = (typeof NAME_PROVENANCES)[number];
