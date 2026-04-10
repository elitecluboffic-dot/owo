export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { adminHash } = await request.json();
  if (!adminHash || adminHash !== env.ADMIN_HASH) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers });
  }
  const giveawayStr = await env.USERS_KV.get('giveaway:active');
  if (!giveawayStr) {
    return new Response(JSON.stringify({ success: false, message: 'Tidak ada giveaway aktif!' }), { status: 404, headers });
  }
  const giveaway = JSON.parse(giveawayStr);
  if (giveaway.participants.length === 0) {
    await env.USERS_KV.delete('giveaway:active');
    return new Response(JSON.stringify({ success: false, message: 'Tidak ada peserta, giveaway dibatalkan.' }), { headers });
  }
  const winnerId = giveaway.participants[Math.floor(Math.random() * giveaway.participants.length)];
  const winnerStr = await env.USERS_KV.get(`user:${winnerId}`);
  if (winnerStr) {
    let winner = JSON.parse(winnerStr);
    winner.balance += giveaway.jumlah;
    await env.USERS_KV.put(`user:${winnerId}`, JSON.stringify(winner));
  }
  await env.USERS_KV.delete('giveaway:active');
  return new Response(JSON.stringify({
    success: true,
    message: `🎉 Giveaway selesai! Pemenang: ${winnerId} mendapat 🪙 ${giveaway.jumlah.toLocaleString()}`
  }), { headers });
};
