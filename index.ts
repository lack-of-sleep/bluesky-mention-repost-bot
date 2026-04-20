import { BskyAgent, AppBskyFeedDefs } from '@atproto/api';
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const HISTORY_FILE = 'repost-history.json';
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

const agent = new BskyAgent({ service: 'https://bsky.social' });
const handled = new Set<string>();

function loadHistory(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveHistory(history: Record<string, number>) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function repostWithRefresh(
  post: AppBskyFeedDefs.PostView,
  history: Record<string, number>,
) {
  if (handled.has(post.uri)) return;
  handled.add(post.uri);

  const lastRepostedAt = history[post.uri];
  const now = Date.now();

  if (post.viewer?.repost) {
    if (lastRepostedAt && now - lastRepostedAt < COOLDOWN_MS) {
      console.log(`⏳ Skipped (3-day cooldown): ${post.uri}`);
      return;
    }
    await agent.deleteRepost(post.viewer.repost);
  }

  await agent.repost(post.uri, post.cid);
  history[post.uri] = now;
  console.log(`✅ Reposted: ${post.uri}`);
}

async function runBot() {
  await agent.login({
    identifier: process.env.BSKY_USERNAME || '',
    password: process.env.BSKY_PASSWORD || '',
  });

  const history = loadHistory();
  const notifs = await agent.listNotifications();
  const newNotifs = notifs.data.notifications.filter(n => !n.isRead);

  for (const notif of newNotifs) {
    if (notif.reason === 'mention') {
      const thread = await agent.getPostThread({ uri: notif.uri });
      if (!thread.success) continue;

      let root = thread.data.thread as AppBskyFeedDefs.ThreadViewPost;
      while (root.parent && AppBskyFeedDefs.isThreadViewPost(root.parent)) {
        root = root.parent;
      }

      await repostWithRefresh(root.post, history);

    } else if (notif.reason === 'quote') {
      if (!notif.reasonSubject) continue;

      const result = await agent.getPosts({ uris: [notif.reasonSubject] });
      if (!result.success || result.data.posts.length === 0) continue;

      await repostWithRefresh(result.data.posts[0], history);
    }
  }

  if (newNotifs.length > 0) {
    await agent.updateSeenNotifications();
  }

  saveHistory(history);
}

runBot().catch(console.error);
