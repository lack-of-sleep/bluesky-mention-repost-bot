import { BskyAgent, AppBskyFeedDefs } from '@atproto/api';
import 'dotenv/config';

const agent = new BskyAgent({ service: 'https://bsky.social' });

const handled = new Set<string>();

async function runBot() {
  await agent.login({
    identifier: process.env.BSKY_USERNAME || '',
    password: process.env.BSKY_PASSWORD || '',
  });

  const notifs = await agent.getNotifications();

  for (const notif of notifs.data.notifications) {
    if (notif.reason !== 'mention') continue;

    const thread = await agent.getPostThread({ uri: notif.uri });
    if (!thread.success) continue;

    let root = thread.data.thread as AppBskyFeedDefs.ThreadViewPost;
    while (root.parent && AppBskyFeedDefs.isThreadViewPost(root.parent)) {
      root = root.parent;
    }

    if (handled.has(root.post.uri)) continue;

    await agent.repost(root.post.uri, root.post.cid);
    console.log(`✅ Reposted: ${root.post.uri}`);
    handled.add(root.post.uri);
  }
}

runBot().catch(console.error);
