const START_TAG = /^#EXT-X-START:.*(?:\r?\n|$)/gm;
const UNMUTED_SEGMENT = /-unmuted\.ts(?=\r?$)/gm;

/**
 * Twitch marks media playlists with `#EXT-X-START:TIME-OFFSET=0`, which makes
 * hls.js begin at the oldest segment, ~20 s behind live and out of sync with
 * chat. Without the tag hls.js starts at its configured live sync position.
 */
export function stripStartOffset(playlist: string): string {
  return playlist.replace(START_TAG, '');
}

/**
 * Videos list segments that were muted for copyrighted music as `N-unmuted.ts`,
 * but the CDN only serves them as `N-muted.ts`; twitch.tv's player rewrites them too.
 */
export function restoreMutedSegments(playlist: string): string {
  return playlist.replace(UNMUTED_SEGMENT, '-muted.ts');
}
