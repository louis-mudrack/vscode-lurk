import type * as vscode from 'vscode';

const STORAGE_KEY = 'twitchPlayer.videoProgress';
const MAX_ENTRIES = 50;
/** Positions this close to the start or the end are not worth resuming from. */
const MIN_RESUME_SECONDS = 30;
const FINISHED_MARGIN_SECONDS = 60;

interface SavedPosition {
  id: string;
  position: number;
}

/** Remembers where the user stopped watching recent videos. */
export class VideoProgress {
  constructor(private readonly state: vscode.Memento) {}

  resumePosition(id: string): number | undefined {
    return this.entries().find((entry) => entry.id === id)?.position;
  }

  async save(id: string, position: number, duration: number): Promise<void> {
    const others = this.entries().filter((entry) => entry.id !== id);
    const finished = Number.isFinite(duration) && position > duration - FINISHED_MARGIN_SECONDS;
    const worthResuming = position >= MIN_RESUME_SECONDS && !finished;
    const entries = worthResuming ? [{ id, position: Math.floor(position) }, ...others] : others;
    await this.state.update(STORAGE_KEY, entries.slice(0, MAX_ENTRIES));
  }

  private entries(): SavedPosition[] {
    return this.state.get<SavedPosition[]>(STORAGE_KEY, []);
  }
}
