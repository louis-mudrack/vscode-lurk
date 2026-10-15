/** Tiny ISO-BMFF writer for building test fixtures. */
export type Bytes = number[] | Uint8Array;

export function concat(...parts: Bytes[]): Uint8Array {
  const arrays = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)));
  const out = new Uint8Array(arrays.reduce((size, array) => size + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

export const u16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
export const u32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
export const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

export function box(type: string, ...content: Bytes[]): Uint8Array {
  const payload = concat(...content);
  return concat(u32(payload.length + 8), ascii(type), payload);
}

export function fullBox(type: string, version: number, flags: number, ...content: Bytes[]) {
  return box(type, [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff], ...content);
}
