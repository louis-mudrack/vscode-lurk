import { describe, expect, it } from 'vitest';
import {
  containsInitSegment,
  parseAudioInitSegment,
  parseAudioMediaSegment,
} from '../../src/webview/player/audio/fmp4';
import { ascii, box, concat, fullBox, u16, u32 } from './mp4Boxes';

const AUDIO_SPECIFIC_CONFIG = [0x11, 0x90];

function aacInitSegment(): Uint8Array {
  const esds = fullBox(
    'esds',
    0,
    0,
    [0x03, 25, ...u16(2), 0],
    [0x04, 17, 0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0)],
    [0x05, 2, ...AUDIO_SPECIFIC_CONFIG],
  );
  const mp4a = box(
    'mp4a',
    [0, 0, 0, 0, 0, 0, ...u16(1)],
    new Array<number>(8).fill(0),
    u16(2),
    u16(16),
    [0, 0, 0, 0],
    u32(48_000 * 0x10000),
    esds,
  );
  const stbl = box('stbl', fullBox('stsd', 0, 0, u32(1), mp4a));
  const mdia = box(
    'mdia',
    fullBox('mdhd', 0, 0, u32(0), u32(0), u32(48_000), u32(0), u16(0x55c4), u16(0)),
    fullBox('hdlr', 0, 0, u32(0), ascii('soun'), new Array<number>(12).fill(0), [0]),
    box('minf', stbl),
  );
  const tkhd = fullBox('tkhd', 0, 7, u32(0), u32(0), u32(1), new Array<number>(68).fill(0));
  const mvex = box('mvex', fullBox('trex', 0, 0, u32(1), u32(1), u32(1024), u32(0), u32(0)));
  return concat(box('ftyp', ascii('isom')), box('moov', box('trak', tkhd, mdia), mvex));
}

function aacMediaSegment(decodeTime: number, frames: number[][]): Uint8Array {
  const moof = (dataOffset: number) =>
    box(
      'moof',
      fullBox('mfhd', 0, 0, u32(1)),
      box(
        'traf',
        fullBox('tfhd', 0, 0x020000, u32(1)),
        fullBox('tfdt', 1, 0, u32(0), u32(decodeTime)),
        fullBox(
          'trun',
          0,
          0x000201,
          u32(frames.length),
          u32(dataOffset),
          frames.flatMap((frame) => u32(frame.length)),
        ),
      ),
    );
  const size = moof(0).length;
  return concat(moof(size + 8), box('mdat', ...frames));
}

describe('fmp4 audio parsing', () => {
  it('reads timescale, AudioSpecificConfig and trex defaults from the init segment', () => {
    const init = aacInitSegment();
    expect(containsInitSegment(init)).toBe(true);
    expect(parseAudioInitSegment(init)).toEqual({
      trackId: 1,
      timescale: 48_000,
      audioSpecificConfig: Uint8Array.from(AUDIO_SPECIFIC_CONFIG),
      channelCount: 2,
      sampleRate: 48_000,
      defaultSampleDuration: 1024,
    });
  });

  it('extracts samples with decode times, using trex durations when trun has none', () => {
    const segment = aacMediaSegment(96_000, [
      [1, 2, 3],
      [4, 5],
    ]);
    expect(containsInitSegment(segment)).toBe(false);
    const samples = parseAudioMediaSegment(segment, { defaultSampleDuration: 1024 });
    expect(samples.map((sample) => [sample.decodeTime, sample.duration, [...sample.data]])).toEqual(
      [
        [96_000, 1024, [1, 2, 3]],
        [97_024, 1024, [4, 5]],
      ],
    );
  });

  it('returns nothing for segments without a moof', () => {
    expect(parseAudioMediaSegment(box('mdat', [1, 2]), { defaultSampleDuration: 1024 })).toEqual(
      [],
    );
    expect(parseAudioInitSegment(box('free', [0]))).toBeUndefined();
  });
});
