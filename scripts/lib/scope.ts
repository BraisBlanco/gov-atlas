/**
 * The v1 target scope, and the curation batches it is split into.
 *
 * Kept here rather than in data/ because it describes the *project's* ambition, not a
 * fact about the world: a country missing from data/ is a gap in our work, and the
 * coverage report can only say so if it knows what it was aiming at.
 *
 * Batches are grouped by administrative-vocabulary affinity, so one curator reuses the
 * same terminology across their whole batch instead of relearning it per country.
 */

export interface Batch {
  id: string;
  label: string;
  countries: string[];
}

export const CURATION_BATCHES: Batch[] = [
  { id: 'A0', label: 'Reference country (M0)', countries: ['ES'] },
  { id: 'A1', label: 'Germanic and Benelux', countries: ['DE', 'AT', 'NL', 'BE', 'LU'] },
  { id: 'A2', label: 'Nordic and Baltic', countries: ['SE', 'DK', 'FI', 'EE', 'LV', 'LT'] },
  { id: 'A3', label: 'Mediterranean', countries: ['PT', 'IT', 'GR', 'MT', 'CY'] },
  { id: 'A4', label: 'Central Europe', countries: ['PL', 'CZ', 'SK', 'HU', 'SI'] },
  { id: 'A5', label: 'South-eastern Europe, France and Ireland', countries: ['RO', 'BG', 'HR', 'IE', 'FR'] },
];

export const EU27: string[] = CURATION_BATCHES.flatMap((batch) => batch.countries).sort();

export function batchOf(iso2: string): Batch | undefined {
  return CURATION_BATCHES.find((batch) => batch.countries.includes(iso2));
}
