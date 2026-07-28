import { describe, expect, it } from 'vitest';

import { flagEmoji } from './flag.ts';

describe('flagEmoji', () => {
  it('maps a code to its pair of regional indicator symbols', () => {
    expect(flagEmoji('ES')).toBe('\u{1F1EA}\u{1F1F8}');
    expect(flagEmoji('DE')).toBe('\u{1F1E9}\u{1F1EA}');
    expect(flagEmoji('AD')).toBe('\u{1F1E6}\u{1F1E9}');
  });

  it('accepts a lowercase code', () => {
    expect(flagEmoji('fr')).toBe(flagEmoji('FR'));
  });

  it('is two code points, so a country page can size it as one glyph', () => {
    expect([...flagEmoji('IE')]).toHaveLength(2);
  });

  it('yields nothing for anything that is not two ASCII letters', () => {
    expect(flagEmoji('')).toBe('');
    expect(flagEmoji('E')).toBe('');
    expect(flagEmoji('ESP')).toBe('');
    expect(flagEmoji('E1')).toBe('');
    expect(flagEmoji('ñ')).toBe('');
  });
});
