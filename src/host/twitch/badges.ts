import type { ChatBadge } from '../../shared/protocol';
import { gqlQuery } from './gqlClient';

interface BadgeNode {
  setID: string;
  version: string;
  title: string;
  image1x: string;
  image2x: string;
}

interface BadgesQueryResult {
  badges: BadgeNode[] | null;
  user: { broadcastBadges: BadgeNode[] | null } | null;
}

const BADGES_QUERY = `query ChatBadges($channelId: ID!) {
  badges { setID version title image1x: imageURL(size: NORMAL) image2x: imageURL(size: DOUBLE) }
  user(id: $channelId) {
    broadcastBadges { setID version title image1x: imageURL(size: NORMAL) image2x: imageURL(size: DOUBLE) }
  }
}`;

/** Global badges followed by the channel's own ones, so later entries override earlier ones. */
export async function fetchChatBadges(channelId: string): Promise<ChatBadge[]> {
  const result = await gqlQuery<BadgesQueryResult>(BADGES_QUERY, { channelId });
  const nodes = [...(result.badges ?? []), ...(result.user?.broadcastBadges ?? [])];
  return nodes.map((node) => ({
    setId: node.setID,
    version: node.version,
    title: node.title,
    url1x: node.image1x,
    url2x: node.image2x,
  }));
}
