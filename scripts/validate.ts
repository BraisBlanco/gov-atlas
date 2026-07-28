/**
 * The gate.
 *
 * Run by CI on every pull request. An unsourced ministry, a citation that does not
 * resolve, an unarchived legal instrument or an unexplained exclusion fails the build —
 * which is the only reason "every datum has a source" is still true at country 27 rather
 * than being an aspiration in a README.
 *
 * Usage:
 *   npm run validate
 *   npm run validate -- --strict     # warnings fail too
 *   GOV_ATLAS_TODAY=2026-07-27 npm run validate
 */
import { loadDataset, valuesOf } from './lib/load.ts';
import { checkDataset } from './lib/rules.ts';
import { countBySeverity, formatIssues } from './lib/issues.ts';

const strict = process.argv.includes('--strict');
const today = process.env.GOV_ATLAS_TODAY ?? new Date().toISOString().slice(0, 10);

const dataset = await loadDataset();
const issues = [...dataset.issues, ...checkDataset(dataset, { today })];
const { errors, warnings } = countBySeverity(issues);

const countries = valuesOf(dataset.countries).length;
const cabinets = valuesOf(dataset.cabinets).length;

if (issues.length > 0) {
  console.log(formatIssues(issues));
  console.log('');
}

console.log(
  `Checked ${countries} country file(s) and ${cabinets} cabinet file(s) as of ${today}.`,
);
console.log(`${errors} error(s), ${warnings} warning(s).`);

if (errors > 0) {
  console.log('\nValidation failed. Nothing is published until every error is fixed.');
  process.exitCode = 1;
} else if (strict && warnings > 0) {
  console.log('\nValidation failed under --strict because warnings are present.');
  process.exitCode = 1;
} else {
  console.log('\nValidation passed.');
}
