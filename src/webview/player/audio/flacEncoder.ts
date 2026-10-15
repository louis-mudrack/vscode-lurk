import { crc16, crc8 } from './crc';

/**
 * Minimal FLAC encoder: 16-bit VERBATIM subframes (no compression). The output
 * only travels from the webview into Chromium's own FLAC decoder, so size does
 * not matter and the encoder stays trivial and cheap.
 */

export const FLAC_MAX_BLOCK_SIZE = 4096;
export const FLAC_MIN_BLOCK_SIZE = 16;
const BITS_PER_SAMPLE = 16;
const SAMPLE_SCALE = 0x7fff;
const SYNC_VARIABLE_BLOCKSIZE = [0xff, 0xf9];
const BLOCK_SIZE_16BIT_AT_END = 0b0111;
const SAMPLE_SIZE_16BIT = 0b100;
const SUBFRAME_VERBATIM = 0b00000010;
const SAMPLE_RATE_CODES = new Map([
  [88_200, 0b0001],
  [176_400, 0b0010],
  [192_000, 0b0011],
  [8_000, 0b0100],
  [16_000, 0b0101],
  [22_050, 0b0110],
  [24_000, 0b0111],
  [32_000, 0b1000],
  [44_100, 0b1001],
  [48_000, 0b1010],
  [96_000, 0b1011],
]);
const SAMPLE_RATE_16BIT_HZ_AT_END = 0b1101;
const STREAMINFO_LENGTH = 34;
const TWO_POW_32 = 2 ** 32;

/** FLAC's UTF-8-like variable length integer (up to 36 bits) used for sample numbers. */
export function encodeCodedNumber(value: number): number[] {
  if (value < 0x80) {
    return [value];
  }
  let length = 2;
  while (length < 7 && value >= 2 ** (5 * length + 1)) {
    length++;
  }
  const bytes: number[] = [];
  let remaining = value;
  for (let i = 0; i < length - 1; i++) {
    bytes.unshift(0x80 | (remaining % 64));
    remaining = Math.floor(remaining / 64);
  }
  const prefix = (0xff << (8 - length)) & 0xff;
  bytes.unshift(prefix | remaining);
  return bytes;
}

/** The 34-byte STREAMINFO metadata block body. */
export function encodeStreamInfo(sampleRate: number, channelCount: number): Uint8Array {
  const info = new Uint8Array(STREAMINFO_LENGTH);
  const data = new DataView(info.buffer);
  data.setUint16(0, FLAC_MIN_BLOCK_SIZE);
  data.setUint16(2, FLAC_MAX_BLOCK_SIZE);
  // Bytes 4–9: min/max frame size, 0 = unknown.
  // 20 bits sample rate, 3 bits channels-1, 5 bits bits-per-sample-1, 36 bits total samples (0).
  info[10] = (sampleRate >> 12) & 0xff;
  info[11] = (sampleRate >> 4) & 0xff;
  info[12] =
    ((sampleRate & 0x0f) << 4) | (((channelCount - 1) & 0x07) << 1) | ((BITS_PER_SAMPLE - 1) >> 4);
  info[13] = ((BITS_PER_SAMPLE - 1) & 0x0f) << 4;
  return info;
}

function toInt16(sample: number): number {
  const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
  return Math.round(clamped * SAMPLE_SCALE);
}

function frameHeader(
  blockSize: number,
  sampleRate: number,
  channelCount: number,
  firstSample: number,
): number[] {
  const rateCode = SAMPLE_RATE_CODES.get(sampleRate) ?? SAMPLE_RATE_16BIT_HZ_AT_END;
  const header = [
    ...SYNC_VARIABLE_BLOCKSIZE,
    (BLOCK_SIZE_16BIT_AT_END << 4) | rateCode,
    ((channelCount - 1) << 4) | (SAMPLE_SIZE_16BIT << 1),
    ...encodeCodedNumber(firstSample),
    ((blockSize - 1) >> 8) & 0xff,
    (blockSize - 1) & 0xff,
  ];
  if (rateCode === SAMPLE_RATE_16BIT_HZ_AT_END) {
    header.push((sampleRate >> 8) & 0xff, sampleRate & 0xff);
  }
  header.push(crc8(Uint8Array.from(header)));
  return header;
}

function encodeFrame(
  channels: Float32Array[],
  offset: number,
  blockSize: number,
  sampleRate: number,
  firstSample: number,
): Uint8Array {
  const header = frameHeader(blockSize, sampleRate, channels.length, firstSample);
  const subframeSize = 1 + blockSize * 2;
  const frame = new Uint8Array(header.length + channels.length * subframeSize + 2);
  const data = new DataView(frame.buffer);
  frame.set(header);
  let cursor = header.length;
  for (const channel of channels) {
    frame[cursor++] = SUBFRAME_VERBATIM;
    for (let i = 0; i < blockSize; i++) {
      data.setInt16(cursor, toInt16(channel[offset + i] ?? 0));
      cursor += 2;
    }
  }
  data.setUint16(cursor, crc16(frame, cursor));
  return frame;
}

export interface EncodedFlacFrame {
  bytes: Uint8Array;
  sampleCount: number;
}

/**
 * Encodes planar PCM into FLAC frames using the variable-blocksize strategy,
 * where each frame header carries the stream position of its first sample.
 */
export function encodeFlacFrames(
  channels: Float32Array[],
  sampleRate: number,
  firstSampleNumber: number,
): EncodedFlacFrame[] {
  const total = channels[0]?.length ?? 0;
  const frames: EncodedFlacFrame[] = [];
  for (let offset = 0; offset < total; offset += FLAC_MAX_BLOCK_SIZE) {
    const blockSize = Math.min(FLAC_MAX_BLOCK_SIZE, total - offset);
    const position = (firstSampleNumber + offset) % (TWO_POW_32 * 16);
    frames.push({
      bytes: encodeFrame(channels, offset, blockSize, sampleRate, position),
      sampleCount: blockSize,
    });
  }
  return frames;
}
