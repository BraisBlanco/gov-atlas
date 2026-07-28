/**
 * The flag emoji for an ISO 3166-1 alpha-2 code.
 *
 * Derived, not stored: a flag is a pure function of the code, so there is nothing to curate,
 * nothing to cite and nothing to keep in sync when a country is added. Each letter maps to
 * its regional indicator symbol (U+1F1E6 for A) and the pair is rendered as one glyph by the
 * platform's emoji font.
 *
 * Returns an empty string for anything that is not two ASCII letters, so a malformed code
 * shows the country name alone rather than two stray letter-boxes.
 *
 * Renders as the two letters in a box on platforms whose emoji font carries no flags — most
 * visibly Windows. That is why the flag is decorative here: the country name always sits
 * beside it and carries the meaning on its own.
 */
export function flagEmoji(iso2: string): string {
  const code = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}
