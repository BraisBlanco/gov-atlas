import { z } from 'zod';
import { Iso2, Iso3, IsoDate, LangCode } from './common.ts';
import { SourceSchema } from './source.schema.ts';

/** Kept broad so the dataset can leave Europe without a schema change. */
export const CONTINENTS = [
  'africa',
  'asia',
  'europe',
  'north_america',
  'oceania',
  'south_america',
] as const;

export const REGIONS = [
  'northern_europe',
  'western_europe',
  'southern_europe',
  'eastern_europe',
  'central_europe',
  'south_eastern_europe',
] as const;

export const GOVERNMENT_SYSTEMS = [
  'parliamentary_republic',
  'semi_presidential_republic',
  'presidential_republic',
  'parliamentary_monarchy',
  'directorial_republic',
  'other',
] as const;

/**
 * A population figure with its own citation.
 *
 * Published on the country page as context for reading a cabinet's size, never as a
 * denominator: no view divides by it. It is a published datum all the same, so it carries
 * a source like everything else — a number a reader sees is a number a reader can trace.
 */
export const PopulationSchema = z.strictObject({
  value: z.int().positive(),
  /** Reference year of the figure. */
  year: z.int().min(1900).max(2100),
  source: SourceSchema,
});

export const CountrySchema = z.strictObject({
  iso2: Iso2,
  iso3: Iso3,

  name_en: z.string().min(2),
  name_es: z.string().min(2),
  /** Short-form name in the country's main official language. */
  name_original: z.string().min(2),
  /** Full official name, e.g. "Reino de España". */
  official_name_original: z.string().min(2),

  continent: z.enum(CONTINENTS),
  region: z.enum(REGIONS),
  eu_member_since: IsoDate.nullable().default(null),
  government_system: z.enum(GOVERNMENT_SYSTEMS),
  official_languages: z.array(LangCode).min(1),

  population: PopulationSchema,
});

export type Country = z.infer<typeof CountrySchema>;
export type CountryInput = z.input<typeof CountrySchema>;
