function buildTable(polynomial: number, width: 8 | 16): Uint16Array {
  const topBit = 1 << (width - 1);
  const mask = (1 << width) - 1;
  const table = new Uint16Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let crc = byte << (width - 8);
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & topBit ? (crc << 1) ^ polynomial : crc << 1;
    }
    table[byte] = crc & mask;
  }
  return table;
}

const CRC8_TABLE = buildTable(0x07, 8);
const CRC16_TABLE = buildTable(0x8005, 16);

/** CRC-8 as used by FLAC frame headers (polynomial x^8 + x^2 + x + 1). */
export function crc8(bytes: Uint8Array, end = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    crc = CRC8_TABLE[crc ^ (bytes[i] ?? 0)] ?? 0;
  }
  return crc;
}

/** CRC-16 as used by FLAC frame footers (polynomial x^16 + x^15 + x^2 + 1). */
export function crc16(bytes: Uint8Array, end = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    crc = ((crc << 8) & 0xffff) ^ (CRC16_TABLE[(crc >> 8) ^ (bytes[i] ?? 0)] ?? 0);
  }
  return crc;
}
