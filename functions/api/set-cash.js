export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };

  // ✅ Validasi admin hash dulu
  const { adminHash, username, newBalance } = await request.json();
  if (!adminHash || adminHash !== env.ADMIN_HASH) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers });
  }

  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404, headers });
  }
  let user = JSON.parse(userStr);
  user.balance = parseInt(newBalance) || 0;
  await env.USERS_KV.put(`user:${username}`, JSON.stringify(user));
  return new Response(JSON.stringify({
    success: true,
    message: `Cowoncy ${username} diubah menjadi ${user.balance.toLocaleString()}`
  }), { headers });
};
