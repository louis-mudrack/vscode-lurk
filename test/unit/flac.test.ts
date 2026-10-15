import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc16, crc8 } from '../../src/webview/player/audio/crc';
import {
  encodeCodedNumber,
  encodeFlacFrames,
  encodeStreamInfo,
  FLAC_MAX_BLOCK_SIZE,
} from '../../src/webview/player/audio/flacEncoder';
import { flacInitSegment, flacMediaSegment } from '../../src/webview/player/audio/flacMp4';
import { parseAudioMediaSegment, readBoxes } from '../../src/webview/player/audio/fmp4';
import { fitToLength } from '../../src/webview/player/audio/pcm';

const CHECK_INPUT = new TextEncoder().encode('123456789');

function sine(frequency: number, length: number, rate = 48_000): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * frequency * i) / rate),
  );
}

/** Decodes one VERBATIM-only frame written by our encoder. */
function decodeVerbatimFrame(frame: Uint8Array, channelCount: number, headerLength: number) {
  const data = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const blockSize = data.getUint16(headerLength - 3) + 1;
  const channels: number[][] = [];
  let cursor = headerLength;
  for (let channel = 0; channel < channelCount; channel++) {
    expect(frame[cursor++]).toBe(0x02);
    const samples: number[] = [];
    for (let i = 0; i < blockSize; i++, cursor += 2) {
      samples.push(data.getInt16(cursor));
    }
    channels.push(samples);
  }
  return { blockSize, channels, end: cursor };
}

describe('FLAC CRCs', () => {
  it('match the standard check values', () => {
    expect(crc8(CHECK_INPUT)).toBe(0xf4);
    expect(crc16(CHECK_INPUT)).toBe(0xfee8);
  });
});

describe('encodeCodedNumber', () => {
  it.each([
    [0, [0x00]],
    [0x7f, [0x7f]],
    [0x80, [0xc2, 0x80]],
    [0x7ff, [0xdf, 0xbf]],
    [0x800, [0xe0, 0xa0, 0x80]],
    [2 ** 36 - 1, [0xfe, 0xbf, 0xbf, 0xbf, 0xbf, 0xbf, 0xbf]],
  ])('encodes %d', (value, bytes) => {
    expect(encodeCodedNumber(value)).toEqual(bytes);
  });
});

describe('encodeStreamInfo', () => {
  it('packs sample rate, channels and bit depth', () => {
    const info = encodeStreamInfo(48_000, 2);
    expect(info).toHaveLength(34);
    const rate = (info[10]! << 12) | (info[11]! << 4) | (info[12]! >> 4);
    expect(rate).toBe(48_000);
    expect(((info[12]! >> 1) & 0x07) + 1).toBe(2);
    expect((((info[12]! & 1) << 4) | (info[13]! >> 4)) + 1).toBe(16);
  });
});

describe('encodeFlacFrames', () => {
  it('splits PCM into blocks whose header and footer CRCs verify and whose samples round-trip', () => {
    const left = sine(440, FLAC_MAX_BLOCK_SIZE + 1000);
    const right = sine(660, FLAC_MAX_BLOCK_SIZE + 1000);
    const frames = encodeFlacFrames([left, right], 48_000, 0);
    expect(frames.map((frame) => frame.sampleCount)).toEqual([FLAC_MAX_BLOCK_SIZE, 1000]);

    const [first] = frames;
    if (!first) {
      throw new Error('no frame');
    }
    const bytes = first.bytes;
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xf9]);
    const headerLength = 4 + 1 + 2 + 1;
    expect(crc8(bytes, headerLength - 1)).toBe(bytes[headerLength - 1]);
    const decoded = decodeVerbatimFrame(bytes, 2, headerLength);
    expect(decoded.blockSize).toBe(FLAC_MAX_BLOCK_SIZE);
    expect(decoded.channels[0]?.[100]).toBe(Math.round(left[100]! * 0x7fff));
    expect(decoded.channels[1]?.[100]).toBe(Math.round(right[100]! * 0x7fff));
    const footer = (bytes[decoded.end]! << 8) | bytes[decoded.end + 1]!;
    expect(crc16(bytes, decoded.end)).toBe(footer);
    expect(decoded.end + 2).toBe(bytes.length);
  });

  it('clamps out-of-range samples', () => {
    const [frame] = encodeFlacFrames([Float32Array.from([2, -2])], 48_000, 0);
    const data = new DataView(frame!.bytes.buffer);
    expect(data.getInt16(9)).toBe(0x7fff);
    expect(data.getInt16(11)).toBe(-0x7fff);
  });
});

describe('FLAC in fragmented MP4', () => {
  it('writes an init segment with a fLaC sample entry and STREAMINFO', () => {
    const init = flacInitSegment(48_000, 2);
    expect(readBoxes(init).map((entry) => entry.type)).toEqual(['ftyp', 'moov']);
    const text = String.fromCharCode(...init);
    expect(text).toContain('fLaC');
    expect(text).toContain('dfLa');
    expect(text).toContain('trex');
  });

  it('writes fragments whose samples land at the right decode time', () => {
    const frames = encodeFlacFrames([sine(440, 6000)], 48_000, 96_000);
    const segment = flacMediaSegment(
      7,
      96_000,
      frames.map((frame) => ({ bytes: frame.bytes, duration: frame.sampleCount })),
    );
    const samples = parseAudioMediaSegment(segment, { defaultSampleDuration: 0 });
    expect(samples.map((sample) => sample.decodeTime)).toEqual([
      96_000,
      96_000 + FLAC_MAX_BLOCK_SIZE,
    ]);
    expect(samples.map((sample) => sample.data.length)).toEqual(frames.map((f) => f.bytes.length));
    expect(samples[1]?.data).toEqual(frames[1]?.bytes);
  });

  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

  it.skipIf(!hasFfmpeg)('decodes with ffmpeg back to the original PCM', () => {
    const rate = 48_000;
    const length = 1024 * 94;
    const left = sine(440, length);
    const right = sine(660, length);
    const frames = encodeFlacFrames([left, right], rate, 0);
    const file = new Uint8Array([
      ...flacInitSegment(rate, 2),
      ...flacMediaSegment(
        1,
        0,
        frames.map((frame) => ({ bytes: frame.bytes, duration: frame.sampleCount })),
      ),
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'flac-test-'));
    writeFileSync(join(dir, 'in.mp4'), file);
    const result = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      join(dir, 'in.mp4'),
      '-f',
      's16le',
      '-y',
      join(dir, 'out.pcm'),
    ]);
    expect(result.stderr.toString()).toBe('');
    const pcm = new Int16Array(readFileSync(join(dir, 'out.pcm')).buffer.slice(0));
    expect(pcm.length).toBe(length * 2);
    for (let i = 0; i < length; i += 997) {
      expect(Math.abs(pcm[2 * i]! - Math.round(left[i]! * 0x7fff))).toBeLessThanOrEqual(1);
      expect(Math.abs(pcm[2 * i + 1]! - Math.round(right[i]! * 0x7fff))).toBeLessThanOrEqual(1);
    }
  });
});

describe('fitToLength', () => {
  it('pads missing samples with leading silence and trims surplus from the start', () => {
    expect([...fitToLength([Float32Array.from([1, 2])], 4)[0]!]).toEqual([0, 0, 1, 2]);
    expect([...fitToLength([Float32Array.from([1, 2, 3])], 2)[0]!]).toEqual([2, 3]);
    const same = Float32Array.from([1]);
    expect(fitToLength([same], 1)[0]).toBe(same);
  });
});
