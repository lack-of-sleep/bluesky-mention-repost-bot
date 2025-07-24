import { BskyAgent } from '@atproto/api';


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

    let root = thread.data.thread;
    while (root.parent && 'post' in root.parent) {
      root = root.parent.post;
    }

    if (handled.has(root.uri)) continue;

    await agent.repost(root.uri, root.cid);
    console.log(`✅ Reposted: ${root.uri}`);
    handled.add(root.uri);
  }
}

runBot().catch(console.error);
