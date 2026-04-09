export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { username } = await request.json();

  if (!username) {
    return new Response(JSON.stringify({ success: false, message: "Username diperlukan" }), { status: 400, headers });
  }

  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404, headers });
  }

  const user = JSON.parse(userStr);

  // Kirim webhook notifikasi wcash
  if (user.webhookUrl) {
    try {
      const msg = `💰 **${username}** mengecek saldo\nCowoncy saat ini: 🪙 **${user.balance.toLocaleString()}**`;
      await fetch(user.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg })
      });
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    success: true,
    balance: user.balance
  }), { headers });
};
