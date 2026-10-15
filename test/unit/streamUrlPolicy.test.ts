import { describe, expect, it } from 'vitest';
import { isAllowedStreamUrl } from '../../src/host/net/streamUrlPolicy';

describe('isAllowedStreamUrl', () => {
  it('allows Twitch playlist and segment hosts over https', () => {
    expect(isAllowedStreamUrl('https://usher.ttvnw.net/api/channel/hls/x.m3u8')).toBe(true);
    expect(isAllowedStreamUrl('https://use23.playlist.ttvnw.net/v1/playlist/abc.m3u8')).toBe(true);
    expect(isAllowedStreamUrl('https://a.j.cloudfront.hls.ttvnw.net/v1/segment/x.ts')).toBe(true);
    expect(isAllowedStreamUrl('https://4d1a8e.rufio.hls.live-video.net/v1/segment/x')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isAllowedStreamUrl('http://usher.ttvnw.net/x')).toBe(false);
    expect(isAllowedStreamUrl('https://evil.example/ttvnw.net')).toBe(false);
    expect(isAllowedStreamUrl('https://ttvnw.net.evil.example/x')).toBe(false);
    expect(isAllowedStreamUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedStreamUrl('not a url')).toBe(false);
  });
});
