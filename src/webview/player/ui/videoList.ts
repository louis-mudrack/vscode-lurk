import * as l10n from '@vscode/l10n';
import type { VideoInfo } from '../../../shared/protocol';
import { formatDuration, formatRelativeTime } from '../../../shared/timeFormat';
import { el } from '../../common/dom';
import { uiLanguage } from '../../common/l10n';
import { textButton } from './statusScreen';

export interface VideoListOptions {
  videos: Promise<VideoInfo[]>;
  limit: number;
  onOpen: (id: string) => void;
  onShowAll: () => void;
}

function videoMeta(video: VideoInfo): string {
  const parts = [
    video.isRecording ? l10n.t('Still live') : formatRelativeTime(video.createdAt, uiLanguage()),
  ];
  if (video.game) {
    parts.push(video.game);
  }
  return parts.join(' · ');
}

function videoItem(video: VideoInfo, onOpen: (id: string) => void): HTMLLIElement {
  const title = video.title || l10n.t('Untitled broadcast');
  const button = el('button', { className: 'video-item', title, attributes: { type: 'button' } }, [
    el('span', { className: 'video-thumb' }, [
      el('img', { attributes: { src: video.thumbnailUrl, alt: '', loading: 'lazy' } }),
      el('span', { className: 'video-duration', text: formatDuration(video.durationSeconds) }),
    ]),
    el('span', { className: 'video-text' }, [
      el('span', { className: 'video-title', text: title }),
      el('span', { className: 'video-meta', text: videoMeta(video) }),
    ]),
  ]);
  button.addEventListener('click', () => onOpen(video.id));
  return el('li', {}, [button]);
}

function placeholder(text: string): HTMLLIElement {
  return el('li', { className: 'video-placeholder', text });
}

/** The channel's latest past broadcasts, loaded in the background. */
export function createVideoList(options: VideoListOptions): HTMLElement {
  const list = el('ul', { className: 'video-list' }, [placeholder(l10n.t('Loading videos…'))]);
  const section = el('section', { className: 'video-section' }, [
    el('div', { className: 'section-label', text: l10n.t('Past broadcasts') }),
    list,
  ]);
  void options.videos.then((videos) => {
    if (videos.length === 0) {
      list.replaceChildren(placeholder(l10n.t('No past broadcasts.')));
      return;
    }
    list.replaceChildren(
      ...videos.slice(0, options.limit).map((v) => videoItem(v, options.onOpen)),
    );
    if (videos.length > options.limit) {
      section.append(textButton(l10n.t('All videos…'), options.onShowAll));
    }
  });
  return section;
}
