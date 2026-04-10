export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { adminHash, jumlah, durasi } = await request.json();
  if (!adminHash || adminHash !== env.ADMIN_HASH) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers });
  }
  if (!jumlah || jumlah <= 0) {
    return new Response(JSON.stringify({ success: false, message: 'Jumlah tidak valid' }), { status: 400, headers });
  }
  if (!durasi || durasi <= 0) {
    return new Response(JSON.stringify({ success: false, message: 'Durasi tidak valid' }), { status: 400, headers });
  }
  const endTime = Date.now() + (durasi * 60 * 1000);
  await env.USERS_KV.put('giveaway:active', JSON.stringify({
    jumlah, endTime, participants: []
  }));
  return new Response(JSON.stringify({ success: true, message: `Giveaway 🪙 ${jumlah.toLocaleString()} dimulai selama ${durasi} menit!` }), { headers });
};
