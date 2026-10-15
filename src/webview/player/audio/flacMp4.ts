import { encodeStreamInfo } from './flacEncoder';

/** Builds fragmented MP4 (ISO-BMFF) carrying FLAC, as Chromium's MSE accepts it. */

const TRACK_ID = 1;
const MOVIE_TIMESCALE = 1000;
const STREAMINFO_BLOCK_TYPE = 0;
const LAST_METADATA_BLOCK = 0x80;
const TKHD_ENABLED_IN_MOVIE_IN_PREVIEW = 0x000007;
const TFHD_DEFAULT_BASE_IS_MOOF = 0x020000;
const TRUN_DATA_OFFSET_DURATION_SIZE = 0x000301;
const FULL_VOLUME = 0x0100;
/** The 16.16 sample rate field only fits rates below 65536; FLAC then relies on STREAMINFO. */
const MAX_SAMPLE_ENTRY_RATE = 0xffff;
const UNITY_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

type BoxContent = Uint8Array | number[];

function concat(parts: BoxContent[]): Uint8Array {
  const arrays = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)));
  const output = new Uint8Array(arrays.reduce((size, array) => size + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u64(value: number): number[] {
  const high = Math.floor(value / 2 ** 32);
  return [...u32(high), ...u32(value % 2 ** 32)];
}

function box(type: string, ...content: BoxContent[]): Uint8Array {
  const payload = concat(content);
  const header = [...u32(payload.length + 8), ...Array.from(type, (char) => char.charCodeAt(0))];
  return concat([header, payload]);
}

function fullBox(
  type: string,
  version: number,
  flags: number,
  ...content: BoxContent[]
): Uint8Array {
  return box(type, [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff], ...content);
}

function sampleEntry(sampleRate: number, channelCount: number): Uint8Array {
  const dfLa = fullBox(
    'dfLa',
    0,
    0,
    [LAST_METADATA_BLOCK | STREAMINFO_BLOCK_TYPE, 0, 0, 34],
    encodeStreamInfo(sampleRate, channelCount),
  );
  return box(
    'fLaC',
    [0, 0, 0, 0, 0, 0, ...u16(1)],
    [0, 0, 0, 0, 0, 0, 0, 0],
    u16(channelCount),
    u16(16),
    [0, 0, 0, 0],
    u32(sampleRate > MAX_SAMPLE_ENTRY_RATE ? 0 : sampleRate * 0x10000),
    dfLa,
  );
}

export function flacInitSegment(sampleRate: number, channelCount: number): Uint8Array {
  const ftyp = box(
    'ftyp',
    Array.from('iso6', (c) => c.charCodeAt(0)),
    u32(0),
    [...Array.from('iso6mp41', (c) => c.charCodeAt(0))],
  );
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0),
    u32(0),
    u32(MOVIE_TIMESCALE),
    u32(0),
    u32(0x00010000),
    u16(0x0100),
    new Array<number>(10).fill(0),
    UNITY_MATRIX.flatMap(u32),
    new Array<number>(24).fill(0),
    u32(TRACK_ID + 1),
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    TKHD_ENABLED_IN_MOVIE_IN_PREVIEW,
    u32(0),
    u32(0),
    u32(TRACK_ID),
    u32(0),
    u32(0),
    new Array<number>(8).fill(0),
    u16(0),
    u16(0),
    u16(FULL_VOLUME),
    u16(0),
    UNITY_MATRIX.flatMap(u32),
    u32(0),
    u32(0),
  );
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(sampleRate), u32(0), u16(0x55c4), u16(0));
  const hdlr = fullBox(
    'hdlr',
    0,
    0,
    u32(0),
    Array.from('soun', (c) => c.charCodeAt(0)),
    new Array<number>(12).fill(0),
    [...Array.from('SoundHandler', (c) => c.charCodeAt(0)), 0],
  );
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
  const stbl = box(
    'stbl',
    fullBox('stsd', 0, 0, u32(1), sampleEntry(sampleRate, channelCount)),
    fullBox('stts', 0, 0, u32(0)),
    fullBox('stsc', 0, 0, u32(0)),
    fullBox('stsz', 0, 0, u32(0), u32(0)),
    fullBox('stco', 0, 0, u32(0)),
  );
  const minf = box('minf', fullBox('smhd', 0, 0, u16(0), u16(0)), dinf, stbl);
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
  const mvex = box('mvex', fullBox('trex', 0, 0, u32(TRACK_ID), u32(1), u32(0), u32(0), u32(0)));
  return concat([ftyp, box('moov', mvhd, trak, mvex)]);
}

export interface FlacFragmentSample {
  bytes: Uint8Array;
  duration: number;
}

/** One `moof` + `mdat` pair; `decodeTime` is in samples (the track timescale is the sample rate). */
export function flacMediaSegment(
  sequenceNumber: number,
  decodeTime: number,
  samples: FlacFragmentSample[],
): Uint8Array {
  const buildMoof = (dataOffset: number) =>
    box(
      'moof',
      fullBox('mfhd', 0, 0, u32(sequenceNumber)),
      box(
        'traf',
        fullBox('tfhd', 0, TFHD_DEFAULT_BASE_IS_MOOF, u32(TRACK_ID)),
        fullBox('tfdt', 1, 0, u64(decodeTime)),
        fullBox(
          'trun',
          0,
          TRUN_DATA_OFFSET_DURATION_SIZE,
          u32(samples.length),
          u32(dataOffset),
          samples.flatMap((sample) => [...u32(sample.duration), ...u32(sample.bytes.length)]),
        ),
      ),
    );
  const moofSize = buildMoof(0).length;
  const mdat = box('mdat', ...samples.map((sample) => sample.bytes));
  return concat([buildMoof(moofSize + 8), mdat]);
}
