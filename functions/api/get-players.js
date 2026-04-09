export const onRequestPost = async ({ env }) => {
  const list = await env.USERS_KV.list({ prefix: "user:" });
  const players = [];

  for (const key of list.keys) {
    const userStr = await env.USERS_KV.get(key.name);
    if (userStr) {
      const user = JSON.parse(userStr);
      players.push({
        username: key.name.replace("user:", ""),
        balance: user.balance || 0
      });
    }
  }

  return new Response(JSON.stringify({ success: true, players }));
};
