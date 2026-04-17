// functions/api/saweria.js
// GET  → return donatur list (dipake saweria.html)
// POST → webhook dari Saweria (simpan donatur + notif Discord)

// ── GET: untuk saweria.html fetch donatur list ──────────────
export const onRequestGet = async ({ env }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const listRaw = await env.USERS_KV.get('donatur:list');
    const list = listRaw ? JSON.parse(listRaw) : [];
    return new Response(JSON.stringify(list), { headers });
  } catch (e) {
    return new Response(JSON.stringify([]), { headers });
  }
};

// ── POST: webhook dari Saweria ──────────────────────────────
export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };

  // Verifikasi secret dari Saweria
  const secret = request.headers.get('x-saweria-secret');
  if (secret !== env.SAWERIA_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();

  // Format data dari Saweria
  const donatur = {
    nama: body.donator_name || 'Anonymous',
    pesan: body.message || '',
    nominal: body.amount_raw || 0,
    createdAt: Date.now()
  };

  // Simpan ke list donatur di KV
  const listRaw = await env.USERS_KV.get('donatur:list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  list.unshift(donatur);
  if (list.length > 50) list.pop();
  await env.USERS_KV.put('donatur:list', JSON.stringify(list));

  // Kirim notif ke Discord via webhook
  const WEBHOOK = env.DISCORD_DONATION_WEBHOOK;
  if (WEBHOOK) {
    const nominal = parseInt(donatur.nominal).toLocaleString('id-ID');
    const tierEmoji =
      donatur.nominal >= 100000 ? '🚀' :
      donatur.nominal >= 50000  ? '👑' :
      donatur.nominal >= 25000  ? '💎' :
      donatur.nominal >= 10000  ? '⭐' : '☕';

    const tierName =
      donatur.nominal >= 100000 ? 'ROCKET 🚀' :
      donatur.nominal >= 50000  ? 'CROWN 👑'  :
      donatur.nominal >= 25000  ? 'DIAMOND 💎':
      donatur.nominal >= 10000  ? 'STAR ⭐'   : 'COFFEE ☕';

    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@1442230317455900823> ☕ **Donasi masuk!**`,
        embeds: [{
          color: 0xFF6B35,
          title: `${tierEmoji} Donasi Baru dari ${donatur.nama}!`,
          description: [
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[2;34m║  \u001b[1;33m☕  DONASI MASUK!  ☕\u001b[0m  \u001b[2;34m║\u001b[0m',
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            '```ansi',
            '\u001b[1;32m━━━━━━━━━━━━ DETAIL DONASI ━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 👤  Nama    :\u001b[0m \u001b[1;37m${donatur.nama}\u001b[0m`,
            `\u001b[1;36m 💰  Nominal :\u001b[0m \u001b[1;32mRp ${nominal}\u001b[0m`,
            `\u001b[1;36m ${tierEmoji}  Tier    :\u001b[0m \u001b[0;37m${tierName}\u001b[0m`,
            `\u001b[1;36m 💬  Pesan   :\u001b[0m \u001b[0;37m${donatur.pesan || '(tidak ada pesan)'}\u001b[0m`,
            '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```'
          ].join('\n'),
          footer: { text: 'OwoBim Donation System • Saweria' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
};
