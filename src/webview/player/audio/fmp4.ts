/**
 * Minimal ISO-BMFF (fragmented MP4) reader for the AAC audio track that hls.js
 * produces when it transmuxes MPEG-TS segments.
 */

interface Box {
  type: string;
  start: number;
  contentStart: number;
  end: number;
}

export interface AudioTrackConfig {
  trackId: number;
  timescale: number;
  audioSpecificConfig: Uint8Array;
  channelCount: number;
  sampleRate: number;
  defaultSampleDuration: number;
}

export interface AudioSample {
  /** In track timescale units. */
  decodeTime: number;
  duration: number;
  data: Uint8Array;
}

const TFHD_BASE_DATA_OFFSET = 0x000001;
const TFHD_SAMPLE_DESCRIPTION_INDEX = 0x000002;
const TFHD_DEFAULT_DURATION = 0x000008;
const TFHD_DEFAULT_SIZE = 0x000010;
const TRUN_DATA_OFFSET = 0x000001;
const TRUN_FIRST_SAMPLE_FLAGS = 0x000004;
const TRUN_SAMPLE_DURATION = 0x000100;
const TRUN_SAMPLE_SIZE = 0x000200;
const TRUN_SAMPLE_FLAGS = 0x000400;
const TRUN_SAMPLE_CTS = 0x000800;
const MP4A_SAMPLE_ENTRY_HEADER = 28;
const ES_DESCRIPTOR_TAG = 0x03;
const DECODER_CONFIG_TAG = 0x04;
const DECODER_SPECIFIC_INFO_TAG = 0x05;
const TWO_POW_32 = 2 ** 32;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function readUint64(data: DataView, offset: number): number {
  return data.getUint32(offset) * TWO_POW_32 + data.getUint32(offset + 4);
}

export function readBoxes(bytes: Uint8Array, start = 0, end = bytes.byteLength): Box[] {
  const data = view(bytes);
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = data.getUint32(offset);
    const type = readType(bytes, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) {
        break;
      }
      size = readUint64(data, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) {
      break;
    }
    boxes.push({ type, start: offset, contentStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  return readBoxes(bytes, parent.contentStart, parent.end).find((box) => box.type === type);
}

function path(bytes: Uint8Array, parent: Box, types: string[]): Box | undefined {
  let current: Box | undefined = parent;
  for (const type of types) {
    current = current && child(bytes, current, type);
  }
  return current;
}

/** Reads an MPEG-4 descriptor header and returns where its payload starts and ends. */
function readDescriptor(
  bytes: Uint8Array,
  offset: number,
): { tag: number; start: number; end: number } | undefined {
  const tag = bytes[offset];
  if (tag === undefined) {
    return undefined;
  }
  let length = 0;
  let cursor = offset + 1;
  for (let i = 0; i < 4; i++) {
    const byte = bytes[cursor++];
    if (byte === undefined) {
      return undefined;
    }
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { tag, start: cursor, end: cursor + length };
}

function readAudioSpecificConfig(bytes: Uint8Array, esds: Box): Uint8Array | undefined {
  const esDescriptor = readDescriptor(bytes, esds.contentStart + 4);
  if (esDescriptor?.tag !== ES_DESCRIPTOR_TAG) {
    return undefined;
  }
  const flags = bytes[esDescriptor.start + 2] ?? 0;
  let cursor = esDescriptor.start + 3;
  if (flags & 0x80) {
    cursor += 2;
  }
  if (flags & 0x40) {
    cursor += 1 + (bytes[cursor] ?? 0);
  }
  if (flags & 0x20) {
    cursor += 2;
  }
  const decoderConfig = readDescriptor(bytes, cursor);
  if (decoderConfig?.tag !== DECODER_CONFIG_TAG) {
    return undefined;
  }
  const specificInfo = readDescriptor(bytes, decoderConfig.start + 13);
  if (specificInfo?.tag !== DECODER_SPECIFIC_INFO_TAG) {
    return undefined;
  }
  return bytes.slice(specificInfo.start, specificInfo.end);
}

function readTimescale(bytes: Uint8Array, mdhd: Box): number {
  const data = view(bytes);
  const version = bytes[mdhd.contentStart];
  return data.getUint32(mdhd.contentStart + (version === 1 ? 20 : 12));
}

function readDefaultSampleDuration(bytes: Uint8Array, moov: Box, trackId: number): number {
  const mvex = child(bytes, moov, 'mvex');
  if (!mvex) {
    return 0;
  }
  const data = view(bytes);
  for (const trex of readBoxes(bytes, mvex.contentStart, mvex.end)) {
    if (trex.type === 'trex' && data.getUint32(trex.contentStart + 4) === trackId) {
      return data.getUint32(trex.contentStart + 12);
    }
  }
  return 0;
}

export function parseAudioInitSegment(bytes: Uint8Array): AudioTrackConfig | undefined {
  const moov = readBoxes(bytes).find((box) => box.type === 'moov');
  if (!moov) {
    return undefined;
  }
  const data = view(bytes);
  for (const trak of readBoxes(bytes, moov.contentStart, moov.end)) {
    if (trak.type !== 'trak') {
      continue;
    }
    const mdia = child(bytes, trak, 'mdia');
    const hdlr = mdia && child(bytes, mdia, 'hdlr');
    if (!mdia || !hdlr || readType(bytes, hdlr.contentStart + 8) !== 'soun') {
      continue;
    }
    const tkhd = child(bytes, trak, 'tkhd');
    const mdhd = child(bytes, mdia, 'mdhd');
    const stsd = path(bytes, mdia, ['minf', 'stbl', 'stsd']);
    if (!tkhd || !mdhd || !stsd) {
      continue;
    }
    const [mp4a] = readBoxes(bytes, stsd.contentStart + 8, stsd.end);
    if (mp4a?.type !== 'mp4a') {
      continue;
    }
    const esds = readBoxes(bytes, mp4a.contentStart + MP4A_SAMPLE_ENTRY_HEADER, mp4a.end).find(
      (box) => box.type === 'esds',
    );
    const audioSpecificConfig = esds && readAudioSpecificConfig(bytes, esds);
    if (!audioSpecificConfig) {
      continue;
    }
    const trackId = data.getUint32(tkhd.contentStart + (bytes[tkhd.contentStart] === 1 ? 20 : 12));
    return {
      trackId,
      timescale: readTimescale(bytes, mdhd),
      audioSpecificConfig,
      channelCount: data.getUint16(mp4a.contentStart + 16),
      sampleRate: data.getUint32(mp4a.contentStart + 24) / 0x10000,
      defaultSampleDuration: readDefaultSampleDuration(bytes, moov, trackId),
    };
  }
  return undefined;
}

interface TrackFragmentHeader {
  baseDataOffset: number;
  defaultDuration: number;
  defaultSize: number;
}

function readTfhd(
  bytes: Uint8Array,
  tfhd: Box,
  moofStart: number,
  trex: number,
): TrackFragmentHeader {
  const data = view(bytes);
  const flags = data.getUint32(tfhd.contentStart) & 0xffffff;
  let cursor = tfhd.contentStart + 8;
  let baseDataOffset = moofStart;
  if (flags & TFHD_BASE_DATA_OFFSET) {
    baseDataOffset = readUint64(data, cursor);
    cursor += 8;
  }
  if (flags & TFHD_SAMPLE_DESCRIPTION_INDEX) {
    cursor += 4;
  }
  let defaultDuration = trex;
  if (flags & TFHD_DEFAULT_DURATION) {
    defaultDuration = data.getUint32(cursor);
    cursor += 4;
  }
  let defaultSize = 0;
  if (flags & TFHD_DEFAULT_SIZE) {
    defaultSize = data.getUint32(cursor);
  }
  return { baseDataOffset, defaultDuration, defaultSize };
}

function readTfdt(bytes: Uint8Array, tfdt: Box | undefined): number {
  if (!tfdt) {
    return 0;
  }
  const data = view(bytes);
  return bytes[tfdt.contentStart] === 1
    ? readUint64(data, tfdt.contentStart + 4)
    : data.getUint32(tfdt.contentStart + 4);
}

function readTrun(
  bytes: Uint8Array,
  trun: Box,
  header: TrackFragmentHeader,
  firstDecodeTime: number,
): AudioSample[] {
  const data = view(bytes);
  const flags = data.getUint32(trun.contentStart) & 0xffffff;
  const sampleCount = data.getUint32(trun.contentStart + 4);
  let cursor = trun.contentStart + 8;
  let dataOffset = header.baseDataOffset;
  if (flags & TRUN_DATA_OFFSET) {
    dataOffset += data.getInt32(cursor);
    cursor += 4;
  }
  if (flags & TRUN_FIRST_SAMPLE_FLAGS) {
    cursor += 4;
  }
  const samples: AudioSample[] = [];
  let decodeTime = firstDecodeTime;
  for (let i = 0; i < sampleCount; i++) {
    let duration = header.defaultDuration;
    let size = header.defaultSize;
    if (flags & TRUN_SAMPLE_DURATION) {
      duration = data.getUint32(cursor);
      cursor += 4;
    }
    if (flags & TRUN_SAMPLE_SIZE) {
      size = data.getUint32(cursor);
      cursor += 4;
    }
    if (flags & TRUN_SAMPLE_FLAGS) {
      cursor += 4;
    }
    if (flags & TRUN_SAMPLE_CTS) {
      cursor += 4;
    }
    if (dataOffset + size > bytes.byteLength) {
      break;
    }
    samples.push({ decodeTime, duration, data: bytes.subarray(dataOffset, dataOffset + size) });
    dataOffset += size;
    decodeTime += duration;
  }
  return samples;
}

/** Extracts the samples of every `moof` in a media segment (hls.js emits one per append). */
export function parseAudioMediaSegment(
  bytes: Uint8Array,
  config: Pick<AudioTrackConfig, 'defaultSampleDuration'>,
): AudioSample[] {
  const samples: AudioSample[] = [];
  for (const moof of readBoxes(bytes)) {
    if (moof.type !== 'moof') {
      continue;
    }
    for (const traf of readBoxes(bytes, moof.contentStart, moof.end)) {
      if (traf.type !== 'traf') {
        continue;
      }
      const tfhd = child(bytes, traf, 'tfhd');
      if (!tfhd) {
        continue;
      }
      const header = readTfhd(bytes, tfhd, moof.start, config.defaultSampleDuration);
      let decodeTime = readTfdt(bytes, child(bytes, traf, 'tfdt'));
      for (const trun of readBoxes(bytes, traf.contentStart, traf.end)) {
        if (trun.type === 'trun') {
          const runSamples = readTrun(bytes, trun, header, decodeTime);
          samples.push(...runSamples);
          const last = runSamples[runSamples.length - 1];
          decodeTime = last ? last.decodeTime + last.duration : decodeTime;
        }
      }
    }
  }
  return samples;
}

export function containsInitSegment(bytes: Uint8Array): boolean {
  return readBoxes(bytes).some((box) => box.type === 'moov');
}
