import * as vscode from 'vscode';
import type { VideoInfo } from '../../shared/protocol';
import { formatDuration, formatRelativeTime } from '../../shared/timeFormat';
import { listChannelVideos } from '../twitch/videos';

const MAX_VIDEOS = 50;

export interface VideoOwner {
  login: string;
  displayName: string;
}

interface VideoItem extends vscode.QuickPickItem {
  video: VideoInfo;
}

function videoItem(video: VideoInfo): VideoItem {
  const when = video.isRecording
    ? vscode.l10n.t('Still live')
    : formatRelativeTime(video.createdAt, vscode.env.language);
  const views = vscode.l10n.t('{0} views', video.viewCount.toLocaleString(vscode.env.language));
  return {
    label: video.title || vscode.l10n.t('Untitled broadcast'),
    description: `${when} · ${formatDuration(video.durationSeconds)}`,
    detail: video.game ? `${video.game} · ${views}` : views,
    iconPath: new vscode.ThemeIcon(video.isRecording ? 'broadcast' : 'device-camera-video'),
    video,
  };
}

/** Lists a channel's past broadcasts and resolves with the one to play. */
export function pickVideo(owner: VideoOwner): Promise<VideoInfo | undefined> {
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick<VideoItem>();
    pick.title = vscode.l10n.t('Past broadcasts of {0}', owner.displayName);
    pick.placeholder = vscode.l10n.t('Loading videos…');
    pick.matchOnDescription = true;
    pick.matchOnDetail = true;
    pick.busy = true;

    listChannelVideos(owner.login, MAX_VIDEOS)
      .then((videos) => {
        pick.items = videos.map(videoItem);
        pick.placeholder = videos.length
          ? vscode.l10n.t('Pick a video to watch')
          : vscode.l10n.t('No past broadcasts.');
      })
      .catch(() => {
        pick.placeholder = vscode.l10n.t(
          'Could not reach Twitch. Check your connection and try again.',
        );
      })
      .finally(() => {
        pick.busy = false;
      });

    pick.onDidAccept(() => {
      const video = pick.selectedItems[0]?.video;
      if (video) {
        resolve(video);
        pick.hide();
      }
    });
    pick.onDidHide(() => {
      resolve(undefined);
      pick.dispose();
    });
    pick.show();
  });
}
