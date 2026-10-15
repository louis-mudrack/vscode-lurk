/**
 * Returns planar PCM of exactly `length` frames: missing frames are filled with
 * silence at the start (decoder priming), surplus frames are dropped from the start.
 */
export function fitToLength(channels: Float32Array[], length: number): Float32Array[] {
  const target = Math.max(0, length);
  return channels.map((samples) => {
    if (samples.length === target) {
      return samples;
    }
    const fitted = new Float32Array(target);
    if (samples.length < target) {
      fitted.set(samples, target - samples.length);
    } else {
      fitted.set(samples.subarray(samples.length - target));
    }
    return fitted;
  });
}
