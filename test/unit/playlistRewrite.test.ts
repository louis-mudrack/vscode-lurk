import { describe, expect, it } from 'vitest';
import { stripStartOffset } from '../../src/webview/player/playlistRewrite';

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
