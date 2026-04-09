export const onRequestPost = async ({ request, env }) => {
  const { username, newBalance } = await request.json();
  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404 });
  }
  let user = JSON.parse(userStr);
  user.balance = parseInt(newBalance) || 0;
  await env.USERS_KV.put(`user:${username}`, JSON.stringify(user));
  return new Response(JSON.stringify({ 
    success: true, 
    message: `Cowoncy ${username} diubah menjadi ${user.balance.toLocaleString()}` 
  }));
};
