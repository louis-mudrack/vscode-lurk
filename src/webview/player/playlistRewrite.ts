const START_TAG = /^#EXT-X-START:.*(?:\r?\n|$)/gm;

/**
 * Twitch marks media playlists with `#EXT-X-START:TIME-OFFSET=0`, which makes
 * hls.js begin at the oldest segment, ~20 s behind live and out of sync with
 * chat. Without the tag hls.js starts at its configured live sync position.
 */
export function stripStartOffset(playlist: string): string {
  return playlist.replace(START_TAG, '');
}
