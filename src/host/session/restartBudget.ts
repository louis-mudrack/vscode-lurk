/** Allows a few playback restarts per time window so a broken stream cannot loop forever. */
export class RestartBudget {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRestarts: number,
    private readonly windowMs: number,
  ) {}

  reset(): void {
    this.timestamps = [];
  }

  tryConsume(now = Date.now()): boolean {
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
    if (this.timestamps.length >= this.maxRestarts) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}
