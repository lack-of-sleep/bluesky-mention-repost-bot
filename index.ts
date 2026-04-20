import { BskyAgent, AppBskyFeedDefs } from '@atproto/api';
import 'dotenv/config';

const agent = new BskyAgent({ service: 'https://bsky.social' });
const handled = new Set<string>();

async function repostWithRefresh(post: AppBskyFeedDefs.PostView) {
  if (handled.has(post.uri)) return;
  handled.add(post.uri);

  if (post.viewer?.repost) {
    await agent.deleteRepost(post.viewer.repost);
  }

  await agent.repost(post.uri, post.cid);
  console.log(`✅ Reposted: ${post.uri}`);
}

async function runBot() {
  await agent.login({
    identifier: process.env.BSKY_USERNAME || '',
    password: process.env.BSKY_PASSWORD || '',
  });

  const notifs = await agent.getNotifications();

  for (const notif of notifs.data.notifications) {
    if (notif.reason === 'mention') {
      const thread = await agent.getPostThread({ uri: notif.uri });
      if (!thread.success) continue;

      let root = thread.data.thread as AppBskyFeedDefs.ThreadViewPost;
      while (root.parent && AppBskyFeedDefs.isThreadViewPost(root.parent)) {
        root = root.parent;
      }

      await repostWithRefresh(root.post);

    } else if (notif.reason === 'quote') {
      if (!notif.reasonSubject) continue;

      const result = await agent.getPosts({ uris: [notif.reasonSubject] });
      if (!result.success || result.data.posts.length === 0) continue;

      await repostWithRefresh(result.data.posts[0]);
    }
  }
}

runBot().catch(console.error);
