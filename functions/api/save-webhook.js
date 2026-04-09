export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { username, webhookUrl } = await request.json();
  if (!username || !webhookUrl || !webhookUrl.includes('discord.com/api/webhooks')) {
    return new Response(JSON.stringify({ success: false, message: "Webhook URL tidak valid" }), { status: 400, headers });
  }
  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404, headers });
  }
  let user = JSON.parse(userStr);
  user.webhookUrl = webhookUrl;
  await env.USERS_KV.put(`user:${username}`, JSON.stringify(user));
  return new Response(JSON.stringify({ success: true, message: "Webhook berhasil disimpan!" }), { headers });
};
