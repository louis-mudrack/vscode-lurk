import { describe, expect, it } from 'vitest';
import { restoreMutedSegments, stripStartOffset } from '../../src/webview/player/playlistRewrite';

describe('stripStartOffset', () => {
  it('removes EXT-X-START and keeps everything else', () => {
    const playlist =
      '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-START:TIME-OFFSET=0.000\n#EXTINF:2.000,live\nseg.ts\n';
    expect(stripStartOffset(playlist)).toBe(
      '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:2.000,live\nseg.ts\n',
    );
  });

  it('handles CRLF line endings', () => {
    expect(stripStartOffset('#EXTM3U\r\n#EXT-X-START:TIME-OFFSET=0\r\nseg.ts')).toBe(
      '#EXTM3U\r\nseg.ts',
    );
  });
});

describe('restoreMutedSegments', () => {
  it('points muted video segments at the files the CDN serves', () => {
    const playlist = '#EXTINF:10.000,\n41.ts\n#EXTINF:10.000,\n42-unmuted.ts\r\n#EXT-X-ENDLIST\n';
    expect(restoreMutedSegments(playlist)).toBe(
      '#EXTINF:10.000,\n41.ts\n#EXTINF:10.000,\n42-muted.ts\r\n#EXT-X-ENDLIST\n',
    );
  });
});
