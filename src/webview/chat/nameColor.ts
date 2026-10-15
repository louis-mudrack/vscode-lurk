/** Twitch's palette for users who never picked a name color. */
const DEFAULT_COLORS = [
  '#FF0000',
  '#0000FF',
  '#008000',
  '#B22222',
  '#FF7F50',
  '#9ACD32',
  '#FF4500',
  '#2E8B57',
  '#DAA520',
  '#D2691E',
  '#5F9EA0',
  '#1E90FF',
  '#FF69B4',
  '#8A2BE2',
  '#00FF7F',
];
const MIN_LUMINANCE_ON_DARK = 0.25;
const MAX_LUMINANCE_ON_LIGHT = 0.45;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function mix(color: Rgb, target: number, amount: number): Rgb {
  return color.map((channel) => channel + (target - channel) * amount) as Rgb;
}

function defaultColorFor(login: string): string {
  let hash = 0;
  for (const char of login) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length] ?? '#1E90FF';
}

/** The user's chosen color, nudged lighter or darker until it is readable on the theme. */
export function readableNameColor(color: string, login: string, darkTheme: boolean): string {
  let rgb = parseHex(color) ?? parseHex(defaultColorFor(login));
  if (!rgb) {
    return 'inherit';
  }
  for (let step = 0; step < 10; step++) {
    const lum = luminance(rgb);
    if (darkTheme ? lum >= MIN_LUMINANCE_ON_DARK : lum <= MAX_LUMINANCE_ON_LIGHT) {
      break;
    }
    rgb = mix(rgb, darkTheme ? 255 : 0, 0.2);
  }
  return toHex(rgb);
}
