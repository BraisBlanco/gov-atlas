import { CabinetSchema, type Cabinet, type CabinetInput, type EntityInput } from '../../data/schema/cabinet.schema.ts';
import { CountrySchema, type Country, type CountryInput } from '../../data/schema/country.schema.ts';
import type { SourceInput } from '../../data/schema/source.schema.ts';
import type { Dataset } from '../lib/load.ts';
import type { Taxonomy } from '../../data/schema/taxonomy.schema.ts';

/**
 * A minimal but *valid* dataset, used as the baseline for the negative tests: each test
 * breaks exactly one thing and asserts that the matching rule fires. That only proves
 * anything if the untouched baseline is clean, which `rules.test.ts` checks first.
 */

export const TODAY = '2026-07-27';

export function makeSource(overrides: Partial<SourceInput> = {}): SourceInput {
  return {
    id: 'gazette-1',
    tier: 1,
    type: 'official_gazette',
    publisher: 'Boletín Oficial del Estado',
    title: 'Real Decreto de reestructuración de los departamentos ministeriales',
    url: 'https://www.boe.es/eli/es/rd/2023/11/20/829',
    archive_url: 'https://web.archive.org/web/20240101000000/https://www.boe.es/eli/es/rd/2023/11/20/829',
    lang: 'es',
    published: '2023-11-21',
    accessed: '2026-07-01',
    quote: 'La Administración General del Estado se estructura en los siguientes departamentos ministeriales.',
    ...overrides,
  };
}

export function makeMinistry(overrides: Partial<EntityInput> = {}): EntityInput {
  return {
    id: 'ES-2023-agricultura',
    order: 1,
    name_original: 'Ministerio de Agricultura, Pesca y Alimentación',
    name_en: 'Ministry of Agriculture, Fisheries and Food',
    name_es: 'Ministerio de Agricultura, Pesca y Alimentación',
    name_en_provenance: 'translated',
    name_es_provenance: 'official',
    head_title_original: 'Ministro/a',
    head_title_en: 'Minister',
    has_cabinet_seat: true,
    policy_areas: ['agriculture', 'fisheries', 'food_safety'],
    counts_as_ministry: true,
    sources: ['gazette-1'],
    ...overrides,
  };
}

export function makePresidency(overrides: Partial<EntityInput> = {}): EntityInput {
  return {
    id: 'ES-2023-presidencia',
    order: 2,
    name_original: 'Presidencia del Gobierno',
    name_en: 'Office of the Prime Minister',
    name_es: 'Presidencia del Gobierno',
    name_en_provenance: 'translated',
    name_es_provenance: 'official',
    head_title_original: 'Presidente/a del Gobierno',
    head_title_en: 'Prime Minister',
    has_cabinet_seat: true,
    policy_areas: [],
    counts_as_ministry: false,
    exclusion_reason: 'head_of_government_office',
    sources: ['gazette-1'],
    ...overrides,
  };
}

export function makeCabinetInput(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    country: 'ES',
    cabinet_id: 'ES-2023-11-21',
    cabinet_name_original: 'Gobierno de España, XV Legislatura',
    cabinet_name_en: 'Government of Spain, 15th legislature',
    cabinet_name_es: 'Gobierno de España, XV Legislatura',
    head_of_government_title_original: 'Presidente del Gobierno',
    head_of_government_title_en: 'Prime Minister',
    took_office: '2023-11-21',
    left_office: null,
    sources: [makeSource()],
    entities: [makeMinistry(), makePresidency()],
    ...overrides,
  };
}

export function makeCountryInput(overrides: Partial<CountryInput> = {}): CountryInput {
  return {
    iso2: 'ES',
    iso3: 'ESP',
    name_en: 'Spain',
    name_es: 'España',
    name_original: 'España',
    official_name_original: 'Reino de España',
    continent: 'europe',
    region: 'southern_europe',
    eu_member_since: '1986-01-01',
    government_system: 'parliamentary_monarchy',
    official_languages: ['es'],
    population: {
      value: 48_797_875,
      year: 2024,
      source: makeSource({
        id: 'population-1',
        tier: 3,
        type: 'statistical_office',
        publisher: 'Instituto Nacional de Estadística',
        title: 'Cifras de población a 1 de enero de 2024',
        url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=56934',
        archive_url: null,
        published: '2024-06-20',
        quote: 'La población residente en España se situó en 48.797.875 personas a 1 de enero de 2024.',
      }),
    },
    ...overrides,
  };
}

export function parseCabinet(input: CabinetInput): Cabinet {
  return CabinetSchema.parse(input);
}

export function parseCountry(input: CountryInput): Country {
  return CountrySchema.parse(input);
}

/** Wraps parsed values in the shape `checkDataset` expects, with the real file names. */
export function makeDataset(options: {
  taxonomy: Taxonomy;
  countries?: CountryInput[];
  cabinets?: CabinetInput[];
}): Dataset {
  const countries = (options.countries ?? [makeCountryInput()]).map((input) => {
    const value = parseCountry(input);
    return { file: `data/countries/${value.iso2}.yml`, value, issues: [] };
  });
  const cabinets = (options.cabinets ?? [makeCabinetInput()]).map((input) => {
    const value = parseCabinet(input);
    return { file: `data/cabinets/${value.cabinet_id}.yml`, value, issues: [] };
  });

  return { taxonomy: options.taxonomy, countries, cabinets, issues: [] };
}
