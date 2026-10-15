import { describe, expect, it } from 'vitest';
import { readableNameColor } from '../../src/webview/chat/nameColor';

describe('readableNameColor', () => {
  it('keeps colors that are already readable', () => {
    expect(readableNameColor('#FF69B4', 'x', true)).toBe('#ff69b4');
  });

  it('lightens dark colors on dark themes and darkens light colors on light themes', () => {
    expect(readableNameColor('#0000FF', 'x', true)).not.toBe('#0000ff');
    expect(readableNameColor('#FFFF00', 'x', false)).not.toBe('#ffff00');
  });

  it('falls back to a stable default color per user', () => {
    expect(readableNameColor('', 'lena', true)).toBe(readableNameColor('', 'lena', true));
    expect(readableNameColor('', 'lena', true)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
