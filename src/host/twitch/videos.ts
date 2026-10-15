import type { ChannelInfo, VideoInfo } from '../../shared/protocol';
import { gqlQuery } from './gqlClient';

export interface VideoLookup {
  channel: ChannelInfo;
  video: VideoInfo;
}

interface VideoNode {
  id: string;
  title: string | null;
  lengthSeconds: number;
  createdAt: string;
  viewCount: number | null;
  previewThumbnailURL: string;
  status: string;
  game: { displayName: string } | null;
}

interface OwnerNode {
  id: string;
  login: string;
  displayName: string;
  profileImageURL: string;
}

const VIDEO_FIELDS = `id title lengthSeconds createdAt viewCount status
  previewThumbnailURL(width: 320, height: 180) game { displayName }`;

const VIDEO_QUERY = `query VideoLookup($id: ID!) {
  video(id: $id) {
    ${VIDEO_FIELDS}
    owner { id login displayName profileImageURL(width: 70) }
  }
}`;

const CHANNEL_VIDEOS_QUERY = `query ChannelVideos($login: String!, $first: Int!) {
  user(login: $login) {
    videos(first: $first, type: ARCHIVE, sort: TIME) { edges { node { ${VIDEO_FIELDS} } } }
  }
}`;

const RECORDING_STATUS = 'RECORDING';
const DEFAULT_VIDEO_COUNT = 20;

function toVideoInfo(node: VideoNode): VideoInfo {
  return {
    id: node.id,
    title: node.title ?? '',
    game: node.game?.displayName ?? null,
    durationSeconds: node.lengthSeconds,
    createdAt: node.createdAt,
    thumbnailUrl: node.previewThumbnailURL,
    viewCount: node.viewCount ?? 0,
    isRecording: node.status === RECORDING_STATUS,
  };
}

export async function lookupVideo(id: string): Promise<VideoLookup | null> {
  const { video } = await gqlQuery<{ video: (VideoNode & { owner: OwnerNode | null }) | null }>(
    VIDEO_QUERY,
    { id },
  );
  if (!video?.owner) {
    return null;
  }
  const { owner } = video;
  return {
    channel: {
      id: owner.id,
      login: owner.login,
      displayName: owner.displayName,
      profileImageUrl: owner.profileImageURL,
    },
    video: toVideoInfo(video),
  };
}

/** The channel's past broadcasts, newest first. */
export async function listChannelVideos(
  login: string,
  count = DEFAULT_VIDEO_COUNT,
): Promise<VideoInfo[]> {
  const { user } = await gqlQuery<{
    user: { videos: { edges: { node: VideoNode }[] } | null } | null;
  }>(CHANNEL_VIDEOS_QUERY, { login, first: count });
  return user?.videos?.edges.map((edge) => toVideoInfo(edge.node)) ?? [];
}
