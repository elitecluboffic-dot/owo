export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };

  // ✅ Validasi admin hash dulu
  const { adminHash } = await request.json();
  if (!adminHash || adminHash !== env.ADMIN_HASH) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers });
  }

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
  return new Response(JSON.stringify({ success: true, players }), { headers });
};
