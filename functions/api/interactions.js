export const onRequestPost = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const headers = { 'Content-Type': 'application/json' };

  
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  if (!signature || !timestamp) {
    return new Response('Missing headers', { status: 401 });
  }

  const isValid = await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, body);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), { headers });
  }


  // ==================== COMPONENT INTERACTION (Button) ====================
if (interaction.type === 3) {
  const customId  = interaction.data.custom_id;
  const type = interaction.type;
  const clickerId = interaction.member?.user?.id || interaction.user?.id;

    // TAMBAH INI ↓
  const discordId = clickerId;
  const username  = interaction.member?.user?.username || interaction.user?.username;


  // 💬 Reply Anonim → buka modal
if (customId.startsWith('confess_reply:')) {
  const confessId = customId.split(':')[1];
  return new Response(JSON.stringify({
    type: 9,
    data: {
      custom_id: `confess_reply_modal:${confessId}`,
      title: '💬 Reply Anonim',
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'reply_pesan',
          label: 'Balasan kamu',
          style: 2,
          placeholder: 'Tulis balasan anon kamu di sini...',
          required: true,
          max_length: 500
        }]
      }]
    }
  }), { headers });
}

// 🚫 Block sender
if (customId.startsWith('confess_block:')) {
  const confessId  = customId.split(':')[1];
  const confessRaw = await env.USERS_KV.get(`confess:${confessId}`);
  if (!confessRaw) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Confess tidak ditemukan atau sudah expired.', flags: 64 }
    }), { headers });
  }

  const confessData = JSON.parse(confessRaw);
  const senderId    = confessData.senderId;
  const targetId    = clickerId; // yang klik block = target confess

  // Simpan block: key = confess_block:{targetId}:{senderId}
  await env.USERS_KV.put(`confess_block:${targetId}:${senderId}`, '1', { expirationTtl: 86400 * 365 });

  // Edit pesan DM — hapus tombol
  const messageId = interaction.message.id;
  const channelId = interaction.message.channel_id;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
    },
    body: JSON.stringify({
      embeds: interaction.message.embeds,
      components: [{
        type: 1,
        components: [{
          type: 2, style: 2,
          label: '🔒 User ini diblokir',
          custom_id: 'blocked_placeholder',
          disabled: true
        }]
      }]
    })
  });

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: [
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m🔒  USER DIBLOKIR  🔒\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> 🚫 User tersebut **tidak bisa** confess ke kamu lagi.`,
        `> 🆔 Confess ID: \`${confessId}\``
      ].join('\n'),
      flags: 64
    }
  }), { headers });
}

// 🚨 Report confess ke owner
if (customId.startsWith('confess_report:')) {
  const confessId  = customId.split(':')[1];
  const confessRaw = await env.USERS_KV.get(`confess:${confessId}`);
  if (!confessRaw) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Confess tidak ditemukan atau sudah expired.', flags: 64 }
    }), { headers });
  }

  const confessData = JSON.parse(confessRaw);
  const WEBHOOK     = env.FEEDBACK_WEBHOOK_URL;

  if (WEBHOOK) {
    const waktu = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@1442230317455900823> 🚨 **CONFESS DILAPORKAN!**`,
        embeds: [{
          title: '🚨 Confess Report',
          color: 0xFF4500,
          fields: [
            { name: '🆔 Confess ID',  value: `\`${confessId}\``,              inline: true  },
            { name: '📋 Kategori',    value: confessData.kategori,             inline: true  },
            { name: '🎭 Mood',        value: confessData.mood,                 inline: true  },
            { name: '💬 Isi Pesan',   value: `\`\`\`${confessData.pesan}\`\`\``, inline: false },
            { name: '🎯 Dilaporkan oleh', value: `<@${clickerId}>`,           inline: true  },
            { name: '🏠 Guild',       value: `\`${confessData.guildId}\``,    inline: true  },
            { name: '🕐 Waktu',       value: `${waktu} WIB`,                  inline: false }
          ],
          footer: { text: 'OwoBim Confess Report System' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  // Edit pesan DM — disable tombol report setelah diklik
  const messageId = interaction.message.id;
  const channelId = interaction.message.channel_id;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
    },
    body: JSON.stringify({
      embeds: interaction.message.embeds,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: '💬 Reply Anonim', custom_id: `confess_reply:${confessId}` },
          { type: 2, style: 4, label: '🚫 Block',        custom_id: `confess_block:${confessId}`  },
          { type: 2, style: 2, label: '✅ Sudah Dilaporkan', custom_id: 'reported_placeholder', disabled: true }
        ]
      }]
    })
  });

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: [
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m🚨  LAPORAN TERKIRIM  🚨\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ✅ Report berhasil dikirim ke **Owner Bot**.`,
        `> 🆔 Confess ID: \`${confessId}\``,
        `> ⏳ Owner akan meninjau dalam waktu dekat.`
      ].join('\n'),
      flags: 64
    }
  }), { headers });
}


// ═══════════════════════════════════════════════════════
// BUTTON: rps_pvp
// ═══════════════════════════════════════════════════════
if (type === 3 && customId.startsWith('rps_pvp:')) {
  const [, challengeId, pilihanLawan] = customId.split(':');

  const items = {
    batu:    { emoji: '🪨', nama: 'Batu',    menang: 'gunting', kalah: 'kertas'  },
    kertas:  { emoji: '📄', nama: 'Kertas',  menang: 'batu',    kalah: 'gunting' },
    gunting: { emoji: '✂️', nama: 'Gunting', menang: 'kertas',  kalah: 'batu'    }
  };

  // Ambil data challenge dari KV
  const challengeRaw = await env.USERS_KV.get(`rps_challenge:${challengeId}`);
  if (!challengeRaw) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Challenge sudah expire atau tidak ditemukan!', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const challenge = JSON.parse(challengeRaw);

  // Pastikan yang klik adalah lawan yang ditantang
  if (discordId !== challenge.lawanId) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Bukan tantanganmu!', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Hapus challenge dari KV biar tidak bisa diklik lagi
  await Promise.all([
    env.USERS_KV.delete(`rps_challenge:${challengeId}`),
    env.USERS_KV.delete(`rps_active:${challenge.challengerId}`)
  ]);

  const pilihanChallenger = challenge.challengerPilihan;
  const challengerName    = challenge.challengerName;
  const challengerItem    = items[pilihanChallenger];
  const lawanItem         = items[pilihanLawan];

  // Tentukan hasil
  let hasil, hasilEmoji, hasilColor;
  if (pilihanChallenger === pilihanLawan) {
    hasil = 'SERI';   hasilEmoji = '🤝'; hasilColor = 0xF1C40F;
  } else if (challengerItem.menang === pilihanLawan) {
    hasil = `${challengerName} MENANG`; hasilEmoji = '🏆'; hasilColor = 0x2ECC71;
  } else {
    hasil = `${username} MENANG`; hasilEmoji = '🏆'; hasilColor = 0x2ECC71;
  }

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: `${hasilEmoji} RPS PVP selesai! **${hasil}!**`,
      embeds: [{
        color: hasilColor,
        title: `${hasilEmoji} RPS PVP — ${hasil}!`,
        description: [
          '```ansi',
          '\u001b[1;35m━━━━━━━━━━ HASIL PERTARUNGAN ━━━━━━━━━━\u001b[0m',
          `\u001b[1;37m  👤 ${challengerName.padEnd(10)}: \u001b[1;33m${challengerItem.emoji} ${challengerItem.nama}\u001b[0m`,
          `\u001b[1;37m  👤 ${username.padEnd(10)}: \u001b[1;33m${lawanItem.emoji} ${lawanItem.nama}\u001b[0m`,
          '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;32m  ${hasilEmoji}  ${hasil}\u001b[0m`,
          '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        footer: { text: '🎮 OwoBim RPS PVP System' },
        timestamp: new Date().toISOString()
      }],
      components: [] // Hapus tombol setelah selesai
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}




  




if (customId.startsWith('buy_cowoncy:')) {
  const parts   = customId.split(':');
  const paket   = parts[1];
  const buyerId = parts[2];

  if (clickerId !== buyerId) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Ini bukan ordermu!', flags: 64 }
    }), { headers });
  }

  const PAKET_INFO = {
    starter:  { nama: '🥉 Starter',  cowoncy: 800,     harga: 'Rp 5.000'   },
    basic:    { nama: '🥈 Basic',    cowoncy: 5000,    harga: 'Rp 30.000'  },
    premium:  { nama: '🥇 Premium',  cowoncy: 12000,   harga: 'Rp 50.000'  },
    ultimate: { nama: '💎 Ultimate', cowoncy: 25000,   harga: 'Rp 150.000' },
  };

  const p = PAKET_INFO[paket];
  if (!p) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Paket tidak valid!', flags: 64 }
    }), { headers });
  }

  const existingOrder = await env.USERS_KV.get(`cowoncy_order_active:${buyerId}`);
  if (existingOrder) {
    const existing = JSON.parse(existingOrder);
    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: [
          '```ansi',
          '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[1;31m║  ⚠️  ORDER MASIH PENDING!  ⚠️        ║\u001b[0m',
          '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          `> 🆔 Order aktif: \`${existing.orderId}\``,
          `> 🎁 Paket: **${existing.p_nama}**`,
          `> ⏳ Tunggu owner konfirmasi order sebelumnya dulu!`
        ].join('\n'),
        flags: 64
      }
    }), { headers });
  }

  const orderId = `ORD-${Date.now()}-${buyerId.slice(-4)}`;
  const buyerUsername = interaction.member?.user?.username || interaction.user?.username;
  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  await Promise.all([
    env.USERS_KV.put(`cowoncy_order:${orderId}`, JSON.stringify({
      orderId, buyerId, buyerUsername, paket,
      p_nama: p.nama, cowoncy: p.cowoncy, harga: p.harga,
      status: 'pending_payment', createdAt: Date.now()
    }), { expirationTtl: 86400 }),
    env.USERS_KV.put(`cowoncy_order_active:${buyerId}`, JSON.stringify({
      orderId, p_nama: p.nama
    }), { expirationTtl: 86400 })
  ]);

  const WEBHOOK = env.FEEDBACK_WEBHOOK_URL;
  if (WEBHOOK) {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@1442230317455900823> 🛒 **ORDER BARU MASUK!**`,
        embeds: [{
          color: 0xF1C40F,
          title: '🛒 New Cowoncy Order',
          fields: [
            { name: '👤 Username',    value: buyerUsername,                          inline: true  },
            { name: '🆔 Discord ID',  value: `\`${buyerId}\``,                       inline: true  },
            { name: '🎁 Paket',       value: p.nama,                                 inline: true  },
            { name: '🪙 Cowoncy',     value: `${p.cowoncy.toLocaleString('id-ID')}`, inline: true  },
            { name: '💵 Harga',       value: p.harga,                                inline: true  },
            { name: '🆔 Order ID',    value: `\`${orderId}\``,                       inline: true  },
            { name: '🕐 Waktu',       value: `${waktu} WIB`,                         inline: false },
            {
              name: '⚡ Command Approve',
              value: `\`\`\`/addcowoncy target:${buyerId} jumlah:${p.cowoncy} orderid:${orderId}\`\`\``,
              inline: false
            }
          ],
          footer: { text: 'OwoBim Shop • Tunggu bukti transfer dari buyer' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  const messageId = interaction.message.id;
  const channelId = interaction.message.channel_id;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
    body: JSON.stringify({
      embeds: [{
        color: 0x2ECC71,
        title: `${p.nama} — Detail Pembayaran`,
        description: [
          '```ansi',
          '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[1;32m║  💳  INFO PEMBAYARAN  💳             ║\u001b[0m',
          '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📋 DETAIL ORDER ━━━━━━━━━\u001b[0m',
          `\u001b[1;36m 🆔  Order ID  :\u001b[0m \u001b[0;37m${orderId}\u001b[0m`,
          `\u001b[1;36m 👤  Username  :\u001b[0m \u001b[0;37m${buyerUsername}\u001b[0m`,
          `\u001b[1;36m 🪪  Discord ID:\u001b[0m \u001b[1;37m${buyerId}\u001b[0m`,
          `\u001b[1;36m 🎁  Paket     :\u001b[0m \u001b[0;37m${p.nama}\u001b[0m`,
          `\u001b[1;36m 🪙  Cowoncy   :\u001b[0m \u001b[1;33m${p.cowoncy.toLocaleString('id-ID')} cowoncy\u001b[0m`,
          `\u001b[1;36m 💵  Harga     :\u001b[0m \u001b[1;32m${p.harga}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '\u001b[1;31m━━━━━━━━━━━━ 🏦 REKENING ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m 🏧  Bank      :\u001b[0m \u001b[1;37mSEABANK\u001b[0m`,
          `\u001b[1;36m 📋  No. Rek   :\u001b[0m \u001b[1;37m901513579165\u001b[0m`,
          `\u001b[1;36m 👤  A/N       :\u001b[0m \u001b[1;37mBustanul Labib Alwasi\u001b[0m`,
          '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          '> 📸 **Setelah transfer, klik tombol di bawah untuk kirim bukti!**',
          '> ⏰ Order berlaku selama **24 jam**',
          `> 🆔 Order ID: \`${orderId}\``
        ].join('\n'),
        footer: { text: `OwoBim Shop • ${orderId}` }
      }],
      // ← INI YANG DIGANTI, tombol bukti transfer
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 1,
          label: '📸 Kirim Bukti Transfer',
          custom_id: `bukti_modal:${orderId}:${buyerId}`
        }]
      }]
    })
  });

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: [
        '```ansi',
        '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[1;32m║  ✅  ORDER DIBUAT!  ✅               ║\u001b[0m',
        '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> 🛒 Paket **${p.nama}** dipilih!`,
        `> 🆔 Order ID: \`${orderId}\``,
        `> 💳 Info rekening sudah ditampilkan di atas.`,
        `> 📸 Klik tombol **Kirim Bukti Transfer** setelah bayar!`
      ].join('\n'),
      flags: 64
    }
  }), { headers });
}




  if (customId.startsWith('bukti_modal:')) {
  const parts   = customId.split(':');
  const orderId = parts[1];
  const buyerId = parts[2];

  return new Response(JSON.stringify({
    type: 9,
    data: {
      custom_id: `bukti_submit:${orderId}:${buyerId}`,
      title: '📸 Bukti Transfer',
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'link_bukti',
          label: 'Link Screenshot Bukti Transfer',
          style: 1,
          placeholder: 'Paste link bukti transfer gambar di sini (imgur, imgbb, dll)',
          required: true,
          max_length: 500
        }]
      }]
    }
  }), { headers });
}




  

  // 💖 Love Random — randomize persentase
if (customId.startsWith('love_random:')) {
  const parts   = customId.split(':');
  const user1Id = parts[1];
  const user2Id = parts[2];
 
  const [u1Res, u2Res] = await Promise.all([
    fetch(`https://discord.com/api/v10/users/${user1Id}`, {
      headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    }),
    fetch(`https://discord.com/api/v10/users/${user2Id}`, {
      headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    })
  ]);
 
  const u1 = await u1Res.json();
  const u2 = await u2Res.json();
 
  const lovePct = Math.floor(Math.random() * 101);
  const { msg, color, heart } = buildLoveResult(lovePct, u1.username, u2.username);
 
  const avatar1 = u1.avatar
    ? `https://cdn.discordapp.com/avatars/${u1.id}/${u1.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  const avatar2 = u2.avatar
    ? `https://cdn.discordapp.com/avatars/${u2.id}/${u2.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
 
  const shipUrl = `https://api.popcat.xyz/ship?user1=${encodeURIComponent(avatar1)}&user2=${encodeURIComponent(avatar2)}`;
  const barFilled = Math.round(lovePct / 10);
 
  return new Response(JSON.stringify({
    type: 7, // UPDATE message
    data: {
      content: `💌 **${u1.username}** + **${u2.username}** = **${lovePct}% Love** ${heart}`,
      embeds: [{
        color,
        description: [
          msg,
          '',
          `> ${'❤️'.repeat(barFilled)}${'🖤'.repeat(10 - barFilled)} **${lovePct}%**`,
        ].join('\n'),
        image: { url: shipUrl },
        footer: { text: 'OwoBim Love Calculator 💕 • Randomized!' },
        timestamp: new Date().toISOString()
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: '🎲 Random', custom_id: `love_random:${user1Id}:${user2Id}` },
          { type: 2, style: 2, label: '🔄 Change User', custom_id: `love_change:${user1Id}` },
          { type: 2, style: 3, label: '💍 Propose?', custom_id: `love_propose:${user1Id}:${user2Id}` },
          { type: 2, style: 5, label: '📊 Get Custom Results', url: `https://owo.kraxx.my.id` }
        ]
      }]
    }
  }), { headers });
}
 
// 💍 Love Propose — kirim lamaran ke pasangan
if (customId.startsWith('love_propose:')) {
  const parts   = customId.split(':');
  const user1Id = parts[1];
  const user2Id = parts[2];
 
  if (clickerId !== user1Id) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Ini bukan propose-an kamu!', flags: 64 }
    }), { headers });
  }
 
  const u2Res = await fetch(`https://discord.com/api/v10/users/${user2Id}`, {
    headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  const u2 = await u2Res.json();
 
  try {
    const dmCh = await (await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: user2Id })
    })).json();
 
    await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        content: [
          '```ansi',
          '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[1;35m║  💍  KAMU DAPAT PROPOSE!  💍        ║\u001b[0m',
          '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          `> 💌 <@${user1Id}> melamar kamu! 💍`,
          `> 💕 Mau terima? Ketik \`/accept-marry\` di server ya!`
        ].join('\n')
      })
    });
  } catch (_) {}
 
  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: `> 💍 Propose terkirim ke **${u2.username}**! Semoga diterima ya~ 🤞`,
      flags: 64
    }
  }), { headers });
}




  if (customId.startsWith('love_change:')) {
  const user1Id = customId.split(':')[1];

  return new Response(JSON.stringify({
    type: 9, // MODAL
    data: {
      title: '🔄 Ganti Pasangan Love',
      custom_id: `love_change_submit:${user1Id}`,
      components: [{
        type: 1,
        components: [{
          type: 4, // TEXT_INPUT
          custom_id: 'target_user_id',
          label: 'Masukkan User ID target',
          style: 1, // SHORT
          placeholder: 'Contoh: 123456789012345678',
          min_length: 17,
          max_length: 19,
          required: true
        }]
      }]
    }
  }), { headers });
}


  



  if (customId.startsWith('servers_page:')) {
  if (clickerId !== '1442230317455900823') {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Bukan Pemilik Bot!', flags: 64 }
    }), { headers });
  }

  const page = parseInt(customId.split(':')[1]);
  const { keys } = await env.USERS_KV.list({ prefix: 'guild:' });

  const servers = [];
  for (const key of keys) {
    const raw = await env.USERS_KV.get(key.name);
    if (raw) servers.push(JSON.parse(raw));
  }

  servers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const perPage   = 5;
  const totalPage = Math.ceil(servers.length / perPage);
  const medals    = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const start     = page * perPage;

  const fields = servers.slice(start, start + perPage).map((data, i) => {
    const waktu = new Date(data.updatedAt).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    return {
      name: `${medals[i] || `${start + i + 1}.`} \`${data.guildId}\``,
      value: `📢 <#${data.channelId}> • 🕐 ${waktu}`,
      inline: false
    };
  });

  return new Response(JSON.stringify({
    type: 7, // UPDATE
    data: {
      embeds: [{
        color: 0x5865F2,
        title: '🌐 OWO BIM — Server List',
        description: `🌍 **Total:** \`${servers.length}\` server`,
        fields,
        footer: { text: `Halaman ${page + 1} dari ${totalPage} • Hanya kamu yang bisa melihat ini` },
        timestamp: new Date().toISOString()
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 2, label: '◀ Prev', custom_id: `servers_page:${page - 1}`, disabled: page === 0 },
          { type: 2, style: 2, label: `${page + 1} / ${totalPage}`, custom_id: 'servers_info', disabled: true },
          { type: 2, style: 2, label: 'Next ▶', custom_id: `servers_page:${page + 1}`, disabled: page >= totalPage - 1 }
        ]
      }]
    }
  }), { headers });
}

  
  

if (clickerId !== '1442230317455900823' && !customId.startsWith('rps_pvp:')) {
    return new Response(JSON.stringify({
      type: 4, data: { content: '❌ Bukan pemilik bot!', flags: 64 }
    }), { headers });
  }

  // ── Tombol: Beri Peringatan → buka modal ──
  if (customId.startsWith('warn_open:')) {
    const targetId = customId.split(':')[1];
    return new Response(JSON.stringify({
      type: 9,
      data: {
        custom_id: `warn_modal:${targetId}`,
        title: '📢 Beri Peringatan ke User',
        components: [{
          type: 1,
          components: [{
            type: 4,
            custom_id: 'warn_message',
            label: 'Pesan Peringatan',
            style: 2,
            placeholder: 'Tulis pesan peringatan untuk user ini...',
            required: true,
            max_length: 500
          }]
        }]
      }
    }), { headers });
  }

  // ── Tombol: Ban → buka modal alasan ban ──
  if (customId.startsWith('ban_open:')) {
    const [, targetId, guildId] = customId.split(':');
    return new Response(JSON.stringify({
      type: 9,
      data: {
        custom_id: `ban_modal:${targetId}:${guildId}`,
        title: '🔨 Ban User',
        components: [{
          type: 1,
          components: [{
            type: 4,
            custom_id: 'ban_reason',
            label: 'Alasan Ban',
            style: 1,
            placeholder: 'Spam berlebihan / melanggar aturan...',
            required: true,
            max_length: 200
          }]
        }]
      }
    }), { headers });
  }

  // ── Tombol: Abaikan ──
  if (customId.startsWith('ignore_spam:')) {
    return new Response(JSON.stringify({
      type: 7,
      data: {
        content: '✅ **Laporan diabaikan** oleh owner.',
        components: [],
        embeds: []
      }
    }), { headers });
  }


  
  
// ── Tombol: Approve/Reject Quote ──
if (customId.startsWith('quote_approve:') || customId.startsWith('quote_reject:')) {
  const colonIndex = customId.indexOf(':');
  const action = customId.slice(0, colonIndex);
  const quoteId = customId.slice(colonIndex + 1);
  const isApprove = action === 'quote_approve';
  const quoteRaw = await env.USERS_KV.get(`quote:${quoteId}`);
  if (!quoteRaw) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Quote tidak ditemukan atau sudah expired.', flags: 64 }
    }), { headers });
  }
  const quoteData = JSON.parse(quoteRaw);
  quoteData.status = isApprove ? 'approved' : 'rejected';
  quoteData.reviewedAt = Date.now();
  quoteData.reviewedBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';
  await env.USERS_KV.put(`quote:${quoteId}`, JSON.stringify(quoteData), { expirationTtl: 86400 * 7 });
  if (isApprove) {
    const allQuotesRaw = await env.USERS_KV.get('quotes:approved');
    const allQuotes = allQuotesRaw ? JSON.parse(allQuotesRaw) : [];
    allQuotes.push({
      id: quoteId,
      teks: quoteData.teks,
      discordId: quoteData.discordId,
      username: quoteData.username
    });
    await env.USERS_KV.put('quotes:approved', JSON.stringify(allQuotes));
  }
  const messageId = interaction.message.id;
  const channelId = interaction.message.channel_id;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
    body: JSON.stringify({
      embeds: [{
        color: isApprove ? 0x2ECC71 : 0xE74C3C,
        title: isApprove ? '✅ Quote Disetujui' : '❌ Quote Ditolak',
        description: `> "${quoteData.teks}"`,
        fields: [
          { name: '👤 Pengirim', value: `<@${quoteData.discordId}> (${quoteData.username})`, inline: true },
          { name: '🆔 Quote ID', value: `\`${quoteId}\``, inline: true },
          { name: '👮 Di-review oleh', value: `<@${quoteData.reviewedBy}>`, inline: true }
        ]
      }],
      components: []
    })
  });
  try {
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: quoteData.discordId })
    });
    const dmData = await dmRes.json();
    await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        embeds: [{
          color: isApprove ? 0x2ECC71 : 0xE74C3C,
          title: isApprove ? '🎉 Quote kamu DISETUJUI!' : '😔 Quote kamu DITOLAK',
          description: `> "${quoteData.teks}"`,
          fields: [
            { name: '🆔 Quote ID', value: `\`${quoteId}\``, inline: true },
            { name: '📍 Status', value: isApprove ? '**Approved** ✅' : '**Rejected** ❌', inline: true }
          ],
          footer: { text: isApprove ? 'Quote kamu sudah masuk ke database! Lihat di: https://owo.kraxx.my.id/quotes' : 'Kamu bisa submit quote baru kapan saja.' }
        }]
      })
    });
  } catch (e) {
    console.error('Gagal kirim DM:', e.message);
  }
  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: isApprove ? '✅ Quote berhasil di-approve!' : '❌ Quote berhasil di-reject!',
      flags: 64
    }
  }), { headers });
}

  
  
  return new Response(JSON.stringify({ type: 1 }), { headers });
}

// ==================== MODAL SUBMIT ====================
if (interaction.type === 5) {
  const customId  = interaction.data.custom_id;
  const clickerId = interaction.member?.user?.id || interaction.user?.id;


  // ── Modal: Reply Anonim dari DM ──
if (customId.startsWith('confess_reply_modal:')) {
  const confessId   = customId.split(':')[1];
  const replyPesan  = interaction.data.components[0].components[0].value;
  const confessRaw  = await env.USERS_KV.get(`confess:${confessId}`);

  if (!confessRaw) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Confess tidak ditemukan atau sudah expired.', flags: 64 }
    }), { headers });
  }

  const confessData = JSON.parse(confessRaw);
  const senderId    = confessData.senderId;

  // Kirim DM balik ke pengirim confess asli
  try {
    const dmCh = await (await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: senderId })
    })).json();

    if (!dmCh.id) throw new Error('DM channel gagal dibuka');

    const waktu = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        content: `📩 Confess **#${confessId}** kamu dibalas!`,
        embeds: [{
          color: 0x5865F2,
          author: { name: '💬 Balasan Anonymous' },
          description: [
            '```ansi',
            '\u001b[1;35m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;35m║  💬  BALASAN CONFESS KAMU  💬  ║\u001b[0m',
            '\u001b[1;35m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `> 💌 *"${replyPesan}"*`,
            '',
            '```ansi',
            '\u001b[1;37m━━━━━━━━━━━━ 📋 DETAIL ━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🆔  Confess ID :\u001b[0m \u001b[0;37m${confessId}\u001b[0m`,
            `\u001b[1;36m 💬  Confess mu :\u001b[0m \u001b[0;37m${confessData.pesan.slice(0, 80)}${confessData.pesan.length > 80 ? '...' : ''}\u001b[0m`,
            `\u001b[1;36m 🕐  Waktu      :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
            '\u001b[1;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```'
          ].join('\n'),
          footer: { text: `OwoBim Confess System • ${confessId}` },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (err) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: `❌ Gagal kirim reply: \`${err.message}\``, flags: 64 }
    }), { headers });
  }

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: [
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;32m✓  REPLY TERKIRIM!  ✓\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> 📩 Balasan kamu sudah dikirim secara **anonim**!`,
        `> 🔒 Identitasmu tetap **tersembunyi**.`
      ].join('\n'),
      flags: 64
    }
  }), { headers });
}





  if (customId.startsWith('bukti_submit:')) {
  const parts    = customId.split(':');
  const orderId  = parts[1];
  const buyerId  = parts[2];
  const linkBukti = interaction.data.components[0].components[0].value;

  // Kirim ke owner via webhook
  const WEBHOOK = env.FEEDBACK_WEBHOOK_URL;
  if (WEBHOOK) {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@1442230317455900823> 📸 **BUKTI TRANSFER MASUK!**`,
        embeds: [{
          color: 0x2ECC71,
          title: '📸 Bukti Transfer',
          fields: [
            { name: '🆔 Order ID',   value: `\`${orderId}\``,        inline: true },
            { name: '👤 Buyer',      value: `<@${buyerId}>`,         inline: true },
            { name: '🔗 Bukti',      value: linkBukti,               inline: false }
          ],
          image: { url: linkBukti },
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: '✅ Bukti transfer berhasil dikirim ke owner! Tunggu konfirmasi ya.',
      flags: 64
    }
  }), { headers });
}




  





  if (customId.startsWith('love_change_submit:')) {
  const user1Id = customId.split(':')[1];
  const user2Id = interaction.data.components[0].components[0].value.trim();

  if (user1Id === user2Id) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Masa cek love sama diri sendiri! 💀', flags: 64 }
    }), { headers });
  }

  // Fetch kedua user
  const [u1Res, u2Res] = await Promise.all([
    fetch(`https://discord.com/api/v10/users/${user1Id}`, {
      headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    }),
    fetch(`https://discord.com/api/v10/users/${user2Id}`, {
      headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
    })
  ]);

  const u1 = await u1Res.json();
  const u2 = await u2Res.json();

  // Validasi user2 valid
  if (!u2.id) {
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ User ID tidak ditemukan! Pastikan ID-nya benar.', flags: 64 }
    }), { headers });
  }

  const seed    = [...(user1Id + user2Id)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const lovePct = seed % 101;
  const { msg, color, heart } = buildLoveResult(lovePct, u1.username, u2.username);

  const avatar1   = u1.avatar
    ? `https://cdn.discordapp.com/avatars/${u1.id}/${u1.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  const avatar2   = u2.avatar
    ? `https://cdn.discordapp.com/avatars/${u2.id}/${u2.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  const shipUrl   = `https://api.popcat.xyz/ship?user1=${encodeURIComponent(avatar1)}&user2=${encodeURIComponent(avatar2)}`;
  const barFilled = Math.round(lovePct / 10);

  return new Response(JSON.stringify({
    type: 7, // UPDATE message
    data: {
      content: `💌 **${u1.username}** + **${u2.username}** = **${lovePct}% Love** ${heart}`,
      embeds: [{
        color,
        description: [
          msg,
          '',
          `> ${'❤️'.repeat(barFilled)}${'🖤'.repeat(10 - barFilled)} **${lovePct}%**`,
          '',
          '```ansi',
          '\u001b[1;35m━━━━━━━━━━ 💕 DETAIL ━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m 👤  User 1   :\u001b[0m \u001b[0;37m${u1.username}\u001b[0m`,
          `\u001b[1;36m 👤  User 2   :\u001b[0m \u001b[0;37m${u2.username}\u001b[0m`,
          `\u001b[1;36m 💖  Love     :\u001b[0m \u001b[1;35m${lovePct}%\u001b[0m`,
          `\u001b[1;36m 🎯  Status   :\u001b[0m \u001b[0;37m${getLoveStatus(lovePct)}\u001b[0m`,
          '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        image: { url: shipUrl },
        footer: { text: 'OwoBim Love Calculator 💕 • /love target:@user' },
        timestamp: new Date().toISOString()
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: '🎲 Random',          custom_id: `love_random:${user1Id}:${user2Id}` },
          { type: 2, style: 2, label: '🔄 Change User',     custom_id: `love_change:${user1Id}` },
          { type: 2, style: 3, label: '💍 Propose?',        custom_id: `love_propose:${user1Id}:${user2Id}` },
          { type: 2, style: 5, label: '📊 Custom Results',  url: 'https://owo.kraxx.my.id' }
        ]
      }]
    }
  }), { headers });
}






  

  
  

  if (clickerId !== '1442230317455900823') {
    return new Response(JSON.stringify({
      type: 4, data: { content: '❌ Bukan pemilik bot!', flags: 64 }
    }), { headers });
  }

  // ── Modal: Simpan peringatan ──
  if (customId.startsWith('warn_modal:')) {
    const targetId = customId.split(':')[1];
    const message  = interaction.data.components[0].components[0].value;

    await env.USERS_KV.put(`warning:${targetId}`, JSON.stringify({
      message,
      createdAt: Date.now()
    }), { expirationTtl: 86400 * 7 });

    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: [
          '```ansi',
          '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[2;34m║  \u001b[1;32m✓  PERINGATAN TERSIMPAN  ✓\u001b[0m  \u001b[2;34m║\u001b[0m',
          '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          `> ⚠️ Peringatan untuk <@${targetId}> sudah disimpan!`,
          `> 📝 Pesan: **${message}**`,
          `> ⏳ User akan melihatnya saat menjalankan command berikutnya.`
        ].join('\n'),
        flags: 64
      }
    }), { headers });
  }

  // ── Modal: Eksekusi ban ──
  if (customId.startsWith('ban_modal:')) {
    const parts    = customId.split(':');
    const targetId = parts[1];
    const guildId  = parts[2];
    const reason   = interaction.data.components[0].components[0].value;

    if (!guildId || guildId === 'dm') {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Tidak bisa ban di DM!', flags: 64 }
      }), { headers });
    }

    const banRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${env.BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: `[OwoBim] ${reason}` })
      }
    );

    if (banRes.ok || banRes.status === 204) {
      return new Response(JSON.stringify({
        type: 7,
        data: {
          content: [
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[2;34m║  \u001b[1;31m🔨  USER DIBANNED  🔨\u001b[0m  \u001b[2;34m║\u001b[0m',
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `> 🔨 <@${targetId}> berhasil dibanned dari \`${guildId}\``,
            `> 📝 Alasan: **${reason}**`
          ].join('\n'),
          components: [],
          embeds: []
        }
      }), { headers });
    } else {
      const errData = await banRes.json().catch(() => ({}));
      return new Response(JSON.stringify({
        type: 4,
        data: {
          content: `❌ Gagal ban! Status: \`${banRes.status}\`\nPastikan bot punya permission **BAN_MEMBERS** di server tersebut.\n\`${JSON.stringify(errData)}\``,
          flags: 64
        }
      }), { headers });
    }
  }

  return new Response(JSON.stringify({ type: 1 }), { headers });
}
   

  
  if (interaction.type === 2) {

    const cmd       = interaction.data.name;
    const options   = interaction.data.options || [];
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const username  = interaction.member?.user?.username || interaction.user?.username;

    // ✅ Guild untuk broadcast
const guildId   = interaction.guild_id;
const channelId = interaction.channel_id;
if (guildId && channelId) {
  const existingRaw = await env.USERS_KV.get(`guild:${guildId}`);
  const existing = existingRaw ? JSON.parse(existingRaw) : { totalCommands: 0, channels: {} };
  const channels = existing.channels || {};
  channels[channelId] = (channels[channelId] || 0) + 1;
  await env.USERS_KV.put(`guild:${guildId}`, JSON.stringify({
    guildId,
    channelId,
    updatedAt: Date.now(),
    totalCommands: (existing.totalCommands || 0) + 1,
    channels
  }));
}


    // Cek kalau ada user yang di-mention, apakah dia lagi AFK
const mentionedUsers = interaction.data.options?.filter(o => o.type === 6) || [];
for (const opt of mentionedUsers) {
  const mentionedId = String(opt.value);
  const mentionedStr = await env.USERS_KV.get(`user:${mentionedId}`);
  if (mentionedStr) {
    const mentionedUser = JSON.parse(mentionedStr);
    if (mentionedUser.afk?.status) {
      const menit = Math.floor((Date.now() - mentionedUser.afk.since) / 60000);
      return respond(`💤 <@${mentionedId}> sedang AFK!\n📝 Alasan: **${mentionedUser.afk.alasan}**\n⏱️ Sudah AFK selama **${menit} menit**`);
    }
  }
}
    // KEY DISCORD
    const userKey   = await env.USERS_KV.get(`discord:${discordId}`);



    // ==================== SPAM CHECK ====================
const isSpamming = await checkSpam(env, discordId, username, guildId, channelId, cmd, waitUntil);
if (isSpamming) {
  return respond(`⚠️ **${username}**, kamu terlalu cepat! Slow down dulu ya. 🐢`);
}


    if (cmd === 'register') {
      if (userKey) return respond('❌ Kamu sudah punya akun!');
      const password = getOption(options, 'password');
      const encoder  = new TextEncoder();
      const hashBuf  = await crypto.subtle.digest('SHA-256', encoder.encode(password));
      const hash     = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify({
        balance: 10000, passwordHash: hash, webhookUrl: null,
        discordId, discordUsername: username, createdAt: Date.now()
      }));
      await env.USERS_KV.put(`discord:${discordId}`, discordId);
      return respond(`✅ Akun berhasil! Selamat datang **${username}** 🎉\n🪙 **10.000** cowoncy`);
    }

    if (!userKey) return respond('❌ Belum punya akun! Gunakan `/register password:xxx` dulu.');
    const userStr = await env.USERS_KV.get(`user:${discordId}`);
    if (!userStr) return respond('❌ Data tidak ditemukan.');
    let user = JSON.parse(userStr);




// ==================== HELP COMMAND (MUDAH DIUPDATE) ====================
if (cmd === 'help') {
  return new Response(JSON.stringify({
    type: 4,
    data: {
      embeds: [
        {
          title: "🌟 Bantuan Command Bot OWO BIM",
          description: "Berikut daftar semua command yang tersedia:",
          color: 0xf1c40f
        },
        {
          title: "💰 Ekonomi Utama",
          color: 0x2ecc71,
          description: [
            "• `/register password:xxx` → Buat akun baru",
            "• `/wcash` → Cek saldo cowoncy kamu",
            "• `/wcf jumlah:1000` atau `/wcf jumlah:all` → Coinflip (50/50)",
            "• `/wsend target:@user jumlah:5000` → Kirim cowoncy ke orang lain",
            "• `/daily` → Klaim daily reward (15.000)",
            "• `/kerja` → Kerja setiap 1 jam (25.000)"
          ].join("\n")
        },
        {
          title: "🏦 Bank",
          color: 0x3498db,
          description: [
            "• `/bank` → Cek saldo bank & bunga",
            "• `/deposit jumlah:10000` atau `/deposit jumlah:all` → Masukkan uang ke bank",
            "• `/withdraw jumlah:5000` atau `/withdraw jumlah:all` → Ambil uang dari bank"
          ].join("\n")
        },
        {
          title: "🛒 Shop",
          color: 0xf1c40f,
          description: [
            "• `/buycowoncy` → Beli cowoncy via DM bot 🪙",
            "  🥉 Starter: 800 cowoncy — Rp 5.000",
            "  🥈 Basic: 5.000 cowoncy — Rp 30.000",
            "  🥇 Premium: 12.000 cowoncy — Rp 50.000",
            "  💎 Ultimate: 25.000 cowoncy — Rp 150.000",
            "",
            "> 💡 Ketik `/buycowoncy` → bot kirim DM → pilih paket → transfer → kirim bukti!"
          ].join("\n")
        },
        {
          title: "🎰 Games",
          color: 0xe74c3c,
          description: [
            "• `/slots jumlah:1000` → Slot machine jackpot",
            "• `/rps pilihan:batu` → Rock Paper Scissors vs bot/user"
          ].join("\n")
        },
        {
          title: "⚡ Pokémon System",
          color: 0xf39c12,
          description: [
            "• `/spawn` → Munculkan Pokémon liar (cooldown 1 menit)",
            "• `/catch nama:pikachu` → Tangkap Pokémon yang muncul",
            "• `/pokedex` → Lihat daftar koleksi Pokémon kamu",
            "• `/pokemon nama:pikachu` → Lihat detail + gambar 1 Pokémon",
            "• `/gacha tier:basic` → Beli Pokémon pakai coins",
            "  ⚪ Basic: 25.000 | 🟡 Premium: 75.000 | 🔴 Legendary: 200.000"
          ].join("\n")
        },
        {
          title: "🎣 Fishing System",
          color: 0x1a6b8a,
          description: [
            "• `/fishing` → Mancing ikan (cooldown per rod)",
            "• `/fish-inventory` → Lihat kantong ikan kamu",
            "• `/fish-sell aksi:start` → Mulai lelang ikan",
            "• `/fish-sell aksi:bid` → Bid di lelang orang lain",
            "• `/fish-sell aksi:sellall` → Jual semua ikan langsung",
            "• `/fish-sell aksi:claim` → Ambil hasil lelang",
            "• `/fish-sell aksi:list` → Lihat lelang aktif",
            "• `/fish-shop aksi:browse` → Lihat toko rod & bait",
            "• `/fish-shop aksi:buy` → Beli rod atau bait",
            "• `/aquarium aksi:view` → Lihat koleksi aquarium",
            "• `/aquarium aksi:add` → Pindah ikan ke aquarium",
            "• `/aquarium aksi:remove` → Keluarkan ikan dari aquarium",
            "• `/aquarium aksi:info` → Detail & gambar 1 ikan",
            "• `/fish-leaderboard` → Ranking top fisher",
            "• `/fish-stats` → Statistik mancing kamu",
            "",
            "  🎣 Basic Rod (gratis) | ⚙️ Iron 15rb | ✨ Gold 50rb",
            "  💎 Diamond 150rb | 🌌 Mythic 500rb",
            "  ⚪ Common → 🟢 Uncommon → 🔵 Rare → 🟣 Epic → 🟡 Legendary → 🌌 Mythic"
          ].join("\n")
        },
        {
          title: "🛠️ Tools",
          color: 0x9b59b6,
          description: [
            "• `/translate` → Terjemahkan Bahasa Asing",
            "• `/weather` → Cek cuaca di Seluruh Dunia",
            "• `/kurs` → Cek Mata Uang Real Time",
            "• `/ip` → Lacak Lokasi Jaringan",
            "• `/color` → Cek Color Gunakan Hex",
            "• `/shorten` → Perpendek URL panjang",
            "• `/makequote` → Buat Quote dari Ucapan Seseorang",
            "• `/quotesweb` → Kirim Quotes ke web: owo.kraxx.my.id/quotes",
            "• `/confess target:@user pesan:xxx` → Kirim pesan Anonim",
            "• `/feedback` → Kirim feedback/saran/laporan ke owner",
            "• `/explode` → Ledakkan seseorang dengan efek api 🔥"
          ].join("\n")
        },
        {
          title: "💑 Sosial & Fun",
          color: 0xe91e63,
          description: [
            "• `/marry target:@user` → Melamar seseorang",
            "• `/accept-marry` → Terima lamaran",
            "• `/tolak-marry` → Tolak lamaran",
            "• `/divorce` → Cerai",
            "• `/partner` → Cek status pernikahan",
            "• `/hug target:@user` → Peluk seseorang",
            "• `/slap target:@user` → Tampar seseorang",
            "• `/pat target:@user` → Usap kepala (pat pat)",
            "• `/roast target:@user` → Roast random super pedas",
            "• `/afk alasan:lagi belajar` → Set AFK",
            "• `/unafk` → Keluar dari AFK"
          ].join("\n")
        },
        {
          title: "📊 Lainnya",
          color: 0x1abc9c,
          description: [
            "• `/ping` → Cek latency bot",
            "• `/stats` → Statistik total pemain & cowoncy",
            "• `/leaderboard` → Top 10 saldo tertinggi",
            "• `/level` → Level leaderboard (berdasarkan total earned)",
            "• `/avatar user:@user` → Tampilkan avatar user",
            "• `/infopemilikbot` → Info pemilik bot",
            "",
            "> 💡 **Tips:** Beberapa command support `all` (contoh: `/wcf jumlah:all`)",
            "> Butuh bantuan lebih lanjut? Hubungi <@1442230317455900823> 💬"
          ].join("\n")
        }
      ]
    }
  }), {
    headers: { "Content-Type": "application/json" }
  });
}



    // ── Cek peringatan dari owner ──
const warningStr = await env.USERS_KV.get(`warning:${discordId}`);
if (warningStr) {
  const warn = JSON.parse(warningStr);
  await env.USERS_KV.delete(`warning:${discordId}`);
  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  \u001b[1;31m⚠  PERINGATAN DARI OWNER  ⚠\u001b[0m  \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> 🚫 Kamu mendapat peringatan dari **Owner Bot**:`,
    `> 💬 *"${warn.message}"*`,
    ``,
    `> ⚠️ Harap patuhi aturan agar tidak terkena ban permanen.`
  ].join('\n'));
}


    

    if (cmd === 'wcash') {
      return respond(`💰 **${username}**: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'wcf') {
      const amountRaw = getOption(options, 'jumlah');
      let bet = amountRaw === 'all' ? user.balance : parseInt(amountRaw);
      if (!bet || bet <= 0) return respond('❌ Jumlah tidak valid.');
      if (bet > user.balance) return respond(`❌ Tidak cukup! Punya 🪙 **${user.balance.toLocaleString()}**`);
      user.balance -= bet;
      const win = Math.random() > 0.5;
      let msg;
      if (win) {
        user.balance += bet * 2;
        user.totalEarned = (user.totalEarned || 0) + (bet * 2);
        msg = `**${username}** taruh 🪙 ${bet.toLocaleString()} → **MENANG** 🪙 ${(bet*2).toLocaleString()}!!\nSisa: 🪙 **${user.balance.toLocaleString()}**`;
      } else {
        msg = `**${username}** taruh 🪙 ${bet.toLocaleString()} → **KALAH** :c\nSisa: 🪙 **${user.balance.toLocaleString()}**`;
      }
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      waitUntil(pushLinkedRole(env, discordId, null, user));
      return respond(msg);
    }

    if (cmd === 'wsend') {
      const targetId  = getOption(options, 'target');
      const amountRaw = getOption(options, 'jumlah');
      if (!targetId || targetId === discordId) return respond('❌ Target tidak valid!');
      const targetStr = await env.USERS_KV.get(`user:${targetId}`);
      if (!targetStr) return respond('❌ Target belum punya akun!');
      let target = JSON.parse(targetStr);
      let amount = amountRaw === 'all' ? user.balance : parseInt(amountRaw);
      if (!amount || amount <= 0) return respond('❌ Jumlah tidak valid.');
      if (amount > user.balance) return respond(`❌ Tidak cukup! Punya 🪙 **${user.balance.toLocaleString()}**`);
      user.balance   -= amount;
      target.balance += amount;
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      await env.USERS_KV.put(`user:${targetId}`, JSON.stringify(target));
      return respond(`✅ Kirim 🪙 **${amount.toLocaleString()}** ke <@${targetId}>\nSisa: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'daily') {
      const now = Date.now();
      const lastDaily = user.lastDaily || 0;
      const cooldown = 24 * 60 * 60 * 1000;
      if (now - lastDaily < cooldown) {
        const sisa = cooldown - (now - lastDaily);
        const jam = Math.floor(sisa / 3600000);
        const menit = Math.floor((sisa % 3600000) / 60000);
        return respond(`❌ Daily sudah diambil! Coba lagi dalam **${jam}j ${menit}m**`);
      }
      user.balance += 15000;
      user.totalEarned = (user.totalEarned || 0) + 15000;
      user.lastDaily = now;
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      waitUntil(pushLinkedRole(env, discordId, null, user));
      return respond(`✅ Daily berhasil! +🪙 **15.000**\nSaldo: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'kerja') {
      const now = Date.now();
      const lastKerja = user.lastKerja || 0;
      const cooldown = 60 * 60 * 1000;
      if (now - lastKerja < cooldown) {
        const sisa = cooldown - (now - lastKerja);
        const menit = Math.floor(sisa / 60000);
        const detik = Math.floor((sisa % 60000) / 1000);
        return respond(`❌ Kamu masih lelah! Istirahat dulu **${menit}m ${detik}d**`);
      }
      user.balance += 25000;
      user.totalEarned = (user.totalEarned || 0) + 25000;
      user.lastKerja = now;
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      waitUntil(pushLinkedRole(env, discordId, null, user));
      return respond(`✅ Kamu sudah bekerja keras! +🪙 **25.000**\nSaldo: 🪙 **${user.balance.toLocaleString()}**`);
    }

if (cmd === 'ping') {
  const start = Date.now();
  await fetch('http://18.191.48.129:3000/ping');
  const latency = Date.now() - start;
  return respond(`🏓 Pong! **${latency}ms**`);
}
    if (cmd === 'stats') {
      const list = await env.USERS_KV.list({ prefix: 'user:' });
      let totalPlayers = 0;
      let totalCowoncy = 0;
      for (const key of list.keys) {
        const u = await env.USERS_KV.get(key.name);
        if (u) {
          const parsed = JSON.parse(u);
          totalPlayers++;
          totalCowoncy += parsed.balance || 0;
        }
      }
      return respond(`📊 **Server Stats**\n👥 Total Pemain: **${totalPlayers}**\n🪙 Total Cowoncy Beredar: **${totalCowoncy.toLocaleString()}**`);
    }

    if (cmd === 'leaderboard') {
      const list = await env.USERS_KV.list({ prefix: 'user:' });
      const players = [];
      for (const key of list.keys) {
        const u = await env.USERS_KV.get(key.name);
        if (u) {
          const parsed = JSON.parse(u);
          players.push({ username: key.name.replace('user:', ''), balance: parsed.balance || 0 });
        }
      }
      players.sort((a, b) => b.balance - a.balance);
      const top = players.slice(0, 10);
      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const msg = top.map((p, i) => `${medals[i]} **${p.username}** — 🪙 ${p.balance.toLocaleString()}`).join('\n');
      return respond(`🏆 **Leaderboard Top 10**\n\n${msg || 'Belum ada pemain.'}`);
    }

    if (cmd === 'bank') {
      const now = Date.now();
      const bankBalance = user.bankBalance || 0;
      const lastBunga = user.lastBunga || now;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const weeksPassed = Math.floor((now - lastBunga) / weekMs);
      if (weeksPassed > 0 && bankBalance > 0) {
        const bunga = Math.floor(bankBalance * 0.1 * weeksPassed);
        user.bankBalance = bankBalance + bunga;
        user.lastBunga = lastBunga + (weeksPassed * weekMs);
        await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
        return respond(`🏦 **Bank ${username}**\n💰 Saldo Bank: 🪙 **${user.bankBalance.toLocaleString()}**\n📈 Bunga +🪙 **${bunga.toLocaleString()}** (${weeksPassed} minggu)\n💵 Saldo Dompet: 🪙 **${user.balance.toLocaleString()}**`);
      }
      return respond(`🏦 **Bank ${username}**\n💰 Saldo Bank: 🪙 **${bankBalance.toLocaleString()}**\n📈 Bunga 10%/minggu\n💵 Saldo Dompet: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'deposit') {
      const amountRaw = getOption(options, 'jumlah');
      const amount = amountRaw === 'all' ? user.balance : parseInt(amountRaw);
      if (!amount || amount <= 0) return respond('❌ Jumlah tidak valid.');
      if (amount > user.balance) return respond(`❌ Saldo tidak cukup! Dompet: 🪙 **${user.balance.toLocaleString()}**`);
      user.balance -= amount;
      user.bankBalance = (user.bankBalance || 0) + amount;
      if (!user.lastBunga) user.lastBunga = Date.now();
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      return respond(`✅ Deposit berhasil! +🪙 **${amount.toLocaleString()}** ke bank\n🏦 Saldo Bank: 🪙 **${user.bankBalance.toLocaleString()}**\n💵 Saldo Dompet: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'withdraw') {
      const amountRaw = getOption(options, 'jumlah');
      const bankBalance = user.bankBalance || 0;
      const amount = amountRaw === 'all' ? bankBalance : parseInt(amountRaw);
      if (!amount || amount <= 0) return respond('❌ Jumlah tidak valid.');
      if (amount > bankBalance) return respond(`❌ Saldo bank tidak cukup! Bank: 🪙 **${bankBalance.toLocaleString()}**`);
      user.bankBalance -= amount;
      user.balance += amount;
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      return respond(`✅ Withdraw berhasil! +🪙 **${amount.toLocaleString()}** ke dompet\n🏦 Saldo Bank: 🪙 **${user.bankBalance.toLocaleString()}**\n💵 Saldo Dompet: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'join-giveaway') {
      const giveawayStr = await env.USERS_KV.get('giveaway:active');
      if (!giveawayStr) return respond('❌ Tidak ada giveaway aktif saat ini!');
      const giveaway = JSON.parse(giveawayStr);
      if (Date.now() > giveaway.endTime) return respond('❌ Giveaway sudah berakhir!');
      if (giveaway.participants.includes(discordId)) return respond('❌ Kamu sudah ikut giveaway ini!');
      giveaway.participants.push(discordId);
      await env.USERS_KV.put('giveaway:active', JSON.stringify(giveaway));
      return respond(`✅ Kamu berhasil ikut giveaway!\n👥 Total peserta: **${giveaway.participants.length}**`);
    }

    if (cmd === 'marry') {
  const targetId = getOption(options, 'target');
  if (!targetId) return respond('❌ Target tidak valid!');
  if (targetId === discordId) return respond('❌ Tidak bisa melamar diri sendiri!');

  // Cek sudah punya pasangan
  if (user.partnerId) {
    return respond(`❌ Kamu sudah punya pasangan! <@${user.partnerId}>\nGunakan \`/divorce\` dulu.`);
  }

  // Cek target ada
  const targetStr = await env.USERS_KV.get(`user:${targetId}`);
  if (!targetStr) return respond('❌ Target belum punya akun!');
  const target = JSON.parse(targetStr);

  // Cek target sudah punya pasangan
  if (target.partnerId) {
    return respond(`❌ <@${targetId}> sudah punya pasangan!`);
  }

  // Cek sudah ada lamaran pending
  const existingProposal = await env.USERS_KV.get(`proposal:${targetId}`);
  if (existingProposal) {
    return respond(`❌ <@${targetId}> sudah ada yang melamar! Tunggu dulu.`);
  }

  // Simpan lamaran
  await env.USERS_KV.put(`proposal:${targetId}`, JSON.stringify({
    fromId: discordId,
    fromUsername: username,
    createdAt: Date.now()
  }), { expirationTtl: 300 }); // expired 5 menit

  return respond(
    `💍 **${username}** melamar <@${targetId}>!\n\n` +
    `<@${targetId}> ketik:\n` +
    `✅ \`/accept-marry\` untuk menerima\n` +
    `❌ \`/tolak-marry\` untuk menolak\n\n` +
    `⏰ Lamaran expired dalam **5 menit**`
  );
}

if (cmd === 'accept-marry') {
  // Cek ada lamaran
  const proposalStr = await env.USERS_KV.get(`proposal:${discordId}`);
  if (!proposalStr) return respond('❌ Tidak ada lamaran untukmu saat ini!');
  const proposal = JSON.parse(proposalStr);

  // Cek sudah punya pasangan
  if (user.partnerId) return respond('❌ Kamu sudah punya pasangan!');

  // Cek pelamar masih ada
  const suitorStr = await env.USERS_KV.get(`user:${proposal.fromId}`);
  if (!suitorStr) return respond('❌ Data pelamar tidak ditemukan!');
  const suitor = JSON.parse(suitorStr);

  if (suitor.partnerId) return respond('❌ Pelamar sudah punya pasangan lain!');

  // Jadikan pasangan
  user.partnerId = proposal.fromId;
  user.partnerUsername = proposal.fromUsername;
  user.marriedAt = Date.now();

  suitor.partnerId = discordId;
  suitor.partnerUsername = username;
  suitor.marriedAt = Date.now();

  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  await env.USERS_KV.put(`user:${proposal.fromId}`, JSON.stringify(suitor));
  await env.USERS_KV.delete(`proposal:${discordId}`);

  return respond(
    `💒 **Selamat!** <@${proposal.fromId}> & <@${discordId}> resmi menjadi pasangan!\n` +
    `👫 Semoga bahagia selalu~ 💕`
  );
}

if (cmd === 'tolak-marry') {
  const proposalStr = await env.USERS_KV.get(`proposal:${discordId}`);
  if (!proposalStr) return respond('❌ Tidak ada lamaran untukmu saat ini!');
  const proposal = JSON.parse(proposalStr);

  await env.USERS_KV.delete(`proposal:${discordId}`);

  return respond(
    `💔 <@${discordId}> menolak lamaran **${proposal.fromUsername}**\n` +
    `Sabar ya, jodoh masih banyak! 😢`
  );
}

if (cmd === 'divorce') {
  if (!user.partnerId) return respond('❌ Kamu belum punya pasangan!');

  const partnerStr = await env.USERS_KV.get(`user:${user.partnerId}`);
  const oldPartnerId = user.partnerId;

  // Hapus dari kedua sisi
  user.partnerId = null;
  user.partnerUsername = null;
  user.marriedAt = null;
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));

  if (partnerStr) {
    const partner = JSON.parse(partnerStr);
    partner.partnerId = null;
    partner.partnerUsername = null;
    partner.marriedAt = null;
    await env.USERS_KV.put(`user:${oldPartnerId}`, JSON.stringify(partner));
  }

  return respond(
    `💔 **${username}** telah bercerai dari <@${oldPartnerId}>\n` +
    `Semoga lekas move on~ 😢`
  );
}

if (cmd === 'partner') {
  if (!user.partnerId) return respond('❌ Kamu belum punya pasangan!\nGunakan `/marry @user` untuk melamar seseorang 💍');

  const marriedAt = user.marriedAt ? new Date(user.marriedAt) : null;
  const daysTogether = marriedAt
    ? Math.floor((Date.now() - user.marriedAt) / (1000 * 60 * 60 * 24))
    : 0;

  return respond(
    `👫 **Pasangan ${username}**\n\n` +
    `💕 Partner: <@${user.partnerId}>\n` +
    `📅 Menikah: ${marriedAt ? marriedAt.toLocaleDateString('id-ID') : 'Tidak diketahui'}\n` +
    `❤️ Sudah bersama: **${daysTogether} hari**`
  );
}


if (cmd === 'roast') {
  const targetId = getOption(options, 'target');
  const targetMention = targetId ? `<@${targetId}>` : `<@${discordId}>`;

  const roasts = [
    `otaknya kayak RAM 256MB, lemot & sering not responding 💀`,
    `mukanya kayak captcha, bikin orang males lanjut 😭`,
    `hidupnya kayak wifi gratisan, sering putus & gak bisa diandalkan 📶`,
    `kayak baterai 1%, selalu minta perhatian tapi gak ada gunanya 🔋`,
    `ngomongnya kayak iklan youtube, skip terus tetep muncul 😤`,
    `otaknya kayak flashdisk 2GB, isinya kosong & udah jadul 💾`,
    `kayak sinyal di lift, hilang pas paling dibutuhin 📵`,
    `hidupnya kayak loading bar 99%, lama banget ga kelar-kelar ⏳`,
    `kayak aplikasi yang gak pernah di-update, penuh bug & ketinggalan zaman 🐛`,
    `mukanya kayak error 404, dicari-cari tapi gak ketemu yang bagus 😬`,
    `kayak printer kantor, lemot, sering macet & bikin frustrasi 🖨️`,
    `otaknya kayak recycle bin, isinya sampah semua 🗑️`,
    `kayak mouse tanpa baterai, gerak-geraknya gak ada arahnya 🖱️`,
    `hidupnya kayak dark mode, gelap & bikin mata sakit 🌑`,
    `kayak keyboard tanpa huruf A, ada yang kurang tapi gak ketauan 😂`,
    `kayak update windows, datangnya gak diundang & ganggu mulu ⚙️`,
    `kayak harddisk penuh, lemot & gak bisa nerima hal baru 💽`,
    `kayak notifikasi spam, sering muncul tapi gak penting 🔔`,
    `kayak laptop overheat, panas tapi gak ada gunanya 🔥`,
    `kayak password yang lupa, susah diinget & bikin repot 🔑`,
    `kayak game mobile, banyak iklannya tapi gameplaynya gak ada 📱`,
    `kayak earphone murah, gampang rusak & suaranya cempreng 🎧`,
    `kayak charger palsu, lama ngisinya & berbahaya 🔌`,
    `kayak GPS rusak, sering nyasar & gak bisa diandalkan 🗺️`,
    `kayak baterai laptop 2%, hidup sebentar lalu mati total 🪫`,
    `kayak software bajakan, penuh virus & gak ada supportnya 💻`,
    `kayak koneksi 2G, lemot banget & bikin emosi 🐌`,
    `kayak tombol skip yang gak muncul-muncul, nyebelin abis ⏭️`,
    `kayak server down, pas dibutuhin malah gak bisa diakses 🚫`,
    `kayak foto blur, ada tapi gak jelas juga buat apa 📷`,
    `kayak buku tanpa isi, covernya oke tapi dalamnya kosong 📚`,
    `kayak kamus tanpa kata, ada tapi gak berguna sama sekali 📖`,
    `kayak jam mati, bener cuma 2x sehari 🕐`,
    `kayak payung bolong, ada tapi tetep bikin basah ☂️`,
    `kayak obat kadaluarsa, ada tapi bahaya kalau dipake 💊`,
    `kayak kompas yang salah arah, nyesatin orang mulu 🧭`,
    `kayak cermin buram, pantulannya gak jelas & gak membantu 🪞`,
    `kayak kalkulator rusak, jawabannya selalu salah 🔢`,
    `kayak alarm yang gak bunyi, ada tapi gak fungsi sama sekali ⏰`,
    `kayak lift yang macet, naik dulu tapi akhirnya stuck di tengah 🛗`,
    `kayak AC tanpa freon, ada tapi panasnya tetep kerasa 🥵`,
    `kayak remote tanpa baterai, pegang-pegang tapi gak ada hasilnya 📺`,
    `kayak peta kuno, ada tapi semua infonya udah gak relevan 🗺️`,
    `kayak mesin fax, ada yang pake tapi udah gak zaman 📠`,
    `kayak disket 1.44MB, kecil kapasitasnya & udah gak kepake 💾`,
    `kayak telepon umum, jarang ada yang mau pake lagi 📞`,
    `kayak VCD player, udah ketinggalan zaman banget 📀`,
    `kayak antena tv analog, sering gangguan & gambarnya bintik-bintik 📡`,
    `kayak koran kemarin, infonya udah basi semua 📰`,
    `kayak kalender tahun lalu, udah gak relevan tapi masih dipajang 📅`,
    `kayak bola kempes, ada tapi gak bisa diajak main ⚽`,
    `kayak raket putus, mau dipake tapi malah bikin gagal 🏸`,
    `kayak sepatu berlubang, ada tapi malah bikin celaka 👟`,
    `kayak payung terbalik, ada tapi malah nampung masalah ☂️`,
    `kayak tas bocor, semua yang dipercayain malah ilang 👜`,
    `kayak kunci patah, udah susah dipake & bikin repot 🔑`,
    `kayak lilin di bawah hujan, nyalanya gak lama & gak berguna 🕯️`,
    `kayak es batu di padang pasir, cepet ilang & gak ada gunanya 🧊`,
    `kayak api di bawah air, excited tapi langsung padam 🔥`,
    `kayak balon bocor, penuh semangat tapi cepet kempes 🎈`,
    `kayak bunga plastik, keliatannya oke tapi gak ada wangi & nyawanya 🌸`,
    `kayak hiasan dinding, ada tapi gak kontribusi apa-apa 🖼️`,
    `kayak patung lilin, mirip manusia tapi gak ada isinya 🗿`,
    `kayak boneka baru, lucu sebentar terus ditinggal di pojok 🪆`,
    `kayak mainan rusak, dibawa-bawa tapi udah gak fungsi 🧸`,
    `kayak puzzle kurang 1 keping, gak pernah bisa komplit 🧩`,
    `kayak kartu remi joker, ada tapi gak selalu dibutuhin 🃏`,
    `kayak dadu curang, hasilnya gak pernah bisa dipercaya 🎲`,
    `kayak catur tanpa raja, mainin tapi gak ada tujuannya ♟️`,
    `kayak kendang tanpa suara, gerak-gerak tapi gak ada hasilnya 🥁`,
    `kayak gitar fals, ada bunyinya tapi bikin telinga sakit 🎸`,
    `kayak mikrofon mati, ngomong banyak tapi gak ada yang denger 🎤`,
    `kayak speaker dengan volume 0, ada tapi percuma aja 🔊`,
    `kayak headset kabel kusut, ada tapi ribet & bikin frustrasi 🎧`,
    `kayak foto tanpa subjek, ada tapi gak ada isinya 📸`,
    `kayak video tanpa audio, ada tapi setengah-setengah 🎬`,
    `kayak film tanpa plot, panjang tapi gak ada ceritanya 🎥`,
    `kayak buku tanpa ending, bikin penasaran tapi gak memuaskan 📕`,
    `kayak lagu tanpa lirik, ada melodinya tapi gak ada maknanya 🎵`,
    `kayak resep tanpa takaran, ada tapi hasilnya gak jelas 📋`,
    `kayak masakan tanpa garam, ada tapi hambar banget 🧂`,
    `kayak kopi tanpa kafein, ada tapi gak ada efeknya ☕`,
    `kayak pizza tanpa topping, ada tapi ngebosenin 🍕`,
    `kayak burger tanpa isi, ada tapi cuma kulit doang 🍔`,
    `kayak mi instan tanpa bumbu, ada tapi gak ada rasanya 🍜`,
    `kayak es krim yang udah mencair, ada tapi udah gak enak 🍦`,
    `kayak permen tanpa rasa, ada tapi bikin kecewa 🍬`,
    `kayak coklat pahit tanpa manis, ada tapi ninggalin rasa gak enak 🍫`,
    `kayak minuman bersoda yang kempes, udah gak ada sparkle-nya 🥤`,
    `kayak buah busuk, dari luar oke tapi dalamnya udah gak layak 🍎`,
    `kayak sayur layu, dulunya segar tapi sekarang gak berguna 🥬`,
    `kayak nasi basi, ada tapi bahaya kalau tetep dipake 🍚`,
    `kayak telur retak, kelihatannya utuh tapi udah bocor dari dalam 🥚`,
    `kayak susu kadaluarsa, udah lewat masanya tapi masih sok fresh 🥛`,
    `kayak roti berjamur, dari luar oke tapi dalamnya udah rusak 🍞`,
    `kayak teh tanpa daun teh, ada airnya tapi gak ada isinya 🍵`,
    `kayak jus tanpa buah, ada warnanya tapi gak ada substansinya 🧃`,
    `kayak sup tanpa kuah, ada mangkuknya tapi kosong melompong 🍲`,
    `kayak mie tanpa mi, ada wadahnya tapi isinya nihil 🍝`,
    `kayak wifi tetangga, kenceng dilihat tapi gak bisa diakses 📶`,
    `kayak charger 5 watt, lama banget prosesnya & gak efisien ⚡`,
    `kayak antivirus gratisan, ada tapi virusnya tetep masuk 🛡️`,
    `kayak browser IE, masih ada yang pake tapi udah gak relevan 🌐`,
    `kayak website tanpa SSL, gak aman & bikin orang kabur 🔓`,
    `kayak domain expired, udah gak bisa diakses & gak ada nilainya 🌍`,
    `kayak server 500, error mulu & gak bisa diandalkan 🖥️`,
    `kayak database corrupt, datanya ada tapi gak bisa dibaca 💾`,
    `kayak coding tanpa comment, ada tapi gak ada yang ngerti 👨‍💻`,
    `kayak bug yang gak ketemu, ada tapi nyebelin & susah dihilangin 🐛`,
    `kayak deploy gagal, udah usaha keras tapi hasilnya nihil 🚀`,
    `kayak git conflict, ada tapi bikin semua orang pusing 🔀`,
    `kayak pull request ditolak, udah semangat tapi akhirnya percuma ❌`,
    `kayak loop tak berujung, jalan terus tapi gak kemana-mana 🔄`,
    `kayak variabel undefined, dipanggil-panggil tapi gak ada isinya 📝`,
    `kayak null pointer, ada tapi langsung crash pas dipake 💥`,
    `kayak syntax error, salah mulu & bikin semua berhenti ⛔`,
    `kayak compile error, belum mulai udah gagal duluan 🔨`,
    `kayak stack overflow, penuh masalah tapi gak ada solusinya 📚`,
    `kayak memory leak, lama-lama ngabisin semua resources orang sekitar 🧠`,
    `kayak ping 999ms, ada koneksinya tapi gak bisa diajak ngapa-ngapain 🏓`,
    `kayak packet loss 100%, pesan dikirim tapi gak pernah nyampe 📨`,
    `kayak firewall ketat, semua orang diblock & gak bisa masuk 🧱`,
    `kayak VPN gratisan, lambat, gak aman & sering putus 🔒`,
    `kayak cookie expired, harus diulang dari awal mulu 🍪`,
    `kayak cache penuh, lemot & butuh di-clear biar normal lagi 🗑️`,
    `kayak resolusi 144p, buram & bikin mata sakit 📺`,
    `kayak framerate 5fps, geraknya patah-patah & gak enak dilihat 🎮`,
    `kayak lag spike pas fight, ada tapi malah bikin kalah sendiri ⚔️`,
    `kayak cheat yang ketahuan, curang tapi ujungnya diban juga 🚫`,
    `kayak respawn timer 60 detik, nunggu lama tapi pas balik langsung mati lagi ⏱️`,
    `kayak item legendary yang dropnya 0.001%, ada tapi gak bakal dapet 🎰`,
    `kayak hero support yang gak mau support, ada tapi gak berguna 🦸`,
    `kayak tank yang gak mau frontline, pengecut & bikin tim kalah 🛡️`,
    `kayak jungle yang gak gank, farming sendiri & gak peduli tim 🌲`,
    `kayak carry yang selalu feeding, ada tapi malah nguntungin musuh 💀`,
    `kayak healer yang hemat skill, ada tapi biarin timnya mati 💉`,
    `kayak sniper yang selalu miss, banyak gaya tapi gak pernah kena 🎯`,
    `kayak speedrunner yang selalu fail, cepet-cepetan tapi ujungnya game over 🏃`,
    `kayak tutorial yang gak jelas, ada penjelasannya tapi makin bingung 📖`,
    `kayak walkthrough yang salah, ngikutin tapi malah nyasar 🗺️`,
    `kayak achievements yang gak bisa di-unlock, ada tapi gak pernah kesampaian 🏆`,
    `kayak DLC yang gak worth it, bayar mahal tapi isinya receh 💸`,
    `kayak season pass kosong, beli mahal tapi gak ada kontennya 🎫`,
    `kayak early access forever, dijanjiin selesai tapi gak pernah rilis 🕹️`,
    `kayak patch yang bikin game makin rusak, ada tapi malah nambah masalah 🔧`,
    `kayak review bintang 1, ada tapi bikin orang kabur semua ⭐`,
    `kayak refund yang ditolak, udah nyesel tapi gak bisa balik lagi 💔`,
    `kayak terms & conditions, panjang banget tapi gak ada yang baca 📜`,
    `kayak EULA yang gak ada yang setujuin, ada tapi gak ada yang peduli 🤷`,
    `kayak followers palsu, banyak tapi gak ada yang genuine 👥`,
    `kayak like dari bot, ada tapi gak bermakna sama sekali 👍`,
    `kayak story 24 jam, ada sebentar terus ilang gak berbekas 📱`,
    `kayak reels yang di-skip, gak sampai 3 detik udah ditinggal 🎬`,
    `kayak konten receh, banyak yang liat tapi gak ada yang respect 😂`,
    `kayak influencer tanpa pengaruh, eksis tapi gak ada dampaknya 🌟`,
    `kayak endorse yang gak laku, dibayar tapi tetep gak ada yang beli 💰`,
    `kayak viral sesaat, rame sebentar terus dilupain selamanya 🔥`,
    `kayak trending no 1 yang gak jelas, rame tapi gak ada gunanya 📈`,
    `kayak hashtag yang gak nyambung, ada tapi bikin bingung semua orang #️⃣`,
    `kayak caption panjang yang gak ada yang baca, nulis banyak tapi percuma ✍️`,
    `kayak bio kosong, ada profilnya tapi gak ada isinya 📋`,
    `kayak akun private yang gak ada isinya, bikin penasaran tapi kecewa pas dibuka 🔐`,
    `kayak menfess yang gak di-publish, udah nulis panjang tapi gak ada hasilnya 📩`,
    `kayak dm yang di-read tapi gak dibalas, ada tapi sengaja diabaikan 💬`,
    `kayak grup yang sunyi, banyak member tapi gak ada yang ngomong 🔇`,
    `kayak broadcast message, dikirim ke semua tapi gak ada yang peduli 📢`,
    `kayak forward-an hoax, disebarkan kemana-mana tapi isinya bohong 🤥`,
    `kayak thread panjang yang gak ada kesimpulannya, buang waktu orang doang 🧵`,
    `kayak podcast yang gak ada pendengarnya, ngomong panjang tapi gak ada yang dengerin 🎙️`,
    `kayak YouTube channel tanpa views, upload terus tapi sepi melompong 📹`,
    `kayak thumbnail clickbait, menarik di luar tapi isinya mengecewakan 🖼️`,
    `kayak intro video yang kepanjangan, buang waktu & bikin orang skip ⏩`,
    `kayak outro yang gak ada subscribe-nya, ada tapi gak ada dampaknya 🔔`,
    `kayak komen toxic di YouTube, ada tapi bikin suasana jelek 💀`,
    `kayak dislike anonim, gak suka tapi pengecut gak mau ketauan 👎`,
    `kayak report palsu, ngeselin orang tanpa alasan yang jelas 🚩`,
    `kayak akun banned, pernah ada tapi sekarang udah gak relevan ⛔`,
    `kayak meme basi, dulu lucu sekarang udah bikin cringe 😬`,
    `kayak copas tanpa credit, ada tapi gak original sama sekali 📋`,
    `kayak essay asal-asalan, panjang tapi isinya gak berbobot 📝`,
    `kayak presentasi tanpa persiapan, tampil tapi bikin malu sendiri 🎤`,
    `kayak slide penuh teks, ada tapi bikin semua orang ngantuk 😴`,
    `kayak tugas dikerjain 5 menit, ada tapi kualitasnya ketahuan 📚`,
    `kayak skripsi yang gak kelar-kelar, udah lama tapi gak ada hasilnya 🎓`,
    `kayak dosen yang gak jelas ngajarnya, ada tapi bikin makin bingung 👨‍🏫`,
    `kayak absen tapi gak masuk, namanya ada tapi orangnya gak berguna 📝`,
    `kayak nilai pas-pasan, ada tapi gak ada yang bangga 📊`,
    `kayak remedial terus, dikasih kesempatan berkali-kali tapi tetep gagal 📉`,
    `kayak organisasi yang gak produktif, rapat mulu tapi gak ada hasilnya 🏢`,
    `kayak ketua yang gak bisa mimpin, ada jabatannya tapi gak ada wibawanya 👑`,
    `kayak anggota yang gak kontribusi, hadir tapi gak ada gunanya 🪑`,
    `kayak acara yang molor 3 jam, ada tapi bikin semua orang frustrasi ⏰`,
    `kayak MC yang garing, ada tapi suasananya malah jadi canggung 🎙️`,
    `kayak door prize yang gak pernah menang, ikut terus tapi selalu zonk 🎁`,
    `kayak panitia yang kacau, kerja keras tapi hasilnya berantakan 😵`,
    `kayak sponsor yang gak ada uangnya, janji banyak tapi nihil realisasi 💸`,
    `kayak proposal yang ditolak, udah susah payah tapi tetep gagal 📄`,
    `kayak rencana tanpa eksekusi, ide bagus tapi gak pernah jalan 💡`,
    `kayak meeting yang bisa jadi email, buang waktu & gak ada hasilnya 📧`,
    `kayak deadline yang molor, dijanjiin tapi selalu telat 📅`,
    `kayak target yang gak pernah tercapai, ada tapi cuma jadi mimpi 🎯`,
    `kayak motivasi sesaat, semangat sebentar terus balik males lagi 💪`,
    `kayak resolusi tahun baru, dibuat tiap tahun tapi gak pernah dijalanin 🎊`,
    `kayak diet yang gagal di hari pertama, niat doang tapi gak ada action 🥗`,
    `kayak gym membership yang gak dipake, bayar mahal tapi gak ada hasilnya 🏋️`,
    `kayak lari pagi yang cuma seminggu, semangat awal tapi langsung berhenti 🏃`,
    `kayak buku self-improvement yang gak selesai dibaca, beli tapi pajangan doang 📚`,
    `kayak kelas online yang gak diselesaiin, daftar tapi gak pernah lulus 💻`,
    `kayak sertifikat yang dipajang tapi ilmunya gak dipake, ada tapi cuma hiasan 🏅`,
    `kayak skill yang gak diasah, ada bakatnya tapi disia-siain terus 🎨`,
    `kayak potensi yang terbuang, bisa jadi bagus tapi males effort 💎`,
    `kayak bakat terpendam yang gak pernah keluar, ada tapi gak ada yang tahu 🌟`,
    `kayak investment yang rugi, udah capek tapi hasilnya minus 📉`,
    `kayak saham yang terus turun, ada nilainya tapi makin lama makin gak berharga 💹`,
    `kayak tabungan yang selalu habis, ada tapi gak pernah cukup 💳`,
    `kayak dompet tipis, ada tapi isinya bikin nangis 👛`,
    `kayak ATM kosong, didatengin tapi gak ada yang bisa diambil 🏧`,
    `kayak diskon yang gak berlaku, dikasih harapan tapi ujungnya kecewa 🏷️`,
    `kayak promo syarat & ketentuan berlaku, kelihatannya menarik tapi penuh jebakan 📜`,
    `kayak cashback yang gak pernah cair, dijanjiin tapi gak pernah ada 💰`,
    `kayak poin reward yang expired, udah dikumpulin tapi hangus gitu aja ⌛`,
    `kayak voucher minimum pembelian tinggi, ada tapi susah dipakenya 🎫`,
    `kayak gratis ongkir yang ternyata ada syaratnya, dikasih harapan palsu 🚚`,
    `kayak review bintang 5 yang dibeli, kelihatannya bagus tapi gak genuine ⭐`,
    `kayak garansi yang susah diklaim, ada tapi pas butuh malah dipersulit 🔧`,
    `kayak customer service yang gak helpful, ada tapi masalah tetap gak kelar 📞`,
    `kayak FAQ yang gak jawab pertanyaan, ada tapi gak berguna sama sekali ❓`,
    `kayak manual book yang gak ada yang baca, ada tapi cuma jadi sampah 📖`,
    `kayak packaging mewah isi tipis, luarnya keren dalamnya mengecewakan 📦`,
    `kayak produk limited edition yang gak laku, eksklusif tapi gak ada yang mau 🏷️`,
    `kayak iklan 30 detik yang gak bisa di-skip, ada tapi nyebelin banget 📺`,
    `kayak sales yang maksa, ada tapi bikin orang kabur 🏃`,
    `kayak demo gratis yang langsung expired, dikasih rasa tapi langsung diputus 🔚`,
    `kayak free trial yang minta kartu kredit, gratis tapi penuh jebakan 💳`,
    `kayak unsubscribe yang gak berfungsi, mau pergi tapi tetap dihantui 📧`,
    `kayak notifikasi yang gak bisa dimatiin, ganggu terus tanpa henti 🔔`,
    `kayak pop-up yang terus muncul, ditutup satu muncul lagi sepuluh 😤`,
    `kayak cookie consent yang gak bisa ditolak, dipaksa setuju mau gak mau 🍪`,
    `kayak paywall yang muncul di tengah baca, udah asik eh langsung diblok 🧱`,
    `kayak koneksi internet pas hujan, ada sinyal tapi gak bisa diajak ngapa-ngapain 🌧️`,
    `kayak baterai yang gak mau full, dicharge lama tapi tetep mentok 99% 🔋`,
    `kayak update yang gagal di tengah jalan, udah mulai tapi malah stuck ⚙️`,
    `kayak restore factory yang gak nyelesain masalah, reset ulang tapi masalahnya sama 🔄`,
    `kayak technical support level 1, nanya nama dulu & masalahnya tetep ada 🎧`,
    `kayak error yang gak ada di Google, nyari solusi tapi gak ketemu kemana-mana 🔍`,
    `kayak stackoverflow yang dijawab "duplicate question", ada tapi gak dibantu 💻`,
    `kayak dokumentasi yang outdated, ada tapi infonya udah gak berlaku 📄`,
    `kayak tutorial 2015 untuk software 2024, ada tapi tampilan & caranya udah beda 🖥️`,
    `kayak library yang deprecated, pernah berguna tapi sekarang udah ditinggal 📦`,
    `kayak GPS yang update peta 10 tahun sekali, ada tapi infonya selalu ketinggalan zaman 🗺️`,
    `kayak kompas yang terpengaruh magnet, ada tapi arahannya gak bisa dipercaya 🧭`,
    `kayak barometer yang error, ada tapi prediksinya selalu meleset jauh 🌡️`,
    `kayak teleskop yang lensanya kotor, ada tapi yang dilihat tetap buram 🔭`,
    `kayak mikroskop yang fokusnya gak bisa diatur, ada tapi objeknya tetap gak jelas 🔬`,
    `kayak kalkulator scientific yang baterainya sekarat, ada tapi hasilnya gak akurat 🔢`,
    `kayak penggaris laser yang bengkok, ada tapi garisnya tetap gak lurus 📏`,
    `kayak jangka yang kakinya longgar, ada tapi lingkarannya gak pernah sempurna ⭕`,
    `kayak busur derajat yang retak, ada tapi sudutnya selalu salah 📐`,
    `kayak meteran yang per-nya lemah, ada tapi ukurannya selalu gak akurat 📏`,
    `kayak timbangan yang gak terkalibrasi, ada tapi hasilnya gak bisa dipercaya ⚖️`,
    `kayak termometer yang rusak, ada tapi suhunya selalu beda dari kenyataan 🌡️`,
    `kayak jam pasir yang bocor, ada tapi waktunya cepet habis gak karuan ⏳`,
    `kayak stopwatch yang lag, ada tapi waktunya gak akurat sama sekali ⏱️`,
    `kayak kalender yang salah cetak, ada tapi tanggalnya bikin bingung semua orang 📅`,
    `kayak agenda yang kosong, ada tapi gak ada yang dicatat & direncanain 📓`,
    `kayak planner yang cuma sampul, dibeli mahal tapi halamannya kosong semua 📒`,
    `kayak sticky notes yang udah gak lengket, ditempel tapi jatuh melulu 📌`,
    `kayak reminder yang gak bunyi, ada tapi tugasnya tetap ketinggalan ⏰`,
    `kayak to-do list yang gak pernah di-check, dibuat panjang tapi gak ada yang dikerjain ✅`,
    `kayak target harian yang selalu gagal, ditulis setiap hari tapi gak pernah tercapai 🎯`,
    `kayak habit tracker yang isinya kosong, ada tapi kebiasaannya gak pernah terbentuk 📊`,
    `kayak jurnal yang gak pernah ditulis, dibeli mahal tapi halamannya masih bersih 📔`,
    `kayak buku mimpi yang gak pernah terwujud, ada tapi cuma jadi koleksi doang 💭`,
    `kayak vision board yang gak pernah dilihat, ditempel tapi visualisasinya gak pernah terjadi 🖼️`,
    `kayak mood board yang berantakan, ada tapi gak ada tema yang jelas 🎨`,
    `kayak portfolio kosong, ada tempatnya tapi gak ada karya yang mau ditunjukin 💼`,
    `kayak CV yang gak ada pengalamannya, ada formatnya tapi isinya nihil 📄`,
    `kayak cover letter yang copy paste, ada tapi jelas-jelas gak personal sama sekali ✉️`,
    `kayak wawancara yang nervous banget, ada kesempatannya tapi sendirinya yang ngerusak 😰`,
    `kayak referensi yang gak bisa dihubungi, dicantumkan tapi pas ditelepon gak angkat 📞`,
    `kayak ijazah yang gak diakui, ada tapi nilainya gak dipandang di mana-mana 🎓`,
    `kayak sertifikat online yang gak kredibel, ada tapi gak ada yang serius ngeliriknya 📜`,
    `kayak gelar yang gak sesuai bidang kerja, ada tapi gak relevan sama sekali 🎓`,
    `kayak magang yang gak dapet ilmu, ada pengalamannya tapi cuma disuruh beli kopi ☕`,
    `kayak fresh graduate yang ekspektasinya tinggi, semangat tapi realitanya jauh banget 👶`,
    `kayak karyawan baru yang sok senior, baru masuk tapi udah sok tahu segalanya 👔`,
    `kayak probasi yang gak lolos, dikasih kesempatan tapi tetap gagal buktiin diri 📋`,
    `kayak promosi yang gak pernah dateng, nunggu bertahun-tahun tapi tetap di posisi sama 📈`,
    `kayak bonus yang selalu ada alasan buat ditunda, dijanjiin tapi gak pernah cair 💰`,
    `kayak kenaikan gaji yang tipis banget, ada tapi gak nutup inflasi sama sekali 💸`,
    `kayak meeting mingguan yang gak produktif, hadir tapi gak ada keputusan yang diambil 🗓️`,
    `kayak brainstorming yang gak ada ide, kumpul bareng tapi hasilnya kosong melompong 💡`,
    `kayak project yang selalu molor, dimulai penuh semangat tapi deadlinenya gak pernah tepat 📅`,
    `kayak laporan yang gak selesai, dikerjain panjang tapi ujungnya gak jadi diserahkan 📑`,
    `kayak presentasi yang gak ada data, ngomong banyak tapi gak ada fakta yang mendukung 📊`,
    `kayak analisis yang salah metode, ada hasilnya tapi gak bisa dipercaya kebenarannya 🔍`,
    `kayak riset yang gak ada kesimpulan, panjang prosesnya tapi ujungnya gak jelas 📚`,
    `kayak hipotesis yang selalu salah, diajukan dengan yakin tapi buktinya gak ada 🧪`,
    `kayak eksperimen yang gagal terus, dicoba berkali-kali tapi hasilnya tetap gak sesuai 🔬`,
    `kayak teori tanpa praktik, paham konsepnya tapi pas diterapin langsung bingung 📖`,
    `kayak praktik tanpa teori, langsung terjun tapi gak punya dasar yang kuat 🏊`,
    `kayak ujian yang selalu minta contekan, ada tapi gak punya kemampuan sendiri 📝`,
    `kayak jawaban yang ngasal, ada isinya tapi semua salah 📋`,
    `kayak nilai yang di-inflasi, kelihatannya bagus tapi kemampuan aslinya gak mencerminkan 🎓`,
    `kayak ranking yang gak jelas kriterianya, ada posisinya tapi gak ada yang respek 🏆`,
    `kayak penghargaan yang gak layak, ada trofinya tapi semua tahu gak pantas dapet 🥇`,
    `kayak lomba yang gak ada saingannya, menang tapi karena gak ada yang mau ikut 🏅`,
    `kayak juara bertahan yang tinggal nama, dulu pernah bagus tapi sekarang udah gak relevan 👑`,
    `kayak rekor yang gampang dipecahkan, ada pencapaiannya tapi standarnya terlalu rendah 📊`,
    `kayak statistik yang menyesatkan, ada angkanya tapi interpretasinya salah semua 📈`,
    `kayak grafik yang gak ada label, ada visualnya tapi gak ada yang ngerti maksudnya 📉`,
    `kayak data yang gak valid, ada tapi kualitasnya gak bisa dipakai buat analisis 🗂️`,
    `kayak sampel yang gak representatif, ada penelitiannya tapi hasilnya gak bisa digeneralisasi 🔢`,
    `kayak survei yang bias, ada datanya tapi hasilnya udah bisa ditebak dari awal 📋`,
    `kayak polling yang dimanipulasi, ada hasilnya tapi gak mencerminkan opini sebenarnya 🗳️`,
    `kayak berita yang gak diverifikasi, ada informasinya tapi kebenarannya diragukan 📰`,
    `kayak sumber yang gak kredibel, ada referensinya tapi gak ada yang mau percaya 📚`,
    `kayak argumen yang gak logis, ada pendapatnya tapi penalarannya kacau balau 🧠`,
    `kayak debat yang gak ada poinnya, ngomong panjang tapi gak ada yang menang 💬`,
    `kayak negosiasi yang selalu kalah, ada usahanya tapi ujungnya selalu dirugikan 🤝`,
    `kayak tawar-menawar yang gak berhasil, ada proses tapi harganya tetap mahal 💰`,
    `kayak kontrak yang penuh klausul tersembunyi, ada perjanjiannya tapi penuh jebakan 📝`,
    `kayak janji yang gak pernah ditepati, ada ucapannya tapi realisasinya nol besar 🤞`,
    `kayak komitmen yang setengah-setengah, ada tapi selalu ada alasan buat kabur 💔`,
    `kayak loyalitas yang gak tulus, ada tapi cuma bertahan selama masih menguntungkan 🏳️`,
    `kayak persahabatan yang cuma pas senang, ada tapi menghilang pas susah 👥`,
    `kayak teman yang pinjam gak balikin, ada tapi meninggalkan kerugian terus 😒`,
    `kayak teman ghosting, baik-baik aja tiba-tiba ilang tanpa penjelasan 👻`,
    `kayak kenalan yang cuma minta tolong, ada tapi selalu ada keperluannya doang 🙄`,
    `kayak relasi yang satu arah, ada hubungannya tapi yang usaha cuma satu pihak 🔄`,
    `kayak networking yang gak ada follow-up-nya, tukar kartu nama tapi gak ada lanjutannya 💼`,
    `kayak kontak yang gak pernah direspon, disimpan nomornya tapi gak ada gunanya 📱`,
    `kayak grup alumni yang sepi, ada grupnya tapi gak ada yang aktif sama sekali 🎓`,
    `kayak reuni yang dipaksa, hadir tapi gak nyaman & gak ada yang dekat 🤝`,
    `kayak pertemanan online yang gak real, ribuan teman tapi gak ada yang kenal aslinya 💻`,
    `kayak follower yang gak engage, ada jumlahnya tapi gak ada interaksinya 📱`,
    `kayak komunitas yang gak aktif, ada grupnya tapi semua anggotanya diam aja 🔇`,
    `kayak volunteer yang gak kontribusi, daftar tapi gak pernah muncul pas dibutuhkan 🙋`,
    `kayak donasi yang gak jelas peruntukannya, ada uangnya tapi gak jelas kemana perginya 💸`,
    `kayak fundraising yang gak capai target, ada usahanya tapi hasilnya jauh dari cukup 🎯`,
    `kayak kampanye sosial yang gak berdampak, ada gerakannya tapi gak ada perubahan nyata 📢`,
    `kayak petisi yang gak dikabulkan, tanda tangan banyak tapi gak ada hasilnya ✍️`,
    `kayak protes yang gak didengar, ada suaranya tapi penguasa tetap gak peduli 📣`,
    `kayak demonstrasi yang bubar sendiri, ada semangatnya tapi gak ada yang bertahan sampai akhir 🏳️`,
    `kayak revolusi yang gak pernah mulai, ada rencananya tapi eksekusinya gak pernah terjadi ⚡`,
    `kayak perubahan yang lambat banget, ada prosesnya tapi gak ada yang bisa ngerasain bedanya 🐢`,
    `kayak inovasi yang gak diterima pasar, ada ide barunya tapi gak ada yang mau pakai 💡`,
    `kayak startup yang gak dapat funding, ada idenya tapi gak bisa berkembang 🚀`,
    `kayak pitch deck yang gak meyakinkan, ada presentasinya tapi investor langsung skip 📊`,
    `kayak business plan yang gak realistis, ada rencananya tapi angkanya gak masuk akal 💼`,
    `kayak proyeksi keuangan yang terlalu optimis, ada targetnya tapi gak ada yang percaya 📈`,
    `kayak MVP yang gak ada minimum-nya, ada produknya tapi penuh bug dari awal 🔧`,
    `kayak pivot yang terlalu sering, ada bisnis tapi arahnya gak pernah jelas 🔄`,
    `kayak scale-up yang prematur, belum siap tapi udah sok mau besar 📏`,
    `kayak unicorn yang ternyata kuda biasa, valuasi tinggi tapi fundamentalnya gak ada 🦄`,
    `kayak IPO yang langsung turun, heboh di awal tapi langsung kecewain investor 📉`,
    `kayak akuisisi yang gak menguntungkan, dibeli mahal tapi gak ada nilai tambahnya 💰`,
    `kayak merger yang gagal, disatukan tapi malah jadi lebih berantakan dari sebelumnya 🔀`,
    `kayak rebranding yang gak ngaruh, ganti nama tapi reputasinya tetap buruk 🏷️`,
    `kayak iklan mahal yang gak efektif, bujet besar tapi penjualannya tetap flat 📺`,
    `kayak konten marketing yang gak engage, ada postingannya tapi gak ada yang peduli 📱`,
    `kayak SEO yang gak jalan, ada optimasinya tapi ranking-nya tetap di halaman 10 🔍`,
    `kayak website yang gak mobile-friendly, ada tapi pengunjungnya langsung kabur 📱`,
    `kayak landing page yang konversinya nol, ada traffic tapi gak ada yang mau beli 🖥️`,
    `kayak CTA yang gak persuasif, ada tombolnya tapi gak ada yang mau klik 🖱️`,
    `kayak funnel yang bocor, ada prosesnya tapi lead-nya pada kabur di tiap tahap 🔽`,
    `kayak retention yang buruk, bisa dapetin user tapi gak bisa ngejaga mereka tetap stay 📊`,
    `kayak churn rate yang tinggi, baru dapet customer langsung pergi lagi 🚪`,
    `kayak NPS yang negatif, ada produknya tapi semua orang malah nyaraninnya buat dihindari 📋`,
    `kayak ulasan 1 bintang yang bertumpuk, ada produk tapi reviewnya bikin orang kabur ⭐`,
    `kayak customer complaint yang gak direspon, ada masalah tapi perusahaannya pura-pura gak tahu 📞`,
    `kayak refund yang dipersulit, udah bayar tapi minta balik uang aja susahnya minta ampun 💸`,
    `kayak garansi yang penuh pengecualian, ada jaminannya tapi pas klaim selalu ada alasannya 📜`,
    `kayak after-sales yang gak ada, beli produk tapi ditinggal begitu aja setelah bayar 🛒`,
    `kayak manual yang gak ada, produk canggih tapi gak ada panduan cara pakainya 📖`,
    `kayak tutorial yang bikin makin bingung, ada penjelasannya tapi malah nambah pertanyaan 🤔`,
    `kayak FAQ yang gak ada jawaban relevannya, ada listnya tapi pertanyaan kita gak ada 📋`,
    `kayak chatbot yang gak ngerti konteks, ada responnya tapi gak nyambung sama sekali 🤖`,
    `kayak AI yang halusinasi, ada jawabannya tapi faktanya salah semua 💻`,
    `kayak algoritma yang bias, ada hasilnya tapi selalu diskriminatif 🔢`,
    `kayak model yang overfitting, bagus di training tapi gagal total di dunia nyata 📊`,
    `kayak dataset yang kotor, ada datanya tapi penuh noise & error yang bikin model kacau 🗂️`,
    `kayak fitur yang gak ada yang pakai, di-develop susah payah tapi user-nya gak tertarik 💻`,
    `kayak A/B test yang gak signifikan, ada eksperimennya tapi hasilnya gak bisa dipakai 📊`,
    `kayak sprint yang gak selesai, ada target dua minggu tapi gak ada yang kelar 🏃`,
    `kayak backlog yang menggunung, ada daftar tugasnya tapi gak pernah berkurang 📋`,
    `kayak technical debt yang gak pernah dibayar, ada masalahnya tapi terus ditunda 💸`,
    `kayak code review yang asal approve, ada prosesnya tapi kualitasnya tetap buruk 👨‍💻`,
    `kayak testing yang di-skip, ada development-nya tapi bug-nya baru ketahuan pas production 🐛`,
    `kayak hotfix yang bikin bug baru, ada solusinya tapi malah nambah masalah lain 🔧`,
    `kayak rollback yang gagal, mau balik ke versi lama tapi malah makin kacau 🔄`,
    `kayak downtime yang panjang, ada sistem tapi tiap kritis malah gak bisa diakses 🚫`,
    `kayak SLA yang gak terpenuhi, ada perjanjian tapi performance-nya selalu di bawah standar 📋`,
    `kayak monitoring yang gak ada alert, ada sistem tapi masalahnya ketauan telat terus ⚠️`,
    `kayak log yang gak dibaca, ada informasinya tapi gak ada yang mau investigasi 📝`,
    `kayak incident report yang gak ada action item, ada dokumentasinya tapi masalah yang sama terulang 📑`,
    `kayak post-mortem yang gak jujur, ada evaluasinya tapi blamanya dilempar ke mana-mana 🔍`,
    `kayak roadmap yang berubah tiap bulan, ada rencananya tapi gak pernah konsisten 🗺️`,
    `kayak OKR yang gak achievable, ada targetnya tapi dari awal udah gak masuk akal 🎯`,
    `kayak KPI yang gak relevan, ada metriknya tapi gak mencerminkan keberhasilan yang sebenarnya 📊`,
    `kayak dashboard yang gak dipakai, ada datanya tapi gak ada yang mau lihat 🖥️`,
    `kayak report otomatis yang salah data, dikirim tiap minggu tapi isinya selalu error 📧`,
    `kayak meeting recap yang gak akurat, ada catatannya tapi gak mencerminkan apa yang dibahas 📝`,
    `kayak action item yang gak di-follow up, ada tugasnya tapi gak ada yang tanggung jawab ✅`,
    `kayak deadline yang gak dipatuhi, ada tanggalnya tapi semua orang pura-pura gak lihat 📅`,
    `kayak eskalasi yang diabaikan, ada laporan masalah tapi manajemennya gak peduli 📢`,
    `kayak feedback yang gak diimplementasi, ada masukannya tapi gak pernah ada perubahan 💬`,
    `kayak one-on-one yang gak produktif, ada sesinya tapi ngobrol gak jelas tanpa output 🤝`,
    `kayak performance review yang gak jujur, ada evaluasinya tapi semua dapat nilai bagus palsu 📋`,
    `kayak PIP yang gak efektif, ada program pembinaan tapi masalahnya tetap gak kelar 📊`,
    `kayak coaching yang gak didengar, ada sesi mentoring tapi coachee-nya gak mau berubah 🎯`,
    `kayak training yang gak relevan, hadir tapi materinya gak kepake di kerjaan sehari-hari 📚`,
    `kayak workshop mahal yang gak ada hasilnya, bayar jutaan tapi skill-nya gak nambah 💸`,
    `kayak seminar motivasi yang efeknya cuma sehari, semangat tapi besoknya balik males lagi 🎤`,
    `kayak buku bisnis yang gak diaplikasikan, dibaca tapi ilmunya gak pernah dipraktikkan 📖`,
    `kayak podcast inspirasi yang gak mengubah kebiasaan, dengerin tapi hidupnya tetap sama 🎧`,
    `kayak course online yang gak diselesaikan, beli tapi progresnya stuck di 10% aja 💻`,
    `kayak sertifikasi yang gak dipakai, susah payah belajar tapi ujungnya cuma jadi hiasan CV 📜`,
    `kayak skill baru yang gak dipraktikkan, belajar tapi gak pernah dipakai jadi langsung lupa 🧠`,
    `kayak bahasa asing yang setengah-setengah, bisa sedikit tapi pas praktik langsung blank 🌍`,
    `kayak public speaking yang masih grogi, udah latihan tapi pas di panggung tetap gemetar 🎤`,
    `kayak leadership yang belum siap, dapet posisi tapi gak tahu cara mimpin tim 👑`,
    `kayak manajemen waktu yang buruk, ada 24 jam tapi tetap merasa gak cukup ⏰`,
    `kayak prioritas yang terbalik, ngerjain yang gak penting dulu & yang penting diabaikan 📋`,
    `kayak multitasking yang gak efektif, ngerjain banyak tapi semuanya tanggung 🔄`,
    `kayak perfeksionis yang gak produktif, mau sempurna tapi gak ada yang kelar-kelar ✨`,
    `kayak prokrastinator kelas berat, ada tugasnya tapi dikerjain mepet deadline terus ⏳`,
    `kayak distraksi yang gampang tergoda, niat fokus tapi 5 menit udah main HP 📱`,
    `kayak konsentrasi yang gampang pecah, mulai kerja tapi langsung buyar pas ada suara dikit 🧘`,
    `kayak energi yang abis di tengah hari, semangat pagi tapi siang udah gak berdaya 😴`,
    `kayak istirahat yang gak cukup, ada tidurnya tapi tetap ngantuk sepanjang hari 😪`,
    `kayak work-life balance yang gak ada, kerja terus tapi hasilnya gak sepadan ⚖️`,
    `kayak burnout yang gak disadari, kelelahan total tapi tetap dipaksain terus 🔥`,
    `kayak stress yang gak dikelola, ada masalah tapi caranya cuma dipendam sendiri 😤`,
    `kayak overthinking yang gak produktif, mikir keras tapi gak ada keputusan yang diambil 🤯`,
    `kayak anxiety yang gak ditangani, ada rasa takutnya tapi dihindari terus bukan dihadapi 😰`,
    `kayak comfort zone yang terlalu nyaman, ada tapi gak mau keluar & berkembang 🛋️`,
    `kayak zona aman yang bikin stuck, ada di sana terlalu lama sampai gak bisa maju 🚫`,
    `kayak takut gagal yang menghambat, ada mimpi tapi gak berani mulai karena takut salah 😱`,
    `kayak imposter syndrome yang parah, ada kemampuan tapi selalu merasa gak layak 🎭`,
    `kayak kepercayaan diri yang fluktuatif, kadang PD kadang minder tapi gak pernah stabil 🎢`,
    `kayak ego yang gak terkontrol, ada tapi malah ngerusak hubungan dengan orang sekitar 🦁`,
    `kayak gengsi yang tinggi, gak mau kalah tapi ujungnya malah rugi sendiri 👑`,
    `kayak defensif yang berlebihan, dikasih kritik dikit langsung marah & baper 🛡️`,
    `kayak denial yang tebal, ada masalah jelas tapi tetap gak mau ngakui 🙈`,
    `kayak excuse-maker kelas satu, selalu ada alasan buat setiap kegagalan yang terjadi 📝`,
    `kayak victim mentality, semua salah orang lain & diri sendiri gak pernah salah 😢`,
    `kayak toxic positivity, semua "pasti bisa!" tapi gak ada solusi nyata yang ditawarkan ☀️`,
    `kayak motivasi palsu, ngomong semangat tapi hidupnya sendiri gak mencerminkan itu 💪`,
    `kayak inspirasi sesaat, menyemangati orang tapi diri sendiri aja masih kacau 🌟`,
    `kayak mentor yang gak qualified, kasih saran tapi pengalamannya sendiri gak ada 👨‍🏫`,
    `kayak guru yang gak update ilmu, ngajar tapi materinya udah 20 tahun gak direvisi 📚`,
    `kayak orang tua yang gak konsisten, aturannya berubah-ubah & anak-anak jadi bingung 👨‍👩‍👦`,
    `kayak pemimpin yang gak bisa dicontoh, nyuruh banyak tapi contohnya sendiri gak ada 👑`,
    `kayak atasan yang micromanage, ada tapi malah bikin bawahan gak bisa berkembang 🔍`,
    `kayak bawahan yang gak bisa diarahkan, diberi instruksi tapi jalannya sendiri 🤷`,
    `kayak rekan kerja yang gak bisa diajak kerjasama, ada di tim tapi mau menang sendiri 👥`,
    `kayak partner bisnis yang visinya beda, ada tapi arahnya selalu bertentangan 🔀`,
    `kayak investor yang gak ngerti bisnis, ada dananya tapi masukannya malah nyesatin 💰`,
    `kayak advisor yang gak pernah ada, ada judulnya tapi gak pernah kasih kontribusi nyata 🎓`,
    `kayak board member yang pasif, ada di struktur tapi gak pernah aktif berkontribusi 🪑`,
    `kayak stakeholder yang susah dikomunikasikan, punya kepentingan tapi susah dihubungi 📞`,
    `kayak klien yang gak tahu maunya, minta A tapi pas jadi malah minta B 🤔`,
    `kayak brief yang gak jelas, ada dokumennya tapi interpretasinya beda-beda semua 📋`,
    `kayak revisi yang gak berujung, udah acc tapi besoknya minta ganti lagi 🔄`,
    `kayak approval yang lama banget, ada prosesnya tapi waiting time-nya bikin frustrasi ⏳`,
    `kayak sign-off yang gak pernah final, ada persetujuannya tapi selalu ada perubahan lagi ✍️`,
    `kayak scope creep yang gak terkontrol, awalnya kecil tapi proyek terus membesar sendiri 📏`,
    `kayak change request yang gak dibayar, ada permintaan tambahan tapi budget-nya gak nambah 💸`,
    `kayak proyek yang overbudget, ada anggaran tapi pengeluarannya selalu melebihi plan 📊`,
    `kayak timeline yang gak realistis, dijanjikan cepat tapi kualitasnya gak bisa dipertanggungjawabkan ⏱️`,
    `kayak quality assurance yang lemah, ada prosesnya tapi bug-nya tetap lolos ke production 🐛`,
    `kayak user acceptance test yang di-skip, ada tahapannya tapi langsung go live tanpa testing 🚀`,
    `kayak go live yang disaster, diluncurkan dengan bangga tapi langsung crash di hari pertama 💥`,
    `kayak fitur yang gak ada yang request, di-develop lama tapi user-nya gak butuh sama sekali 💻`,
    `kayak product-market fit yang gak ketemu, ada produknya tapi pasarnya gak mau menerima 🎯`,
    `kayak growth hacking yang gak growth, ada strateginya tapi user-nya tetap segitu-gitu aja 📈`,
    `kayak viral loop yang gak jalan, dirancang untuk menyebar tapi gak ada yang mau share 🔄`,
    `kayak referral program yang gak menarik, ada insentifnya tapi gak ada yang mau ikutan 🎁`,
    `kayak loyalty program yang rumit, ada reward-nya tapi cara dapetin poin-nya nyebelin banget 🏆`,
    `kayak gamifikasi yang gak engaging, ada badge & poin tapi gak ada yang termotivasi 🎮`,
    `kayak notifikasi push yang spammy, ada pesannya tapi user-nya langsung uninstall app 📱`,
    `kayak onboarding yang confusing, ada proses penerimaan tapi user-nya langsung drop off 🚪`,
    `kayak UX yang buruk, ada interface-nya tapi user-nya gak tahu harus ngapain 🖥️`,
    `kayak UI yang gak konsisten, ada tampilannya tapi desainnya berantakan tanpa aturan 🎨`,
    `kayak accessibility yang diabaikan, ada produknya tapi gak bisa dipakai semua orang ♿`,
    `kayak dark pattern yang ketahuan, ada trik manipulatifnya tapi user-nya udah sadar semua 🕳️`,
    `kayak privacy policy yang gak dibaca, ada dokumennya tapi isinya data lo dijual kemana-mana 📜`,
    `kayak terms of service yang berubah diam-diam, ada perjanjiannya tapi penggunanya gak diberitahu 📋`,
    `kayak cookie yang gak bisa ditolak, ada pilihannya tapi ujungnya tetap di-track kemana-mana 🍪`,
    `kayak GDPR compliance yang pura-pura, ada logo-nya tapi praktiknya tetap ambil data sembarangan 🔐`,
    `kayak keamanan data yang lemah, ada password-nya tapi gampang banget dibobol 🔓`,
    `kayak enkripsi yang gak end-to-end, ada katanya aman tapi sebenernya gak private sama sekali 🔒`,
    `kayak backup yang gak pernah ditest, ada proses backup-nya tapi pas dibutuhkan gak bisa restore 💾`,
    `kayak disaster recovery plan yang cuma di atas kertas, ada dokumentasinya tapi pas bencana semua panik 🌊`,
    `kayak business continuity yang gak continuous, ada rencana tapi operasional tetap berhenti total 🏢`,
    `kayak risk management yang reaktif, ada prosesnya tapi baru bertindak setelah masalah meledak ⚠️`,
    `kayak compliance yang setengah hati, ada laporan auditnya tapi implementasinya gak serius 📋`,
    `kayak audit yang bisa dimanipulasi, ada pemeriksaannya tapi hasilnya udah diatur sebelumnya 🔍`,
    `kayak transparansi yang semu, bilang terbuka tapi informasi pentingnya selalu disembunyikan 🪟`,
    `kayak akuntabilitas yang gak ada, ada tanggung jawab di atas kertas tapi pas salah semua kabur 📊`,
    `kayak integritas yang situasional, jujur cuma kalau menguntungkan diri sendiri aja 💎`,
    `kayak etika yang fleksibel, ada prinsipnya tapi selalu ada pengecualian yang dibuat sendiri ⚖️`,
    `kayak profesionalisme yang inconsistent, sopan pas butuh tapi kasar kalau udah gak perlu 👔`,
    `kayak reputasi yang dibangun di atas kebohongan, terlihat bagus tapi fondasi aslinya rapuh 🏗️`,
    `kayak personal branding yang gak authentic, citra yang dibuat-buat & gak mencerminkan diri asli 🎭`,
    `kayak thought leader yang gak punya pemikiran original, share konten orang lain tapi sok jadi expert 🧠`,
    `kayak expert yang ilmunya dangkal, banyak omong tapi gampang banget dipatahkan argumentasinya 📚`,
    `kayak generalist yang sok specialist, tahu sedikit tentang banyak hal tapi gak ada yang dalam 🎯`,
    `kayak specialist yang gak bisa adaptasi, jago satu hal tapi langsung gagap kalau diminta yang lain 🔧`,
    `kayak T-shaped yang sebenernya cuma garis lurus, bilang punya breadth & depth tapi keduanya tipis 📏`,
    `kayak lifelong learner yang gak beneran belajar, banyak beli buku & course tapi gak ada yang selesai 📚`,
    `kayak growth mindset yang masih fixed, bilang suka tantangan tapi pas gagal langsung nyerah 🌱`,
    `kayak resilience yang rapuh, terlihat kuat tapi satu masalah kecil langsung bikin ambruk 💪`,
    `kayak mental health yang diabaikan, ada tanda-tanda masalah tapi terus dipaksain sampai burnout 🧠`,
    `kayak self-care yang cuma estetik, beli produk skincare mahal tapi stres-nya gak diatasi 🧴`,
    `kayak mindfulness yang gak mindful, meditasi sebentar tapi pikirannya tetap kemana-mana 🧘`,
    `kayak journaling yang gak konsisten, buku jurnal bagus tapi isinya cuma 3 halaman pertama 📔`,
    `kayak gratitude practice yang terpaksa, nulis syukur tapi hatinya masih penuh keluhan 🙏`,
    `kayak boundary yang gak ditegakkan, bilang punya batasan tapi selalu iya-iya aja di akhir 🚧`,
    `kayak assertiveness yang masih pasif, tahu maunya tapi gak berani ngomong langsung 💬`,
    `kayak komunikasi yang gak efektif, banyak ngomong tapi pesannya gak pernah tersampaikan 📢`,
    `kayak empati yang selektif, bisa ngerasain orang lain tapi cuma kalau orangnya menguntungkan 💝`,
    `kayak mendengarkan yang cuma pura-pura, kayaknya dengerin tapi sebenernya nunggu giliran ngomong 👂`,
    `kayak pertanyaan yang gak relevan, ada tapi malah ngebuang waktu semua orang di ruangan 🤔`,
    `kayak solusi yang gak menyelesaikan akar masalah, ada jawabannya tapi masalahnya tetap berulang 🔧`,
    `kayak keputusan yang gak berdasar data, ada pilihannya tapi diambil berdasarkan perasaan doang 🎲`,
    `kayak strategi yang gak ada taktiknya, ada visi besarnya tapi langkah konkritnya gak ada sama sekali 🗺️`,
    `kayak eksekusi yang gak ada strateginya, langsung action tapi arahnya gak jelas kemana 🏃`,
    `kayak planning yang berlebihan tanpa action, rapat terus tapi gak ada yang mulai ngerjain 📋`,
    `kayak action tanpa planning, langsung terjun tapi akhirnya harus ulang dari awal karena salah langkah 🔄`,
    `kayak GPS yang telat update, arahannya selalu terlambat & bikin nyasar 🗺️`,
    `kayak komputer sekolah, dipake rame-rame & penuh virus 🖥️`,
    `kayak printer yang selalu low ink pas mau deadline, ada tapi nyebelin 🖨️`,
    `kayak scanner yang hasilnya miring, ada tapi hasilnya gak bisa dipake 📠`,
    `kayak proyektor yang gambarnya blur, ada tapi bikin sakit mata 📽️`,
    `kayak speaker bluetooth yang gampang disconnect, ada tapi gak bisa diandalkan 🔊`,
    `kayak smartwatch KW, keliatannya keren tapi fiturnya gak ada yang bener ⌚`,
    `kayak powerbank palsu, kapasitasnya bohong & ngisinya lama banget 🔋`,
    `kayak kabel data yang cuma bisa ngecas, mau transfer file tapi percuma 🔌`,
    `kayak adaptor yang gampang panas, ada tapi berbahaya dipake lama 🔥`,
    `kayak memori HP yang penuh foto blur, nyimpen banyak tapi gak ada yang berguna 📸`,
    `kayak notif WhatsApp yang gak bunyi, penting tapi selalu telat ketauan 📱`,
    `kayak autocorrect yang salah terus, ada tapi malah bikin pesan gak nyambung ✏️`,
    `kayak emoji yang salah kirim, udah terlanjur & bikin suasana aneh 😅`,
    `kayak stiker WA yang gak lucu, dikirim mulu tapi gak ada yang ketawa 🤡`,
    `kayak voice note yang kresek-kresek, mau dengerin tapi sakit telinga 🎙️`,
    `kayak video call yang laggy, mukanya kotak-kotak & suaranya putus-putus 📹`,
    `kayak zoom meeting yang stuck, ngomong panjang tapi gak ada yang denger 💻`,
    `kayak background virtual yang berantakan, ada tapi malah ganggu fokus 🖼️`,
    `kayak mute yang lupa dimatiin, ngomong sendiri tapi gak ada yang dengerin 🔇`,
    `kayak share screen yang salah tab, semua rahasia ketauan gara-gara ceroboh 🖥️`,
    `kayak internet pas meeting penting, tiba-tiba putus di waktu yang paling gak tepat 📶`,
    `kayak laptop yang mati pas presentasi, ada tapi bikin malu di depan umum 💻`,
    `kayak slide yang gak kebuka, udah prepare tapi gagal total di eksekusi 📊`,
    `kayak mic feedback yang kenceng, ada tapi bikin semua orang sakit kepala 🎤`,
    `kayak AC yang mati pas summer, dibutuhin banget tapi gak ada pas waktunya 🥵`,
    `kayak kipas angin tanpa baling-baling, ada rangkanya tapi gak ada fungsinya 💨`,
    `kayak kulkas yang gak dingin, simpen makanan tapi tetep basi 🧊`,
    `kayak kompor yang apinya kecil, masak lama banget & hasilnya gak mateng sempurna 🍳`,
    `kayak microwave yang tombolnya rusak, muter-muter tapi gak bisa dipake 📟`,
    `kayak blender yang bocor, dinyalain malah bikin berantakan semua 🫙`,
    `kayak setrika yang gak panas, dipakai lama tapi bajunya tetap kusut 👕`,
    `kayak mesin cuci yang gak muter, ada tapi bajunya tetep kotor 🫧`,
    `kayak vacuum cleaner yang gak nyedot, dorong-dorong tapi debu tetap ada 🧹`,
    `kayak lampu yang kedap-kedip, ada tapi bikin pusing & gak nyaman 💡`,
    `kayak saklar yang gak nyambung, dipencet berkali-kali tapi gak ada reaksinya 🔌`,
    `kayak stop kontak longgar, dicolokin tapi tetep gak ngalir listriknya ⚡`,
    `kayak genteng bocor, ada tapi pas hujan malah bikin basah semua 🏠`,
    `kayak pintu yang gak bisa dikunci, ada tapi gak bisa diandalkan buat keamanan 🚪`,
    `kayak jendela yang macet, mau dibuka susah mau ditutup juga susah 🪟`,
    `kayak tangga yang goyang, ada tapi bikin takut setiap kali dipake 🪜`,
    `kayak lift yang sering mati, ada tapi lebih sering bikin panik 🛗`,
    `kayak parkir yang selalu penuh, ada tempatnya tapi gak pernah bisa dipake 🚗`,
    `kayak ATM yang selalu dalam perawatan, dibutuhin tapi selalu gak bisa diakses 🏧`,
    `kayak kasir yang leletnya minta ampun, ada tapi bikin antrian mengular 🛒`,
    `kayak mesin EDC yang error, mau bayar tapi malah dipersulit 💳`,
    `kayak struk yang gak keluar, transaksi udah tapi buktinya gak ada 🧾`,
    `kayak nomor antrian yang dipanggil pas kamu ke toilet, ada tapi momen-nya selalu salah ⏳`,
    `kayak ojol yang cancel orderan, udah nunggu lama terus ditinggal 🛵`,
    `kayak driver yang salah lokasi, dijemput tapi di tempat yang salah 📍`,
    `kayak estimasi waktu yang meleset jauh, dijanjiin 5 menit tapi nyatanya 1 jam ⏰`,
    `kayak paket yang nyasar, dikirim tapi gak pernah nyampe tujuan 📦`,
    `kayak kurir yang foto depan pintu orang lain, ada tapi gak teliti sama sekali 🚚`,
    `kayak tracking yang gak update, statusnya stuck di satu tempat terus 🔍`,
    `kayak resi palsu, ada nomornya tapi barangnya gak pernah ada 📄`,
    `kayak seller yang ghosting setelah transfer, udah bayar tapi orangnya ilang 👻`,
    `kayak review produk yang gak jujur, ada tapi menyesatkan orang lain ⭐`,
    `kayak foto produk vs realita, beda banget & bikin kecewa pas dateng 📸`,
    `kayak ukuran yang gak sesuai deskripsi, pesan L datengnya S 👗`,
    `kayak warna yang beda dari foto, ekspektasi tinggi tapi realitanya jauh 🎨`,
    `kayak bahan yang gak sesuai, kelihatannya bagus tapi aslinya murahan 🧵`,
    `kayak jahitan yang langsung lepas, baru dipake sekali udah rusak 🪡`,
    `kayak sol sepatu yang mengelupas, baru seminggu udah berantakan 👟`,
    `kayak tali tas yang putus, ada tapi gak bisa dipercaya buat bawa barang berat 👜`,
    `kayak resleting yang macet, ada tapi bikin frustrasi setiap kali mau dipake 🤐`,
    `kayak kancing yang copot, ada tapi malah bikin tampilan berantakan 👔`,
    `kayak baju yang luntur, dicuci sekali langsung merusak semua yang ada di sekitarnya 👕`,
    `kayak celana yang cepat pudar, baru dibeli tapi udah kelihatan lusuh 👖`,
    `kayak kaos kaki yang langsung bolong, tipis banget & gak tahan lama 🧦`,
    `kayak topi yang langsung kempes, sekali dipake langsung gak bisa balik ke bentuk asal 🧢`,
    `kayak kacamata yang gampang baret, hati-hati dikit tapi tetep rusak 👓`,
    `kayak jam tangan yang gampang buram kacanya, baru dibeli udah gak keliatan angkanya ⌚`,
    `kayak cincin yang hitamin jari, ada tapi ninggalin bekas yang gak enak 💍`,
    `kayak parfum yang cepet habis baunya, semprotan pertama udah ilang wanginya 🌸`,
    `kayak lipstik yang gak tahan lama, baru dipake langsung luntur kemana-mana 💄`,
    `kayak maskara yang langsung smudge, ada tapi bikin tampilan jadi berantakan 👁️`,
    `kayak foundation yang gak cocok undertone, ada tapi malah bikin wajah aneh 💅`,
    `kayak skincare palsu, ada tapi malah bikin kulit makin rusak 🧴`,
    `kayak sunscreen yang gak ada SPF-nya, diolesin tapi tetep gosong 🌞`,
    `kayak sabun yang bikin kulit kering, ada tapi efeknya malah negatif 🧼`,
    `kayak shampo yang bikin rambut rontok, dipakai buat rawat tapi malah merusak 🧴`,
    `kayak kondisioner yang gak ngembang rambut, ada tapi gak ada bedanya 💆`,
    `kayak deodoran yang gak ngefek, ada tapi baunya tetep kemana-mana 🌬️`,
    `kayak pasta gigi tanpa fluoride, ada tapi gak ada perlindungannya 🦷`,
    `kayak sikat gigi yang bulunya rontok, dipake sebentar udah berantakan 🪥`,
    `kayak obat kumur yang cuma sebentar, segar sesaat terus balik bau lagi 🫧`,
    `kayak tisu basah yang kering, ada tapi gak ada gunanya sama sekali 🧻`,
    `kayak plester yang gak nempel, dipakai buat tutup luka tapi langsung copot 🩹`,
    `kayak masker yang gak rapat, ada tapi virusnya tetep masuk 😷`,
    `kayak sarung tangan yang bolong, ada tapi tangan tetep kotor 🧤`,
    `kayak payung mini yang gak kuat, dibuka pas hujan langsung terbalik ☂️`,
    `kayak jas hujan yang bocor, dipakai buat perlindungan tapi tetep basah kuyup 🌧️`,
    `kayak sepatu boots yang rembes, ada tapi kaki tetep basah kehujanan 🥾`,
    `kayak koper yang rodanya satu copot, dibawa jalan tapi malah ngerepotin 🧳`,
    `kayak tas ransel yang talinya putus, bawa barang tapi malah gak nyaman 🎒`,
    `kayak botol minum yang bocor, dibawa kemana-mana tapi isinya tumpah melulu 🧴`,
    `kayak termos yang gak jaga suhu, simpen minuman panas tapi langsung dingin 🫖`,
    `kayak kotak bekal yang susah ditutup, ada tapi malah tumpah pas dibawa 🍱`,
    `kayak sendok yang bengkok, ada tapi susah dipake makan dengan bener 🥄`,
    `kayak garpu yang giginya patah, ada tapi makanannya malah jatuh semua 🍴`,
    `kayak pisau yang tumpul, ada tapi malah bikin susah masak 🔪`,
    `kayak panci yang pegangannya panas, masak tapi langsung kelepas kena tangan 🍲`,
    `kayak wajan anti lengket yang lengket, ada tapi fungsi utamanya gak ada 🍳`,
    `kayak spatula yang meleleh, dipake masak tapi malah ikut masuk ke makanan 🫕`,
    `kayak talenan yang gampang berjamur, dipake buat masak tapi malah bahaya 🪵`,
    `kayak gunting yang tumpul, ada tapi malah nyobek bukan ngeguntingnya ✂️`,
    `kayak staples yang macet, mau jilid tapi malah bikin kertas sobek 📎`,
    `kayak penggaris yang bengkok, dipakai buat ngukur tapi hasilnya gak lurus 📏`,
    `kayak penghapus yang ninggalin bekas, dipakai buat bersihin tapi malah bikin kotor 🧹`,
    `kayak pensil yang patah terus, diasah dikit langsung patah lagi ✏️`,
    `kayak bolpen yang gak keluar tintanya, diklik berkali-kali tapi tetep gak mau nulis 🖊️`,
    `kayak spidol yang kering, baru dibuka tapi warnanya udah pudar 🖊️`,
    `kayak lem yang gak nempel, diolesin tebal-tebal tapi tetep lepas 🔧`,
    `kayak selotip yang gak lengket, ada tapi gak bisa nempel di permukaan apapun 📎`,
    `kayak isolasi yang robek terus, dipake dikit langsung rusak gak bisa dipake lagi 🗂️`,
    `kayak folder yang berantakan, ada tapi susah nemuin sesuatu di dalamnya 📁`,
    `kayak map yang kelebihan isi, ada tapi semuanya tumpah ruah keluar 🗂️`,
    `kayak binder yang cincinnya bengkok, dipake tapi kertasnya malah gak mau rapi 📓`,
    `kayak buku tulis yang kertasnya tipis, nulis di depan tapi tembusnya ke belakang 📔`,
    `kayak notes tempel yang gak nempel, ditempel tapi langsung jatuh 📌`,
    `kayak whiteboard yang susah dihapus, ditulisi tapi bekasnya tetap ada 🖊️`,
    `kayak spidol whiteboard yang permanen, salah nulis langsung permanen selamanya 😱`,
    `kayak penunjuk laser yang matiin, mau presentasi tapi alatnya malah gak nyala 🔦`,
    `kayak clicker presentasi yang laggy, diklik tapi slidenya gak mau maju ⏭️`,
    `kayak pointer yang gemetaran, nunjukin sesuatu tapi semua orang pusing ngeliatnya 🎯`,
    `kayak tripod yang goyang, dipasang kamera tapi hasilnya tetep blur 📷`,
    `kayak lensa yang baret, fotoin sesuatu tapi hasilnya selalu ada goresan 🔭`,
    `kayak filter foto yang gak cocok, dipasang tapi malah bikin foto makin jelek 🎨`,
    `kayak drone yang baterainya 5 menit, terbang sebentar terus langsung turun 🚁`,
    `kayak action cam yang waterproof-nya bocor, diajak menyelam langsung rusak 🤿`,
    `kayak gimbal yang gak stabil, ada tapi videonya tetep goyang parah 🎬`,
    `kayak ring light yang gak rata cahayanya, ada tapi malah bikin bayangan aneh 💡`,
    `kayak green screen yang kusut, ada tapi background-nya tetap keliatan berantakan 🎭`,
    `kayak teleprompter yang teksnya terlalu cepat, ada tapi malah bikin presenter panik 📜`,
    `kayak kamera CCTV yang kualitasnya buruk, ada tapi rekaman selalu buram 📹`,
    `kayak alarm rumah yang sering false alarm, ada tapi malah bikin panik orang sekitar 🚨`,
    `kayak smart lock yang error, canggih tapi malah susah masuk rumah sendiri 🔐`,
    `kayak smart home yang gak konek, ada sistemnya tapi manual lagi ujungnya 🏠`,
    `kayak robot vacuum yang nyangkut terus, ada tapi malah butuh dibantuin 🤖`,
    `kayak air purifier yang filternya kotor, ada tapi kualitas udaranya tetap buruk 💨`,
    `kayak humidifier yang bocor, ada tapi malah bikin lantai basah 💧`,
    `kayak dehumidifier yang penuh, ada tapi gak dikosongin jadi gak berfungsi 🌡️`,
    `kayak thermostat yang eror, diset satu suhu tapi hasilnya beda jauh ❄️`,
    `kayak smart TV yang lemot, canggih tapi loading-nya sama aja kayak TV biasa 📺`,
    `kayak remote universal yang gak universal, ada tapi gak bisa kontrol apa-apa 📡`,
    `kayak set top box yang buffering, ada tapi tontonannya tetap sering putus 📺`,
    `kayak antena digital yang lemah sinyal, pasang tapi channel-nya tetap gak keluar 📡`,
    `kayak soundbar tanpa bass, ada tapi suaranya tetap tipis & gak memuaskan 🔊`,
    `kayak subwoofer yang serak, ada tapi bunyinya malah bikin telinga sakit 🎵`,
    `kayak home theater yang kabelnya kusut, ada tapi pemasangannya bikin pusing 🎬`,
    `kayak gaming chair yang gampang kempes, ada tapi duduk sebentar udah gak nyaman 🪑`,
    `kayak meja gaming yang goyang, ada tapi ganggu konsentrasi pas main 🖥️`,
    `kayak mousepad yang licin, ada tapi mouse-nya malah lari kemana-mana 🖱️`,
    `kayak keyboard mechanical yang switch-nya macet, ada tapi tombolnya sering double input ⌨️`,
    `kayak headset gaming yang mic-nya berisik, ada tapi suaranya penuh noise 🎧`,
    `kayak monitor yang dead pixel, ada tapi ada titik hitam yang ganggu terus 🖥️`,
    `kayak GPU yang overheat, ada tapi komputer langsung shutdown pas game seru 🎮`,
    `kayak CPU yang throttling, ada tenaganya tapi langsung dibatesin sendiri 💻`,
    `kayak RAM yang gak cukup, ada tapi sistem selalu kehabisan pas butuh 🧠`,
    `kayak SSD yang hampir penuh, ada tapi performanya udah sama kayak HDD jadul 💾`,
    `kayak cooling system yang gak maksimal, ada tapi temperaturnya tetap tinggi 🌡️`,
    `kayak casing PC yang susah dibuka, ada tapi upgrade jadi mimpi buruk 🔧`,
    `kayak PSU yang gak stabil, ada tapi sistem sering mati tiba-tiba ⚡`,
    `kayak motherboard yang socket-nya gak support, ada tapi gak bisa upgrade prosesor 🖥️`,
    `kayak BIOS yang outdated, ada tapi fitur barunya gak bisa diakses ⚙️`,
    `kayak driver yang corrupt, ada tapi device-nya malah gak kedeteksi 💻`,
    `kayak OS yang bloatware, ada tapi penuh program gak berguna yang ngehabisin resource 🗂️`,
    `kayak antivirus yang makan resource, ada tapi malah yang paling bikin komputer lemot 🛡️`,
    `kayak backup yang gak pernah dijalanin, ada rencana tapi pas data hilang nyesel sendiri 💾`,
    `kayak cloud storage yang penuh, ada tapi foto baru gak bisa disimpen ☁️`,
    `kayak password manager yang lupa master password, ada tapi malah kunci diri sendiri 🔑`,
    `kayak 2FA yang gak bisa diakses, keamanan ekstra tapi malah ngunci akun sendiri 🔐`,
    `kayak email yang penuh spam, ada tapi susah nemuin yang penting 📧`,
    `kayak filter spam yang salah tangkap, email penting masuk spam terus 🚫`,
    `kayak unsubscribe yang gak ngaruh, udah klik tapi emailnya tetep dateng 📩`,
    `kayak newsletter yang gak bermanfaat, subscribe tapi isinya gak ada yang berguna 📰`,
    `kayak forum yang gak ada yang jawab, nanya tapi dibiarkan sendirian 💬`,
    `kayak wiki yang informasinya salah, ada tapi malah menyesatkan orang 📖`,
    `kayak search engine yang gak relevan, dicari tapi hasilnya gak nyambung sama sekali 🔍`,
    `kayak autocomplete yang salah prediksi, ada tapi malah bikin ketik jadi berantakan ⌨️`,
    `kayak translate otomatis yang kacau, ada tapi artinya malah bikin bingung 🌐`,
    `kayak subtitle yang telat, ada tapi dialognya udah keburu lewat ⏱️`,
    `kayak dubbing yang gak sinkron, ada suaranya tapi bibirnya gak nyambung 🎭`,
    `kayak rekomendasi algoritma yang gak akurat, ada tapi yang muncul gak sesuai selera 🎯`,
    `kayak playlist yang penuh lagu gak suka, ada musiknya tapi malah bikin skip terus ⏭️`,
    `kayak GPS yang suka muter balik, arahnya bikin lo muter-muter kayak orang linglung 🌀`,
`kayak charger KW super cepet rusak, colok 5 menit udah panas kayak setrika 🔥`,
`kayak HP second yang batrenya drop 20% tiap buka WA 📱`,
`kayak earphone yang satu sisi mati, musiknya jadi kayak konser mono 🎧`,
`kayak WiFi tetangga yang passwordnya ganti tiap minggu, susah banget nyolong 📶`,
`kayak motor yang knalpotnya bocor, bunyinya kenceng tapi performa lelet 🏍️`,
`kayak sepeda ontel ban kempes, dikayuh susah tapi tetep dipake sombong 🚲`,
`kayak payung rusak yang cuma bisa nutupin kepala doang ☂️`,
`kayak tas sekolah yang resletingnya rusak, buku-buku suka loncat keluar 🎒`,
`kayak sepatu yang solnya copot pas lari, bikin lo jatuh muka duluan 👟`,
`kayak kaos oblong yang kerahnya melar, keliatan kayak orang baru bangun tidur 👕`,
`kayak celana jeans yang pinggangnya kegedean, harus ikat pinggang dua lapis 👖`,
`kayak jaket yang zip-nya macet di tengah, setengah buka setengah nutup 🧥`,
`kayak topi yang warnanya luntur pas kena hujan, jadi kayak pelangi cacat 🧢`,
`kayak kacamata minus yang lensanya goyang, dunia jadi goyang-goyang terus 👓`,
`kayak jam dinding yang jarumnya lambat, tiap liat tetep jam 3 sore ⏰`,
`kayak kalender yang gak pernah disobek, tiap bulan tetep nunjukin tanggal lama 📅`,
`kayak buku catatan yang halamannya robek-robek, tulisannya ilang setengah 📓`,
`kayak pulpen yang tintanya blot, nulis satu kata langsung belepotan 🖊️`,
`kayak penghapus yang keras banget, malah bikin kertas sobek 🧼`,
`kayak penggaris yang ujungnya patah, ukurannya selalu meleset 2 cm 📏`,
`kayak kalkulator yang tombol 0-nya macet, hasil hitungannya selalu kurang nol 💰`,
`kayak tas makeup yang ritsletingnya rusak, semua barang tumpah pas dibuka 💄`,
`kayak sisir yang giginya tinggal setengah, rambut malah tambah acak-acakan 🪮`,
`kayak handuk yang tipis banget, abis mandi badan tetep basah kuyup 🛁`,
`kayak sabun mandi yang cepet abis, satu kali gosok langsung tinggal sebiji kacang 🧼`,
`kayak sampo yang bikin rambut kering kayak jerami, abis keramas malah kayak rumput gajah 🧴`,
`kayak deodoran yang baunya ilang dalam 10 menit, ketiak balik bau lagi 🌬️`,
`kayak pasta gigi yang rasanya aneh, gosok gigi malah mual 🦷`,
`kayak pembersih wajah yang bikin jerawat tambah banyak, muka makin kayak peta dunia 🌋`,
`kayak mie instan yang bumbunya kurang, rasanya kayak makan kardus 🍜`,
`kayak minuman kaleng yang gasnya ilang, rasanya datar kayak air keran 🥤`,
`kayak gorengan yang minyaknya udah item, rasanya pahit + bau tengik 🍤`,
`kayak nasi yang gosong bawahnya, atas putih bawah arang 🍚`,
`kayak es teh yang esnya cepet cair, jadi teh manis encer doang 🧊`,
`kayak roti tawar yang sudah keras, gigit aja susah kayak makan batu 🍞`,
`kayak susu yang kadaluarsa, baunya asam + rasanya aneh 🥛`,
`kayak cokelat yang meleleh di dalam tas, bentuknya jadi kayak kotoran 🫕`,
`kayak permen karet yang keras banget, dikunyah kayak makan ban motor 🍬`,
`kayak keripik yang sudah lembek, kriuknya ilang jadi kayak makan kertas 🥔`,
`kayak ojek online yang selalu ambil jalan memutar, ongkos naik 2x lipat 🛵`,
`kayak taksi yang argo-nya loncat-loncat, bayar akhirnya bikin nangis 💸`,
`kayak bus yang AC-nya mati, dalamnya kayak oven berjalan 🚌`,
`kayak kereta yang sering delay, janji jam 7 dateng jam 10 ⏳`,
`kayak pesawat yang turbulensinya parah, naiknya kayak naik roller coaster ✈️`,
`kayak kapal yang bocor, naiknya malah deg-degan terus 🛳️`,
`kayak lift yang suka berhenti di antara lantai, bikin lo panik sendirian 🛗`,
`kayak eskalator yang mati, jadi tangga biasa yang bikin capek 🪜`,
`kayak toilet umum yang gak ada air, pengalaman trauma setiap kali ke sana 🚽`,
`kayak wastafel yang salurannya mampet, airnya nggenang + bau 🪠`,
`kayak kasur yang pernya udah ambruk, tidur malah kayak tidur di lantai 🛏️`,
`kayak bantal yang isinya menggumpal, leher pegel tiap bangun pagi 🛠️`,
`kayak selimut yang tipis banget, dinginnya tetep ngerasain meski ditumpuk 3 lapis ❄️`,
`kayak kipas angin yang bunyinya berisik, tidur malah kayak ditemenin traktor 💨`,
`kayak AC yang suaranya kayak mesin pabrik, dingin sih tapi bikin pusing 🥶`,
`kayak lampu kamar yang kedip-kedip, tiap malam kayak lagi diskon di club 💡`,
`kayak stop kontak yang longgar, colokan suka copot sendiri ⚡`,
`kayak kabel charger yang sudah melintir parah, susah dilurusin lagi 🔌`,
`kayak adaptor yang baunya gosong, colok dikit langsung bau plastik terbakar 🔥`,
`kayak baterai remot TV yang lemes, harus diketok-ketok dulu biar nyala 🔋`,
`kayak remote TV yang tombolnya lengket, ganti channel malah loncat 10 channel sekaligus 📺`,
`kayak TV yang layarnya bergaris, nonton film jadi kayak nonton hantu 👻`,
`kayak speaker yang bass-nya pecah, bunyinya cuma "brrr brrr" doang 🎵`,
`kayak headphone yang busanya copot, kuping sakit tiap pake lama 🎧`,
`kayak mic yang suaranya serak, rekaman jadi kayak lagi sakit tenggorokan 🎤`,
`kayak webcam yang kameranya buram, video call muka lo kayak hantu kabur 📹`,
`kayak keyboard laptop yang tombol "A" nya nyantol, ngetik "A" jadi "AAAAA" ⌨️`,
`kayak touchpad yang geraknya liar, kursor loncat-loncat sendiri 🖱️`,
`kayak mouse yang scroll-nya gila, halaman langsung loncat ke bawah 100x 🖲️`,
`kayak monitor yang warnanya kuning, semua foto jadi kayak filter vintage jelek 🖥️`,
`kayak game yang lag parah, musuhnya gerak kayak slide powerpoint 🎮`,
`kayak joystick yang stiknya goyang, kendali karakter malah ngaco sendiri 🕹️`,
`kayak loading screen yang lama banget, nunggunya lebih seru dari gamenya ⏳`,
`kayak save file yang corrupt, main 10 jam langsung ilang semua progress 💾`,
`kayak server game yang sering down, pas lagi seru-serunya malah DC 🌐`,
`kayak akun game yang rank-nya turun terus, mainnya makin parah aja 🏆`,
`kayak skin game yang mahal tapi jelek, duit ilang + muka karakter aneh 🧥`,
`kayak cheat yang ketahuan, akun langsung kena ban permanen 🚫`,
`kayak leaderboard yang gak adil, noob di atas lo tapi lo main lebih lama 🥇`,
`kayak update game yang bikin bug baru, malah tambah parah setelah diupdate 📲`,
`kayak temen yang selalu telat, janjian jam 7 dateng jam 9 🕒`,
`kayak temen yang suka ghosting, chat dibaca tapi gak dibales berhari-hari 👻`,
`kayak temen yang pinjem barang gak pernah balikin, koleksi lo pelan-pelan ilang 📚`,
`kayak temen yang suka ngomong belakang, muka depan baik muka belakang racun 🐍`,
`kayak temen yang selalu minta tolong tapi gak pernah bales budi 🙏`,
`kayak mantan yang suka muncul pas lo lagi happy, bikin mood langsung anjlok 😶`,
`kayak gebetan yang chatnya cuma "haha" doang, percakapan mati total 💀`,
`kayak crush yang online tapi gak bales chat lo, bikin lo overthinking 24 jam 📱`,
`kayak sahabat yang suka saingan diam-diam, seneng pas lo jatuh 🏆`,
`kayak keluarga yang suka bandingin, "liat tuh si A lebih sukses dari lo" 👀`,
`kayak guru yang pelajarannya bikin ngantuk, suaranya kayak lagu pengantar tidur 😴`,
`kayak dosen yang absennya ketat tapi ngajarnya gak jelas 📚`,
`kayak temen sekelas yang suka nyontek, nilai lo ditiru tapi lo yang kena marah ✍️`,
`kayak soal ujian yang gak pernah diajarin, dateng kayak tamu tak diundang ❓`,
`kayak nilai rapor yang selalu jelek, komentar gurunya "kurang usaha" 📉`,
`kayak OSIS yang kerjanya cuma foto-foto doang, programnya gak ada 🏫`,
`kayak kantin sekolah yang makanannya mahal tapi porsi kecil 🍲`,
`kayak seragam sekolah yang warnanya udah pudar, keliatan kayak zombie 🧟`,
`kayak tas sekolah yang bahannya tipis, sobek gara-gara buku Matematika doang 🎒`,
`kayak sepatu sekolah yang cepet bolong, jari kaki lo nongol duluan 👞`,
`kayak bos yang suka marah-marah kecil, karyawan pada takut masuk ruangan 😡`,
`kayak rekan kerja yang suka lempar kerjaan, "ini tolong ya" tiap hari 🗂️`,
`kayak meeting yang gak ada agenda, ngomong 2 jam tapi gak ada kesimpulan 💼`,
`kayak deadline yang selalu mendadak, kerjaan numpuk kayak gunung 🏔️`,
`kayak gaji yang telat cair, tiap akhir bulan lo harus ngutang dulu 💸`,
`kayak cuti yang susah disetujui, minta izin aja kayak minta warisan 👑`,
`kayak karyawan magang yang gak bisa apa-apa, malah bikin kerjaan tambah ribet 🧑‍💼`,
`kayak printer kantor yang selalu error, "paper jam" tiap mau print penting 🖨️`,
`kayak kopi kantor yang rasanya kayak air comberan ☕`,
`kayak kursi kantor yang rodanya copot, geraknya cuma muter-muter doang 🪑`,
`kayak politik yang janjinya manis, realitanya pahit banget 🗳️`,
`kayak berita yang judulnya clickbait, isinya gak sesuai ekspektasi 📰`,
`kayak influencer yang hidupnya palsu, story-nya mewah tapi utang numpuk 📸`,
`kayak selebgram yang endorse produk jelek, "bagus banget guys" padahal sampah 🛍️`,
`kayak komentar netizen yang toxic, satu salah langsung diserbu ribuan orang 💥`,
`kayak thread Twitter yang panjang tapi gak penting, baca sampe habis malah kesel 🧵`,
`kayak meme yang udah basi, masih dikirim-kirim juga 😂`,
`kayak video TikTok yang lagunya overused, tiap buka FYP lagu sama terus 🎵`,
`kayak challenge yang bahaya, ikutan malah masuk rumah sakit 🏥`,
`kayak live streaming yang isinya cuma minta donasi doang 💰`,
`kayak dokter yang diagnosanya salah, sakit perut dibilang maag padahal usus buntu 🩺`,
`kayak obat yang efek sampingnya lebih parah dari penyakitnya 💊`,
`kayak rumah sakit yang antriannya panjang, sakit makin parah nunggu giliran 🏥`,
`kayak supir angkot yang suka ngebut, naiknya deg-degan minta ampun 🛺`,
`kayak Gojek yang orderannya cancel mulu, nunggu lama sia-sia 🛵`,
`kayak Shopee yang diskonnya palsu, harga malah naik pas checkout 🛒`,
`kayak Lazada yang paketnya nyasar, barang dateng ke tetangga sebelah 📦`,
`kayak Tokopedia yang review-nya bohong, barang jelek dibilang bagus ⭐`,
`kayak Instagram yang feed-nya penuh iklan, susah nemuin postingan temen 📸`,
`kayak Twitter yang trendingnya gak jelas, topiknya random mulu 🐦`,
`kayak YouTube yang rekomendasinya aneh, nonton masak malah muncul horror 🎥`,
`kayak Spotify yang playlist-nya acak, lagu sedih muncul pas lagi seneng 🎵`,
`kayak Netflix yang loadingnya lama, nunggu film malah kesel duluan 📺`,
`kayak Netflix yang subtitle-nya telat, dialog udah lewat baru muncul ⏱️`,
`kayak mie goreng yang rasanya aneh, bumbunya kayak obat nyamuk 🍜`,
`kayak es krim yang meleleh cepet, beli mahal tapi langsung cair 🍨`,
`kayak bakso yang isinya cuma tepung, gigit doang langsung hancur 🍲`,
`kayak sate yang dagingnya alot, dikunyah kayak makan karet 🥩`,
`kayak martabak yang minyaknya banjir, makan sekali langsung mual 🥞`,
`kayak bubur ayam yang ayamnya cuma dua potong, lebih banyak kuahnya 🍲`,
`kayak nasi padang yang porsinya kecil, lapar tetep lapar setelah makan 🍛`,
`kayak kopi susu yang manisnya keterlaluan, gigi langsung sakit ☕`,
`kayak teh tarik yang tehnya encer, rasanya kayak air gula doang 🫖`,
`kayak roti bakar yang gosong, luarnya hitam dalamnya mentah 🍞`,
`kayak kentang goreng yang dingin pas dateng, kriuknya ilang total 🍟`,
`kayak ayam geprek yang pedesnya bohong, makan malah gak kerasa apa-apa 🌶️`,
`kayak burger yang rotinya kering, isinya cuma selada layu 🍔`,
`kayak pizza yang toppingnya sedikit, lebih banyak kejunya doang 🍕`,
`kayak sushi yang nasinya asam, rasanya kayak makan cuka 🍣`,
`kayak ramen yang kuahnya asin banget, minum air banyak tapi tetep haus 🍜`,
`kayak es teh manis yang esnya cuma dua biji, langsung encer 🧊`,
`kayak jus alpukat yang rasanya aneh, lebih mirip sup kacang 🥑`,
`kayak boba yang mutiaranya keras, gigi langsung pegel pas ngunyah 🧋`,
`kayak salad yang sayurnya layu, rasanya kayak makan rumput 🥗`,
`kayak sandwich yang rotinya basi, isinya malah amis 🥪`,
`kayak donat yang gak empuk, gigit aja susah kayak makan ban 🥯`,
`kayak cake yang kering banget, tenggorokan langsung kering pas makan 🍰`,
`kayak es campur yang sirupnya kurang, rasanya datar kayak air putih 🧊`,
`kayak cilok yang alot, dikunyah lama tapi tetep alot 🥟`,
`kayak batagor yang minyaknya banyak, rasanya lebih enak minyaknya daripada isinya 🍢`,
`kayak siomay yang kuahnya encer, lebih mirip air cucian piring 🥟`,
`kayak pempek yang baunya amis, makan malah mual 🐟`,
`kayak lontong sayur yang sayurnya bau, nasi tetep enak tapi sayurnya enggak 🍛`,
`kayak ketoprak yang bumbunya kental, makan sekali langsung kekenyangan 🥜`,
`kayak gado-gado yang kacangnya pahit, rasanya kayak obat batuk 🥗`,
`kayak rendang yang dagingnya alot, dikunyah kayak makan sepatu 🥩`,
`kayak opor ayam yang ayamnya cuma tulang, dagingnya ilang entah ke mana 🍲`,
`kayak soto betawi yang santannya encer, rasanya kayak sup biasa 🥣`,
`kayak rawon yang warnanya item banget, keliatan kayak tinta printer 🍲`,
`kayak pecel lele yang lelenya kecil, lebih banyak sambalnya daripada ikannya 🐟`,
`kayak ayam penyet yang pedesnya bohong, makan malah gak kerasa 🌶️`,
`kayak bebek goreng yang dagingnya alot, gigit doang langsung capek 🦆`,
`kayak ikan bakar yang gosong, rasanya lebih enak arangnya daripada ikannya 🐟`,
`kayak cumi goreng yang alot, dikunyah kayak makan karet 🦑`,
`kayak udang goreng yang baunya amis, makan malah mual 🦐`,
`kayak kerang rebus yang pasirnya banyak, gigi langsung berderit 🐚`,
`kayak kepiting yang dagingnya sedikit, lebih banyak cangkangnya 🦀`,
`kayak lobster yang harganya mahal tapi dagingnya kering 🦞`,
`kayak tiram yang baunya amis parah, makan malah langsung muntah 🐚`,
`kayak telur balado yang telurnya overcooked, kuningnya keras kayak batu 🥚`,
`kayak tahu isi yang isinya cuma wortel, rasanya datar total 🥕`,
`kayak tempe goreng yang minyaknya banjir, lebih enak minyaknya daripada tempenya 🍲`,
`kayak perkedel yang hancur, bentuknya kayak kotoran ayam 🥟`,
`kayak bakwan yang sayurnya sedikit, lebih banyak tepungnya 🥕`,
`kayak pisang goreng yang tepungnya tebal, pisangnya ilang entah ke mana 🍌`,
`kayak ubi goreng yang keras banget, gigi langsung pegel pas makan 🍠`,
`kayak singkong goreng yang alot, dikunyah lama tapi tetep alot 🌿`,
`kayak keripik singkong yang sudah lembek, kriuknya ilang total 🥔`,
`kayak keripik kentang yang asin banget, minum air banyak tapi tetep haus 🥔`,
`kayak keripik pedas yang pedesnya bohong, makan malah gak kerasa 🌶️`,
`kayak keripik original yang rasanya datar, lebih enak makan angin 🥔`,
`kayak wafer yang rapuh banget, pecah di dalam kemasan 🧇`,
`kayak cokelat batangan yang meleleh, bentuknya jadi kayak tahi 🫕`,
`kayak permen yang lengket di gigi, gigi langsung sakit pas lepas 🍬`,
`kayak permen karet yang cepet keras, dikunyah sebentar langsung kayak batu 🍬`,
`kayak permen mint yang baunya ilang cepet, segar sesaat terus balik bau mulut lagi 🌿`,
`kayak permen lolipop yang rasanya aneh, lebih mirip obat batuk 🍭`,
`kayak permen jelly yang lengket di tangan, tangan langsung lengket melulu 🍬`,
`kayak permen kapas yang cepet ilang, gigit doang langsung habis 🍭`,
`kayak es lilin yang rasanya aneh, lebih mirip air gula berwarna 🧊`,
`kayak es puter yang esnya kasar, gigi langsung pegel pas makan 🍨`,
`kayak es doger yang kelapanya sedikit, lebih banyak es serutnya 🥥`,
`kayak es campur yang kuahnya encer, rasanya datar kayak air putih 🧊`,
`kayak es teler yang alpukatnya mentah, rasanya pahit 🥑`,
`kayak es cincau yang cincaunya alot, dikunyah kayak makan karet 🟫`,
`kayak kolak pisang yang pisangnya overcooked, hancur di dalam kuah 🍌`,
`kayak bubur sumsum yang lengket banget, sendok langsung susah diangkat 🥣`,
`kayak bubur kacang hijau yang kacangnya keras, dikunyah lama tapi tetep keras 🟢`,
`kayak bubur ayam yang ayamnya cuma dua potong, lebih banyak kuahnya 🍲`,
`kayak bubur merah putih yang rasanya aneh, lebih mirip bubur biasa 🍚`,
`kayak lontong yang nasinya keras, gigit aja susah 🍚`,
`kayak ketupat yang daunnya bau, rasanya ikut bau daun 🌿`,
`kayak opor yang santannya encer, rasanya kayak sup biasa 🥥`,
`kayak gulai yang baunya amis, makan malah mual 🍲`,
`kayak rendang yang dagingnya alot, dikunyah kayak makan sepatu 🥩`,
`kayak sate kambing yang baunya prengus, makan malah mual 🐐`,
`kayak sate ayam yang dagingnya alot, gigit doang langsung capek 🐔`,
`kayak sate taichan yang pedesnya bohong, makan malah gak kerasa 🌶️`,
`kayak sate padang yang kuahnya encer, rasanya datar total 🥣`,
`kayak bakso urat yang uratnya alot, dikunyah kayak makan karet 🥟`,
`kayak bakso aci yang aci-nya alot, gigi langsung pegel 🥟`,
`kayak cilok yang alot, dikunyah lama tapi tetep alot 🥟`,
`kayak batagor yang minyaknya banyak, rasanya lebih enak minyaknya daripada isinya 🍢`,
`kayak siomay yang kuahnya encer, lebih mirip air cucian piring 🥟`,
`kayak pempek yang baunya amis, makan malah mual 🐟`,
`kayak lontong sayur yang sayurnya bau, nasi tetep enak tapi sayurnya enggak 🍛`,
`kayak ketoprak yang bumbunya kental, makan sekali langsung kekenyangan 🥜`,
`kayak gado-gado yang kacangnya pahit, rasanya kayak obat batuk 🥗`,
  ];

  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  return respond(`🔥 **ROASTED!**\n\n${targetMention} ${roast}`);
}


    if (cmd === 'afk') {
  const alasan = getOption(options, 'alasan') || 'Tidak ada alasan';
  user.afk = { status: true, alasan, since: Date.now() };
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  return respond(`💤 **${username}** sekarang AFK\n📝 Alasan: **${alasan}**`);
}

if (cmd === 'unafk') {
  if (!user.afk?.status) return respond('❌ Kamu tidak sedang AFK!');
  const duration = Date.now() - user.afk.since;
  const menit = Math.floor(duration / 60000);
  const jam = Math.floor(menit / 60);
  const durStr = jam > 0 ? `${jam} jam ${menit % 60} menit` : `${menit} menit`;
  user.afk = { status: false, alasan: null, since: null };
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  return respond(`✅ **${username}** sudah tidak AFK\n⏱️ Durasi AFK: **${durStr}**`);
}

    

if (cmd === 'infopemilikbot') {
  const line = (icon, label, value) =>
    `${icon} **${label}:** ${value}`;
  return respond([
    `\`\`\`ansi`,
    `\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m`,
    `\u001b[2;34m║  \u001b[1;33m👑  OWO BIM — UNSTOPPABLE  👑\u001b[0m  \u001b[2;34m║\u001b[0m`,
    `\u001b[2;34m║  \u001b[0;37m「 The Bot That Cannot Be Stopped 」\u001b[0m  \u001b[2;34m║\u001b[0m`,
    `\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m`,
    `\`\`\``,
    line('👑', 'Pemilik', '<@1442230317455900823>'),
    line('🪐', 'Server', "Kraxx's Domain"),
    line('⚙️', 'Versi', '`v9.9.9`'),
    line('⚡', 'Engine', 'Cloudflare Workers — Ultra Fast 🚀'),
    line('🌐', 'Status', '`🟢 ONLINE`'),
    ``,
    `\`\`\`ansi`,
    `\u001b[1;32m━━━━━━━━━━ FITUR UNGGULAN ━━━━━━━━━━\u001b[0m`,
    `\u001b[1;33m 💰\u001b[0m \u001b[0;37mSistem Ekonomi & Bank\u001b[0m`,
    `\u001b[1;33m 💍\u001b[0m \u001b[0;37mSistem Pernikahan\u001b[0m`,
    `\u001b[1;33m 🔥\u001b[0m \u001b[0;37mRoast Generator\u001b[0m`,
    `\u001b[1;33m 💤\u001b[0m \u001b[0;37mAFK System\u001b[0m`,
    `\u001b[1;33m 🏆\u001b[0m \u001b[0;37mLeaderboard & Giveaway\u001b[0m`,
    `\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m`,
    `\`\`\``,
    `\`\`\`ansi`,
    `\u001b[1;31m⚠  BOT BERMASALAH? HUBUNGI SEGERA!\u001b[0m`,
    `\u001b[1;33m👤 Discord  :\u001b[0m \u001b[0;37m@bimxr\u001b[0m`,
    `\u001b[1;33m🪐 Server   :\u001b[0m \u001b[0;37mKraxx's Domain\u001b[0m`,
    `\`\`\``,
    `> 💀 *Dibuat, dirancang & dijalankan oleh* **Bimxr** ⚔️`
  ].join('\n'));
}   


    
if (cmd === 'avatar') {
  const targetOption = options.find(o => o.name === 'user');
  const targetId = targetOption ? String(targetOption.value) : discordId;
  const targetUser = targetOption 
    ? interaction.data.resolved?.users?.[targetId]
    : (interaction.member?.user || interaction.user);

  if (!targetUser) return respond('❌ User tidak ditemukan!');

  const avatar = targetUser.avatar
    ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.${targetUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=1024`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(targetUser.discriminator || 0) % 5}.png`;

  return respond([
    `\`\`\`ansi`,
    `\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m`,
    `\u001b[2;34m║  \u001b[1;33m🖼️  AVATAR USER  🖼️\u001b[0m  \u001b[2;34m║\u001b[0m`,
    `\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m`,
    `\`\`\``,
    `👤 **User:** ${targetUser.username}`,
    `🆔 **ID:** \`${targetUser.id}\``,
    `🔗 **Link:** [Klik disini](${avatar})`,
    ``,
    avatar
  ].join('\n'));
}

    if (cmd === 'level') {
  const list = await env.USERS_KV.list({ prefix: 'user:' });
  const players = [];

  for (const key of list.keys) {
    const u = await env.USERS_KV.get(key.name);
    if (u) {
      const parsed = JSON.parse(u);
      const totalEarned = parsed.totalEarned || 0;
      const { level, name } = getLevel(totalEarned);
      players.push({
        discordId: parsed.discordId,
        username: parsed.discordUsername,
        level,
        name,
        totalEarned
      });
    }
  }

  players.sort((a, b) => b.totalEarned - a.totalEarned);

  const rows = players.slice(0, 15).map((p, i) =>
    `${i + 1}. <@${p.discordId}> — ${p.name} *(Lv.${p.level})* | 🪙 ${p.totalEarned.toLocaleString()} earned`
  ).join('\n');

  // Cari posisi user sendiri
  const myPos = players.findIndex(p => p.discordId === discordId) + 1;
  const me = players.find(p => p.discordId === discordId);
  const myLevel = me ? `${me.name} *(Lv.${me.level})*` : 'Belum ada data';

  return respond([
    `\`\`\`ansi`,
    `\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m`,
    `\u001b[2;34m║  \u001b[1;33m🏅  LEVEL LEADERBOARD  🏅\u001b[0m  \u001b[2;34m║\u001b[0m`,
    `\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m`,
    `\`\`\``,
    rows || 'Belum ada data.',
    ``,
    `> 👤 **Level kamu:** ${myLevel} | Ranking **#${myPos}**`
  ].join('\n'));
}

    

if (cmd === 'fix-level') {
  if (discordId !== '1442230317455900823') return respond('❌ Bukan Pemilik Bot!');
 
  // Langsung reply dulu biar tidak timeout
  waitUntil((async () => {
    try {
      const list = await env.USERS_KV.list({ prefix: 'user:' });
      let count = 0;
 
      for (const key of list.keys) {
        const u = await env.USERS_KV.get(key.name);
        if (u) {
          const parsed = JSON.parse(u);
          parsed.totalEarned = parsed.balance || 0;
          await env.USERS_KV.put(key.name, JSON.stringify(parsed));
          count++;
        }
      }
 
      // Kirim hasil via webhook setelah selesai
      const WEBHOOK = env.FEEDBACK_WEBHOOK_URL;
      if (WEBHOOK) {
        await fetch(WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `<@1442230317455900823> ✅ **fix-level selesai!**\n> 👥 Total user difix: **${count}**\n> 🪙 \`totalEarned\` sekarang sama dengan \`balance\` masing-masing user.`
          })
        });
      }
    } catch (err) {
      console.error('[FIX-LEVEL] Error:', err.message);
      const WEBHOOK = env.FEEDBACK_WEBHOOK_URL;
      if (WEBHOOK) {
        await fetch(WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `<@1442230317455900823> ❌ **fix-level GAGAL!**\n> Error: \`${err.message}\``
          })
        });
      }
    }
  })());
 
  // Langsung balas tanpa nunggu loop selesai
  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  \u001b[1;33m⏳  FIX-LEVEL BERJALAN...  ⏳\u001b[0m  \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    '> 🔄 Proses fix sedang berjalan di background.',
    '> 📩 Kamu akan dapat **notif webhook** setelah selesai!'
  ].join('\n'));
}

    

    if (cmd === 'hug') {
  const targetId = getOption(options, 'target');
  if (!targetId) return respond('❌ Pilih user yang mau dipeluk!');
  if (targetId === discordId) return respond('❌ Masa peluk diri sendiri! 😂');
  return respond(`🤗 **${username}** memeluk <@${targetId}>!\nSemoga harimu menyenangkan~ 💕`);
}

if (cmd === 'slap') {
  const targetId = getOption(options, 'target');
  if (!targetId) return respond('❌ Pilih user yang mau ditampar!');
  if (targetId === discordId) return respond('❌ Masa tampar diri sendiri! 😂');
  return respond(`👋 **${username}** menampar <@${targetId}>! PLAK! 💢`);
}

if (cmd === 'pat') {
  const targetId = getOption(options, 'target');
  if (!targetId) return respond('❌ Pilih user yang mau di-pat!');
  if (targetId === discordId) return respond('❌ Masa pat diri sendiri! 😂');
  return respond(`✋ **${username}** mengusap kepala <@${targetId}>! *pat pat* 🥰`);
}




    



if (cmd === 'servers') {
  if (discordId !== '1442230317455900823') return respond('❌ Bukan Pemilik Bot!');
  const { keys } = await env.USERS_KV.list({ prefix: 'guild:' });
  if (keys.length === 0) return respond('❌ Belum ada server yang terdaftar!');


  const servers = [];
  for (const key of keys) {
    const raw = await env.USERS_KV.get(key.name);
    if (raw) servers.push(JSON.parse(raw));
  }

  servers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const page      = 0;
  const perPage   = 5;
  const totalPage = Math.ceil(servers.length / perPage);
  const medals    = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const newest    = new Date(servers[0]?.updatedAt).toLocaleDateString('id-ID');
  const oldest    = new Date(servers[servers.length - 1]?.updatedAt).toLocaleDateString('id-ID');

  const fields = servers.slice(0, perPage).map((data, i) => {
    const waktu = new Date(data.updatedAt).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    return {
      name: `${medals[i]} \`${data.guildId}\``,
      value: `📢 <#${data.channelId}> • 🕐 ${waktu}`,
      inline: false
    };
  });

  const components = totalPage > 1 ? [{
    type: 1,
    components: [
      { type: 2, style: 2, label: '◀ Prev', custom_id: `servers_page:${page - 1}`, disabled: true },
      { type: 2, style: 2, label: `1 / ${totalPage}`, custom_id: 'servers_info', disabled: true },
      { type: 2, style: 2, label: 'Next ▶', custom_id: `servers_page:${page + 1}`, disabled: false }
    ]
  }] : [];

  return new Response(JSON.stringify({
    type: 4,
    data: {
      flags: 64,
      embeds: [{
        color: 0x5865F2,
        title: '🌐 OWO BIM — Server List',
        description: `🌍 **Total:** \`${servers.length}\` server\n🆕 **Terbaru:** ${newest} • 🕰️ **Terlama:** ${oldest}`,
        fields,
        footer: { text: `Halaman 1 dari ${totalPage} • Hanya kamu yang bisa melihat ini` },
        timestamp: new Date().toISOString()
      }],
      components
    }
  }), { headers });
}





    
    if (cmd === 'server-stats') {
  const { keys: guildKeys } = await env.USERS_KV.list({ prefix: 'guild:' });
  const { keys: userKeys }  = await env.USERS_KV.list({ prefix: 'user:' });

  // Ambil data server
  const servers = [];
  for (const key of guildKeys) {
    const raw = await env.USERS_KV.get(key.name);
    if (raw) servers.push(JSON.parse(raw));
  }

  // Sort by most active
  servers.sort((a, b) => (b.totalCommands || 0) - (a.totalCommands || 0));
  const totalCommands = servers.reduce((a, b) => a + (b.totalCommands || 0), 0);

  // Ambil data user
  let totalCowoncy = 0;
  const players = [];
  for (const key of userKeys) {
    const raw = await env.USERS_KV.get(key.name);
    if (raw) {
      const u = JSON.parse(raw);
      totalCowoncy += u.balance || 0;
      players.push(u);
    }
  }
  players.sort((a, b) => (b.balance || 0) - (a.balance || 0));

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];

  // Top 5 server aktif
  const maxCmds = servers[0]?.totalCommands || 1;
  const activeList = servers.slice(0, 5).map((data, i) => {
    const pct  = Math.round(((data.totalCommands || 0) / maxCmds) * 5);
    const bar  = '█'.repeat(pct) + '░'.repeat(5 - pct);
    const waktu = new Date(data.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    return `${medals[i]} \`${data.guildId}\`\n┣ \`${bar}\` ⚡ **${(data.totalCommands || 0).toLocaleString()}** cmds\n┗ 🕐 Last active: ${waktu}`;
  });

  // Kumpulkan semua channel dari semua server
  const allChannels = [];
  for (const data of servers) {
    const channels = data.channels || {};
    for (const [chId, count] of Object.entries(channels)) {
      allChannels.push({
        channelId: chId,
        guildId: data.guildId,
        count
      });
    }
  }
  allChannels.sort((a, b) => b.count - a.count);

  const maxCount = allChannels[0]?.count || 1;
  const channelList = allChannels.slice(0, 5).map((ch, i) => {
    const pct = Math.round((ch.count / maxCount) * 5);
    const bar = '█'.repeat(pct) + '░'.repeat(5 - pct);
    return `${medals[i]} <#${ch.channelId}>\n┣ \`${bar}\` ⚡ **${ch.count.toLocaleString()}** cmds\n┗ 🏠 Guild: \`${ch.guildId}\``;
  });

  // Rata-rata cowoncy per user
  const avgCowoncy = players.length > 0 ? Math.floor(totalCowoncy / players.length) : 0;

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  \u001b[1;33m📊  OWO BIM — GLOBAL STATS  📊\u001b[0m  \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════════╝\u001b[0m',
    '```',
    '> 📈 **OVERVIEW**',
    `> 🌍 Server: \`${servers.length}\` • 👥 User: \`${players.length}\``,
    `> ⚡ Total Cmds: \`${totalCommands.toLocaleString()}\``,
    `> 🪙 Total Cowoncy: \`${totalCowoncy.toLocaleString()}\``,
    `> 📊 Rata-rata/User: \`${avgCowoncy.toLocaleString()}\``,
    '',
    '```ansi',
    '\u001b[1;32m━━━━━━━━━━ 🏆 SERVER TERAKTIF ━━━━━━━━━━\u001b[0m',
    '```',
    activeList.length ? activeList.join('\n\n') : '❌ Belum ada data server.',
    '',
    '```ansi',
    '\u001b[1;36m━━━━━━━━━━ 📢 CHANNEL TERAKTIF ━━━━━━━━━━\u001b[0m',
    '```',
    channelList.length ? channelList.join('\n\n') : '❌ Belum ada data channel.',
    '',
    `> ⏰ *Updated: ${new Date().toLocaleString('id-ID')}*`,
  ].join('\n'));
}

    

    if (cmd === 'shorten') {
  const url = getOption(options, 'url');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return respond(`<a:Owo1:1492563819464102078> URL harus diawali dengan \`http://\` atau \`https://\``);
  }

  const res = await fetch('https://api-ssl.bitly.com/v4/shorten', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.BITLY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ long_url: url })
  });

  const data = await res.json();

  if (!res.ok) {
    return respond(`<a:Owo1:1492563819464102078> Gagal: ${data.message}`);
  }

  return respond(
    `<a:Owo1:1492563819464102078> **URL Berhasil Diperpendek!**\n\n` +
    `🔗 **Asli:** \`${url}\`\n` +
    `✅ **Pendek:** **${data.link}**`
  );
}

    



if (cmd === 'translate') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const teks = getOption(options, 'teks');
  const bahasa = getOption(options, 'bahasa').toLowerCase();

  const langNames = {
    id: '🇮🇩 Indonesia', en: '🇬🇧 Inggris', ja: '🇯🇵 Jepang',
    ko: '🇰🇷 Korea', zh: '🇨🇳 Mandarin', th: '🇹🇭 Thailand',
    vi: '🇻🇳 Vietnam', ms: '🇲🇾 Melayu', ar: '🇸🇦 Arab',
    tr: '🇹🇷 Turki', fr: '🇫🇷 Prancis', de: '🇩🇪 Jerman',
    es: '🇪🇸 Spanyol', it: '🇮🇹 Italia', pt: '🇵🇹 Portugis',
    ru: '🇷🇺 Rusia', pl: '🇵🇱 Polandia', uk: '🇺🇦 Ukraina',
    nl: '🇳🇱 Belanda', sv: '🇸🇪 Swedia', da: '🇩🇰 Denmark',
    fi: '🇫🇮 Finlandia', he: '🇮🇱 Ibrani', fa: '🇮🇷 Persia',
    hi: '🇮🇳 Hindi', bn: '🇧🇩 Bengali', ur: '🇵🇰 Urdu'
  };

  const namaLang = langNames[bahasa] || `🌐 \`${bahasa.toUpperCase()}\``;

  if (teks.length > 500) {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m✗  TEKS TERLALU PANJANG  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ⚠️ Maksimal **500 karakter**!`,
      `> 📏 Teks kamu **${teks.length} karakter** — kelebihan **${teks.length - 500} karakter**.`
    ].join('\n'));
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${bahasa}&dt=t&q=${encodeURIComponent(teks)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  TRANSLATE GAGAL  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Kode bahasa **\`${bahasa}\`** tidak valid!`,
        `> 💡 Contoh: \`en\`, \`ja\`, \`ko\`, \`id\`, \`ar\`, \`fr\`, \`de\``
      ].join('\n'));
    }

    const data = await res.json();
    const hasil = data[0].map(x => x[0]).filter(Boolean).join('');
    const detectedLang = data[2]?.toUpperCase() || 'AUTO';

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m🌐  TRANSLATE RESULT  🌐\u001b[0m  \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `${EMOJI} 📝 **Teks Asli**`,
      `> \`\`${teks}\`\``,
      ``,
      `${EMOJI} ✅ **Hasil Terjemahan**`,
      `> \`\`${hasil}\`\``,
      ``,
      '```ansi',
      '\u001b[1;32m━━━━━━━━━━━━ DETAIL INFO ━━━━━━━━━━━━\u001b[0m',
      `\u001b[1;33m 🔍 Bahasa Asal  :\u001b[0m \u001b[0;37m${detectedLang}\u001b[0m`,
      `\u001b[1;33m 🌐 Diterjemahkan:\u001b[0m \u001b[0;37m${namaLang}\u001b[0m`,
      `\u001b[1;33m 📏 Panjang Teks :\u001b[0m \u001b[0;37m${teks.length} karakter\u001b[0m`,
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 🤖 *Powered by OwoBim Translation Engine* ${EMOJI}`
    ].join('\n'));

  } catch (err) {
    return respond(`${EMOJI} ❌ Terjadi error: \`${err.message}\``);
  }
}




if (cmd === 'weather') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const API_KEY = env.OPENWEATHER_API_KEY;
  const kota = getOption(options, 'kota');

  const cuacaEmoji = {
    'clear sky': '☀️', 'few clouds': '🌤️', 'scattered clouds': '⛅',
    'broken clouds': '🌥️', 'overcast clouds': '☁️',
    'light rain': '🌦️', 'moderate rain': '🌧️', 'heavy intensity rain': '⛈️',
    'very heavy rain': '🌊', 'extreme rain': '🌊', 'freezing rain': '🧊',
    'light snow': '🌨️', 'snow': '❄️', 'heavy snow': '☃️',
    'thunderstorm': '⛈️', 'thunderstorm with light rain': '⛈️',
    'thunderstorm with heavy rain': '🌩️', 'drizzle': '🌦️',
    'light intensity drizzle': '🌦️', 'mist': '🌫️', 'fog': '🌫️',
    'haze': '🌫️', 'smoke': '💨', 'dust': '🌪️', 'sand': '🌪️',
    'tornado': '🌪️', 'squalls': '💨'
  };

  const arahAngin = (deg) => {
    const dirs = ['↑ Utara', '↗ Timur Laut', '→ Timur', '↘ Tenggara',
                  '↓ Selatan', '↙ Barat Daya', '← Barat', '↖ Barat Laut'];
    return dirs[Math.round(deg / 45) % 8];
  };

  const uvLevel = (uv) => {
    if (uv <= 2) return '🟢 Rendah';
    if (uv <= 5) return '🟡 Sedang';
    if (uv <= 7) return '🟠 Tinggi';
    if (uv <= 10) return '🔴 Sangat Tinggi';
    return '🟣 Ekstrem';
  };

  const visLevel = (vis) => {
    if (vis >= 10000) return '✅ Sangat Jelas';
    if (vis >= 5000) return '🟡 Jelas';
    if (vis >= 2000) return '🟠 Berkabut';
    return '🔴 Sangat Berkabut';
  };

  try {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(kota)}&limit=1&appid=${API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    // Cek API key invalid / error dari OpenWeather
    if (!Array.isArray(geoData)) {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  API ERROR  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Gagal konek ke OpenWeather API!`,
        `> 🔍 Response: \`${JSON.stringify(geoData)}\``,
        `> 🔑 Cek API Key di Cloudflare Variables!`
      ].join('\n'));
    }

    if (geoData.length === 0) {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  KOTA TIDAK DITEMUKAN  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Kota **\`${kota}\`** tidak ditemukan!`,
        `> 💡 Contoh: \`Jakarta\`, \`Tokyo\`, \`New York\`, \`London\``
      ].join('\n'));
    }

    const { lat, lon, name, country } = geoData[0];

    const [weatherRes, uvRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=id`),
      fetch(`https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${API_KEY}`)
    ]);

    const w = await weatherRes.json();
    const uvData = await uvRes.json();

    const desc = w.weather[0].description;
    const descEn = w.weather[0].main.toLowerCase();
    const icon = cuacaEmoji[w.weather[0].description.toLowerCase()] || cuacaEmoji[descEn] || '🌡️';
    const uv = uvData.value ?? 'N/A';
    const vis = w.visibility ?? 0;

    const suhu = Math.round(w.main.temp);
    const feelsLike = Math.round(w.main.feels_like);
    const tempMin = Math.round(w.main.temp_min);
    const tempMax = Math.round(w.main.temp_max);
    const humidity = w.main.humidity;
    const pressure = w.main.pressure;
    const windSpeed = (w.wind.speed * 3.6).toFixed(1);
    const windDeg = w.wind.deg ?? 0;
    const cloudiness = w.clouds.all;

    const sunriseTime = new Date(w.sys.sunrise * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const sunsetTime = new Date(w.sys.sunset * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const updateTime = new Date(w.dt * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

    const namaKota = `${name}, ${country}`;

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m${icon}  WEATHER REPORT  ${icon}\u001b[0m  \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `${EMOJI} 📍 **Lokasi** — ${namaKota}`,
      `${EMOJI} ${icon} **Kondisi** — ${desc.charAt(0).toUpperCase() + desc.slice(1)}`,
      ``,
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━━ 🌡️ SUHU & UDARA ━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m 🌡️  Suhu Saat Ini :\u001b[0m \u001b[1;37m${suhu}°C\u001b[0m`,
      `\u001b[1;36m 🤔  Terasa Seperti:\u001b[0m \u001b[0;37m${feelsLike}°C\u001b[0m`,
      `\u001b[1;36m 🔻  Suhu Min      :\u001b[0m \u001b[0;37m${tempMin}°C\u001b[0m`,
      `\u001b[1;36m 🔺  Suhu Max      :\u001b[0m \u001b[0;37m${tempMax}°C\u001b[0m`,
      `\u001b[1;36m 💧  Kelembaban    :\u001b[0m \u001b[0;37m${humidity}%\u001b[0m`,
      `\u001b[1;36m 🌬️  Angin         :\u001b[0m \u001b[0;37m${windSpeed} km/h ${arahAngin(windDeg)}\u001b[0m`,
      `\u001b[1;36m ☁️  Awan          :\u001b[0m \u001b[0;37m${cloudiness}%\u001b[0m`,
      `\u001b[1;36m 👁️  Visibilitas   :\u001b[0m \u001b[0;37m${(vis / 1000).toFixed(1)} km — ${visLevel(vis)}\u001b[0m`,
      `\u001b[1;36m ⏱️  Tekanan       :\u001b[0m \u001b[0;37m${pressure} hPa\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;32m━━━━━━━━━━━ ☀️ INFO LANJUT ━━━━━━━━━━━\u001b[0m',
      `\u001b[1;35m 🌅  Matahari Terbit:\u001b[0m \u001b[0;37m${sunriseTime} WIB\u001b[0m`,
      `\u001b[1;35m 🌇  Matahari Terbenam:\u001b[0m \u001b[0;37m${sunsetTime} WIB\u001b[0m`,
      `\u001b[1;35m 🕶️  Indeks UV     :\u001b[0m \u001b[0;37m${uv} — ${uvLevel(uv)}\u001b[0m`,
      `\u001b[1;35m 🕐  Update       :\u001b[0m \u001b[0;37m${updateTime} WIB\u001b[0m`,
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 🤖 *Powered by OwoBim Weather Engine* ${EMOJI}`
    ].join('\n'));

  } catch (err) {
    return respond(`${EMOJI} ❌ Terjadi error: \`${err.message}\``);
  }
}



    if (cmd === 'kurs') {
  const EMOJI = '<:Owo3:1492611511087140985>';
  const dari = getOption(options, 'dari')?.toUpperCase() || 'USD';
  const ke = getOption(options, 'ke')?.toUpperCase() || 'IDR';
  const jumlah = parseFloat(getOption(options, 'jumlah') || '1');

  const flagEmoji = {
    USD: '🇺🇸', IDR: '🇮🇩', JPY: '🇯🇵', KRW: '🇰🇷', EUR: '🇪🇺',
    GBP: '🇬🇧', CNY: '🇨🇳', SGD: '🇸🇬', MYR: '🇲🇾', AUD: '🇦🇺',
    CAD: '🇨🇦', CHF: '🇨🇭', HKD: '🇭🇰', THB: '🇹🇭', INR: '🇮🇳',
    SAR: '🇸🇦', AED: '🇦🇪', NZD: '🇳🇿', BRL: '🇧🇷', RUB: '🇷🇺',
    TRY: '🇹🇷', MXN: '🇲🇽', PHP: '🇵🇭', VND: '🇻🇳', PKR: '🇵🇰',
    BDT: '🇧🇩', EGP: '🇪🇬', NOK: '🇳🇴', SEK: '🇸🇪', DKK: '🇩🇰'
  };

  const namaMatuang = {
    USD: 'Dolar Amerika', IDR: 'Rupiah Indonesia', JPY: 'Yen Jepang',
    KRW: 'Won Korea', EUR: 'Euro', GBP: 'Poundsterling Inggris',
    CNY: 'Yuan Tiongkok', SGD: 'Dolar Singapura', MYR: 'Ringgit Malaysia',
    AUD: 'Dolar Australia', CAD: 'Dolar Kanada', CHF: 'Franc Swiss',
    HKD: 'Dolar Hong Kong', THB: 'Baht Thailand', INR: 'Rupee India',
    SAR: 'Riyal Arab Saudi', AED: 'Dirham UEA', NZD: 'Dolar Selandia Baru',
    BRL: 'Real Brasil', RUB: 'Rubel Rusia', TRY: 'Lira Turki',
    MXN: 'Peso Meksiko', PHP: 'Peso Filipina', VND: 'Dong Vietnam',
    PKR: 'Rupee Pakistan', BDT: 'Taka Bangladesh', EGP: 'Pound Mesir',
    NOK: 'Krone Norwegia', SEK: 'Krona Swedia', DKK: 'Krone Denmark'
  };

  const trendEmoji = (rate) => {
    if (rate > 1000) return '📈 Sangat Tinggi';
    if (rate > 100) return '📊 Tinggi';
    if (rate > 10) return '📉 Sedang';
    return '💹 Rendah';
  };

  if (isNaN(jumlah) || jumlah <= 0) {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m✗  JUMLAH TIDAK VALID  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ❌ Jumlah harus berupa angka positif!`,
      `> 💡 Contoh: \`1\`, \`100\`, \`1000\``
    ].join('\n'));
  }

  try {
    // Ambil semua rate sekaligus dari API gratis
    const apiUrl = `https://api.exchangerate-api.com/v4/latest/${dari}`;
    const res = await fetch(apiUrl);

    if (!res.ok) {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  KODE MATA UANG INVALID  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Kode mata uang **\`${dari}\`** tidak valid!`,
        `> 💡 Contoh: \`USD\`, \`IDR\`, \`JPY\`, \`EUR\`, \`SGD\``
      ].join('\n'));
    }

    const data = await res.json();
    const rates = data.rates;

    if (!rates[ke]) {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  MATA UANG TUJUAN INVALID  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Kode mata uang **\`${ke}\`** tidak valid!`,
        `> 💡 Contoh: \`USD\`, \`IDR\`, \`JPY\`, \`EUR\`, \`SGD\``
      ].join('\n'));
    }

    const rate = rates[ke];
    const hasil = jumlah * rate;
    const rateBalik = (1 / rate);

    // Format angka
    const formatAngka = (n) => {
      if (n >= 1000000) return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
      if (n >= 1) return n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
      return n.toFixed(6);
    };

    // Snapshot multi-currency vs IDR (mata uang populer)
    const popularVsDari = ['USD', 'EUR', 'JPY', 'SGD', 'MYR', 'GBP', 'CNY', 'AUD']
      .filter(c => c !== dari && rates[c])
      .slice(0, 6)
      .map(c => {
        const r = rates[c];
        const flag = flagEmoji[c] || '🌐';
        const val = formatAngka(r);
        const bar = Math.min(Math.round((Math.log10(r + 1) / 6) * 8), 8);
        const barStr = '█'.repeat(bar) + '░'.repeat(8 - bar);
        return `\u001b[1;33m ${flag} ${c.padEnd(4)}\u001b[0m \u001b[0;37m\`${barStr}\` ${val}\u001b[0m`;
      });

    const flagDari = flagEmoji[dari] || '🌐';
    const flagKe = flagEmoji[ke] || '🌐';
    const namaDari = namaMatuang[dari] || dari;
    const namaKe = namaMatuang[ke] || ke;
    const updateTime = new Date(data.date).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m💱  CURRENCY EXCHANGE  💱\u001b[0m  \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `${EMOJI} ${flagDari} **${dari}** → ${flagKe} **${ke}**`,
      ``,
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━━ 💰 HASIL KONVERSI ━━━━━━━━━\u001b[0m',
      `\u001b[1;36m 💵  Jumlah      :\u001b[0m \u001b[1;37m${formatAngka(jumlah)} ${dari}\u001b[0m`,
      `\u001b[1;36m 💱  Hasil       :\u001b[0m \u001b[1;32m${formatAngka(hasil)} ${ke}\u001b[0m`,
      `\u001b[1;36m 📊  Rate        :\u001b[0m \u001b[0;37m1 ${dari} = ${formatAngka(rate)} ${ke}\u001b[0m`,
      `\u001b[1;36m 🔄  Rate Balik  :\u001b[0m \u001b[0;37m1 ${ke} = ${formatAngka(rateBalik)} ${dari}\u001b[0m`,
      `\u001b[1;36m 📈  Tren        :\u001b[0m \u001b[0;37m${trendEmoji(rate)}\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;32m━━━━━━━━━ 🌍 INFO MATA UANG ━━━━━━━━━\u001b[0m',
      `\u001b[1;35m 🏦  Dari        :\u001b[0m \u001b[0;37m${flagDari} ${namaDari} (${dari})\u001b[0m`,
      `\u001b[1;35m 🏦  Ke          :\u001b[0m \u001b[0;37m${flagKe} ${namaKe} (${ke})\u001b[0m`,
      `\u001b[1;35m 🕐  Update      :\u001b[0m \u001b[0;37m${updateTime}\u001b[0m`,
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;36m━━━━━━━━━ 📊 SNAPSHOT MULTI-KURS ━━━━━\u001b[0m',
      `\u001b[0;37m 1 ${dari} terhadap mata uang lain:\u001b[0m`,
      ...popularVsDari,
      '\u001b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 🤖 *Powered by OwoBim Exchange Engine* ${EMOJI}`
    ].join('\n'));

  } catch (err) {
    return respond(`${EMOJI} ❌ Terjadi error: \`${err.message}\``);
  }
}



if (cmd === 'ip') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const input = getOption(options, 'ip');

  const riskLevel = (proxy, hosting, vpn) => {
    if (vpn) return '🔴 VPN Terdeteksi';
    if (proxy) return '🟠 Proxy Terdeteksi';
    if (hosting) return '🟡 Hosting/Server';
    return '🟢 Bersih';
  };

  try {
    const targetIp = input ? encodeURIComponent(input) : '';
    const apiUrl = `http://ip-api.com/json/${targetIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query`;

    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const d = await res.json();

    if (d.status !== 'success') {
      return respond([
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[2;34m║  \u001b[1;31m✗  IP TIDAK DITEMUKAN  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ IP **\`${input || 'auto'}\`** tidak valid!`,
        `> 🔍 Pesan: \`${d.message || 'Unknown error'}\``,
        `> 💡 Contoh: \`8.8.8.8\`, \`1.1.1.1\`, \`103.47.180.1\``
      ].join('\n'));
    }

    const ip       = d.query || 'N/A';
    const negara   = d.country || 'N/A';
    const kodeNeg  = d.countryCode?.toLowerCase() || '';
    const flag     = kodeNeg ? `:flag_${kodeNeg}:` : '🌐';
    const kota     = d.city || 'N/A';
    const region   = d.regionName || 'N/A';
    const kodePos  = d.zip || 'N/A';
    const lat      = d.lat?.toFixed(4) || 'N/A';
    const lon      = d.lon?.toFixed(4) || 'N/A';
    const timezone = d.timezone || 'N/A';
    const isp      = d.isp || 'N/A';
    const org      = d.org || 'N/A';
    const asn      = d.as || 'N/A';
    const isProxy  = d.proxy || false;
    const isHosting = d.hosting || false;
    const isVpn    = false; // ip-api free tier
    const isTor    = false;
    const risk     = riskLevel(isProxy, isHosting, isVpn);
    const mapsUrl  = `https://www.google.com/maps?q=${lat},${lon}`;

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m🌐  IP LOOKUP RESULT  🌐\u001b[0m  \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `${EMOJI} 🔍 **IP Address** — \`${ip}\` ${flag}`,
      ``,
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━ 📍 LOKASI INFO ━━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m 🌍  Negara      :\u001b[0m \u001b[0;37m${negara} (${d.countryCode || 'N/A'})\u001b[0m`,
      `\u001b[1;36m 🏙️  Kota        :\u001b[0m \u001b[0;37m${kota}\u001b[0m`,
      `\u001b[1;36m 🗺️  Region      :\u001b[0m \u001b[0;37m${region}\u001b[0m`,
      `\u001b[1;36m 📮  Kode Pos    :\u001b[0m \u001b[0;37m${kodePos}\u001b[0m`,
      `\u001b[1;36m 📡  Koordinat   :\u001b[0m \u001b[0;37m${lat}, ${lon}\u001b[0m`,
      `\u001b[1;36m 🕐  Timezone    :\u001b[0m \u001b[0;37m${timezone}\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;32m━━━━━━━━━━ 🔌 NETWORK INFO ━━━━━━━━━━\u001b[0m',
      `\u001b[1;35m 🏢  ISP         :\u001b[0m \u001b[0;37m${isp}\u001b[0m`,
      `\u001b[1;35m 🏗️  Organisasi  :\u001b[0m \u001b[0;37m${org}\u001b[0m`,
      `\u001b[1;35m 🔢  ASN         :\u001b[0m \u001b[0;37m${asn}\u001b[0m`,
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;31m━━━━━━━━━━ 🛡️ SECURITY INFO ━━━━━━━━━\u001b[0m',
      `\u001b[1;35m 🔒  Risk Level  :\u001b[0m \u001b[0;37m${risk}\u001b[0m`,
      `\u001b[1;35m 🔀  Proxy       :\u001b[0m \u001b[0;37m${isProxy ? '🔴 Ya' : '🟢 Tidak'}\u001b[0m`,
      `\u001b[1;35m 🖥️  Hosting     :\u001b[0m \u001b[0;37m${isHosting ? '🟡 Ya' : '🟢 Tidak'}\u001b[0m`,
      `\u001b[1;35m 🕵️  VPN & Tor   :\u001b[0m \u001b[0;37m🟢 Tidak Terdeteksi\u001b[0m`,
      '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 🗺️ [Lihat di Google Maps](${mapsUrl})`,
      `> 🤖 *Powered by OwoBim IP Engine* ${EMOJI}`
    ].join('\n'));

  } catch (err) {
    return respond(`${EMOJI} ❌ Terjadi error: \`${err.message}\``);
  }
}




    if (cmd === 'color') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const input = getOption(options, 'hex')?.replace('#', '').toUpperCase();

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  };

  const rgbToCmyk = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - r - k) / (1 - k)) * 100),
      m: Math.round(((1 - g - k) / (1 - k)) * 100),
      y: Math.round(((1 - b - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  };

  const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max === min) { h = 0; }
    else {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      v: Math.round(v * 100)
    };
  };

  const getLuminance = (r, g, b) => {
    const toLinear = c => c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const getContrastRatio = (lum1, lum2) => {
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
  };

  const getColorName = (r, g, b) => {
    const colors = [
      { name: 'Merah', r: 255, g: 0, b: 0 }, { name: 'Hijau', r: 0, g: 128, b: 0 },
      { name: 'Biru', r: 0, g: 0, b: 255 }, { name: 'Kuning', r: 255, g: 255, b: 0 },
      { name: 'Oranye', r: 255, g: 165, b: 0 }, { name: 'Ungu', r: 128, g: 0, b: 128 },
      { name: 'Pink', r: 255, g: 192, b: 203 }, { name: 'Coklat', r: 165, g: 42, b: 42 },
      { name: 'Abu-abu', r: 128, g: 128, b: 128 }, { name: 'Hitam', r: 0, g: 0, b: 0 },
      { name: 'Putih', r: 255, g: 255, b: 255 }, { name: 'Cyan', r: 0, g: 255, b: 255 },
      { name: 'Magenta', r: 255, g: 0, b: 255 }, { name: 'Lime', r: 0, g: 255, b: 0 },
      { name: 'Indigo', r: 75, g: 0, b: 130 }, { name: 'Violet', r: 238, g: 130, b: 238 },
      { name: 'Gold', r: 255, g: 215, b: 0 }, { name: 'Silver', r: 192, g: 192, b: 192 },
      { name: 'Teal', r: 0, g: 128, b: 128 }, { name: 'Navy', r: 0, g: 0, b: 128 },
      { name: 'Maroon', r: 128, g: 0, b: 0 }, { name: 'Olive', r: 128, g: 128, b: 0 },
      { name: 'Coral', r: 255, g: 127, b: 80 }, { name: 'Salmon', r: 250, g: 128, b: 114 },
      { name: 'Crimson', r: 220, g: 20, b: 60 }, { name: 'Turquoise', r: 64, g: 224, b: 208 },
      { name: 'Lavender', r: 230, g: 230, b: 250 }, { name: 'Beige', r: 245, g: 245, b: 220 },
      { name: 'Mint', r: 152, g: 255, b: 152 }, { name: 'Peach', r: 255, g: 218, b: 185 }
    ];
    let closest = colors[0], minDist = Infinity;
    for (const c of colors) {
      const dist = Math.sqrt((r-c.r)**2 + (g-c.g)**2 + (b-c.b)**2);
      if (dist < minDist) { minDist = dist; closest = c; }
    }
    return closest.name;
  };

  const getColorEmoji = (h, s, l) => {
    if (l < 10) return '⬛';
    if (l > 90) return '⬜';
    if (s < 15) return '🩶';
    if (h < 15 || h >= 345) return '🟥';
    if (h < 45) return '🟧';
    if (h < 75) return '🟨';
    if (h < 150) return '🟩';
    if (h < 195) return '🩵';
    if (h < 255) return '🟦';
    if (h < 285) return '🟪';
    if (h < 345) return '🩷';
    return '🟥';
  };

  const complementary = (h) => `#${((parseInt(input, 16) ^ 0xFFFFFF)).toString(16).padStart(6, '0').toUpperCase()}`;

  const getWcagLevel = (ratio) => {
    if (ratio >= 7) return '✅ AAA (Sempurna)';
    if (ratio >= 4.5) return '✅ AA (Baik)';
    if (ratio >= 3) return '⚠️ AA Large (Cukup)';
    return '❌ Gagal WCAG';
  };

  if (!input || !/^[0-9A-F]{6}$/.test(input)) {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m✗  HEX TIDAK VALID  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ❌ Format hex tidak valid!`,
      `> 💡 Contoh: \`#FF5733\`, \`#00FF00\`, \`#3498DB\`, \`#FFFFFF\``
    ].join('\n'));
  }

  const { r, g, b } = hexToRgb(input);
  const hsl = rgbToHsl(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const cmyk = rgbToCmyk(r, g, b);
  const colorName = getColorName(r, g, b);
  const colorEmoji = getColorEmoji(hsl.h, hsl.s, hsl.l);
  const luminance = getLuminance(r, g, b);
  const whiteLum = 1;
  const blackLum = 0;
  const contrastWhite = getContrastRatio(luminance, whiteLum);
  const contrastBlack = getContrastRatio(luminance, blackLum);
  const wcagWhite = getWcagLevel(parseFloat(contrastWhite));
  const wcagBlack = getWcagLevel(parseFloat(contrastBlack));
  const compHex = complementary(hsl.h);

  // Shades bar visual
  const shadeBar = ['░', '▒', '▓', '█', '▓', '▒', '░'].join('');

  // Decimal value
  const decVal = parseInt(input, 16);

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    `\u001b[2;34m║  \u001b[1;33m🎨  COLOR ANALYZER  🎨\u001b[0m  \u001b[2;34m║\u001b[0m`,
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `${EMOJI} ${colorEmoji} **#${input}** — ${colorName}`,
    ``,
    '```ansi',
    '\u001b[1;33m━━━━━━━━━━ 🎨 COLOR FORMAT ━━━━━━━━━━━\u001b[0m',
    `\u001b[1;36m 🔷  HEX         :\u001b[0m \u001b[1;37m#${input}\u001b[0m`,
    `\u001b[1;36m 🔴  RGB         :\u001b[0m \u001b[0;37mrgb(${r}, ${g}, ${b})\u001b[0m`,
    `\u001b[1;36m 🌈  HSL         :\u001b[0m \u001b[0;37mhsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)\u001b[0m`,
    `\u001b[1;36m 🎯  HSV         :\u001b[0m \u001b[0;37mhsv(${hsv.h}°, ${hsv.s}%, ${hsv.v}%)\u001b[0m`,
    `\u001b[1;36m 🖨️  CMYK        :\u001b[0m \u001b[0;37mcmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)\u001b[0m`,
    `\u001b[1;36m 🔢  Decimal     :\u001b[0m \u001b[0;37m${decVal}\u001b[0m`,
    '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;32m━━━━━━━━━━ 💡 COLOR INFO ━━━━━━━━━━━━\u001b[0m',
    `\u001b[1;35m 🏷️  Nama        :\u001b[0m \u001b[0;37m${colorName}\u001b[0m`,
    `\u001b[1;35m ☀️  Luminance   :\u001b[0m \u001b[0;37m${(luminance * 100).toFixed(2)}%\u001b[0m`,
    `\u001b[1;35m 🌗  Shade       :\u001b[0m \u001b[0;37m${hsl.l < 30 ? '🌑 Gelap' : hsl.l < 60 ? '🌓 Sedang' : '🌕 Terang'}\u001b[0m`,
    `\u001b[1;35m 🎨  Saturasi    :\u001b[0m \u001b[0;37m${hsl.s < 20 ? '⬜ Netral/Abu' : hsl.s < 60 ? '🎨 Sedang' : '🌈 Vivid'}\u001b[0m`,
    `\u001b[1;35m 🔄  Komplementer:\u001b[0m \u001b[0;37m${compHex}\u001b[0m`,
    '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;31m━━━━━━━━━━ ♿ WCAG CONTRAST ━━━━━━━━━\u001b[0m',
    `\u001b[1;35m ⬜  vs Putih    :\u001b[0m \u001b[0;37m${contrastWhite}:1 — ${wcagWhite}\u001b[0m`,
    `\u001b[1;35m ⬛  vs Hitam    :\u001b[0m \u001b[0;37m${contrastBlack}:1 — ${wcagBlack}\u001b[0m`,
    '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;36m━━━━━━━━━━ 🖥️ CSS USAGE ━━━━━━━━━━━━\u001b[0m',
    `\u001b[0;37m color: #${input};\u001b[0m`,
    `\u001b[0;37m background-color: #${input};\u001b[0m`,
    `\u001b[0;37m border: 1px solid #${input};\u001b[0m`,
    `\u001b[0;37m box-shadow: 0 0 10px #${input};\u001b[0m`,
    '\u001b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '```',
    `> 🤖 *Powered by OwoBim Color Engine* ${EMOJI}`
  ].join('\n'));
}



if (cmd === 'feedback') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const WEBHOOK_URL = env.FEEDBACK_WEBHOOK_URL;

  const tipe = getOption(options, 'tipe');
  const pesan = getOption(options, 'pesan');
  const targetId = options.find(o => o.name === 'target')?.value || null;
  const bukti = getOption(options, 'bukti') || null;

  if (pesan.length > 1000) {
    return respond(`> ${EMOJI} ❌ Maksimal **1000 karakter**! Pesan kamu **${pesan.length}** karakter.`);
  }

  if (tipe === 'report' && !targetId) {
    return respond(`> ${EMOJI} ❌ Untuk **Report User**, kamu harus mention usernya!`);
  }

  const cooldownKey = `feedback_cooldown:${discordId}`;
  const lastFeedback = await env.USERS_KV.get(cooldownKey);
  if (lastFeedback) {
    const sisaMs = 30 * 1000 - (Date.now() - parseInt(lastFeedback));
    if (sisaMs > 0) {
      return respond(`> ${EMOJI} ⏳ Tunggu **${Math.ceil(sisaMs / 1000)} detik** lagi!`);
    }
  }

  const tipeConfig = {
    saran:     { label: '💡 Saran / Ide Fitur', color: 3447003,  emoji: '💡', ping: false },
    bug:       { label: '🐛 Bug Report',         color: 15158332, emoji: '🐛', ping: true  },
    complaint: { label: '😡 Complaint',           color: 15548997, emoji: '😡', ping: true  },
    feedback:  { label: '🙏 Feedback Umum',       color: 3066993,  emoji: '🙏', ping: false },
    report:    { label: '🚨 Report User',         color: 15158332, emoji: '🚨', ping: true  }
  };

  const cfg = tipeConfig[tipe] || tipeConfig.feedback;
  const feedbackId = `FB-${Date.now()}-${discordId.slice(-4)}`;
  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const responseByTipe = {
    saran:     `💡 Ide kamu sudah dikirim! Siapa tau masuk ke update berikutnya 🚀`,
    bug:       `🐛 Bug report diterima! Owner akan segera investigasi 🔍`,
    complaint: `😤 Keluhan kamu sudah dicatat. Owner akan merespons secepatnya!`,
    feedback:  `🙏 Feedback kamu sangat berarti! Terima kasih sudah meluangkan waktu 💕`,
    report:    `🚨 Report diterima! Owner akan menindaklanjuti dalam waktu dekat.`
  };

  const responseMsg = respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    `\u001b[2;34m║  \u001b[1;32m✓  TERKIRIM!  ✓\u001b[0m  \u001b[2;34m║\u001b[0m`,
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `${EMOJI} ${responseByTipe[tipe]}`,
    ``,
    '```ansi',
    '\u001b[1;32m━━━━━━━━━━ 📋 DETAIL PENGIRIMAN ━━━━━━━\u001b[0m',
    `\u001b[1;36m 🆔  Feedback ID :\u001b[0m \u001b[0;37m${feedbackId}\u001b[0m`,
    `\u001b[1;36m 📋  Tipe        :\u001b[0m \u001b[0;37m${cfg.label}\u001b[0m`,
    `\u001b[1;36m 🕐  Waktu       :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
    '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '```',
    `> 🔒 *Pesanmu bersifat rahasia & hanya dilihat owner*`,
    `> 🤖 *Powered by OwoBim Feedback Engine* ${EMOJI}`
  ].join('\n'));

  waitUntil((async () => {
    try {
      console.log('[FEEDBACK] Mulai background task...');
      console.log('[FEEDBACK] WEBHOOK_URL ada:', !!WEBHOOK_URL);

      const totalRaw = await env.USERS_KV.get(`feedback_total:${discordId}`);
      const totalFeedback = totalRaw ? parseInt(totalRaw) + 1 : 1;
      await env.USERS_KV.put(`feedback_total:${discordId}`, String(totalFeedback));
      await env.USERS_KV.put(`feedback:${feedbackId}`, JSON.stringify({
        id: feedbackId, tipe, pesan, discordId, username,
        targetId: targetId || null, bukti: bukti || null,
        guildId: guildId || null, createdAt: Date.now(), status: 'pending'
      }));
      await env.USERS_KV.put(cooldownKey, String(Date.now()), { expirationTtl: 60 });
      console.log('[FEEDBACK] KV berhasil disimpan');

      if (WEBHOOK_URL) {
        const targetInfo = targetId ? interaction.data.resolved?.users?.[targetId] : null;
        const embedFields = [
          { name: '👤 Pengirim', value: `<@${discordId}> (\`${username}\` | \`${discordId}\`)`, inline: false },
          { name: '📋 Tipe', value: cfg.label, inline: true },
          { name: '🆔 Feedback ID', value: `\`${feedbackId}\``, inline: true },
          { name: '🕐 Waktu', value: `${waktu} WIB`, inline: true },
          { name: '💬 Pesan', value: `\`\`\`${pesan}\`\`\``, inline: false },
        ];
        if (tipe === 'report' && targetInfo) {
          embedFields.push({ name: '🎯 Direport', value: `<@${targetId}> (\`${targetInfo.username}\`)`, inline: false });
        }
        if (bukti) embedFields.push({ name: '🔗 Bukti', value: bukti, inline: false });
        if (guildId) embedFields.push({ name: '🏠 Server', value: `\`${guildId}\``, inline: true });

        const webhookRes = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: cfg.ping ? `<@1442230317455900823> 🚨 **Ada ${cfg.label} masuk!**` : null,
            embeds: [{
              title: `${cfg.emoji} ${cfg.label}`,
              color: cfg.color,
              fields: embedFields,
              footer: { text: `OwoBim Feedback System • ${feedbackId}` },
              timestamp: new Date().toISOString()
            }]
          })
        });

        const webhookBody = await webhookRes.text();
        console.log('[FEEDBACK] Webhook status:', webhookRes.status);
        console.log('[FEEDBACK] Webhook response:', webhookBody);
      } else {
        console.log('[FEEDBACK] WEBHOOK_URL kosong, skip kirim webhook');
      }
    } catch (e) {
      console.error('[FEEDBACK] Error:', e.message);
    }
  })());

  return responseMsg;
}




    if (cmd === 'explode') {
  const targetOption = options.find(o => o.name === 'target');
  const targetId = targetOption ? String(targetOption.value) : null;
  if (!targetId) return respond('❌ Pilih user yang mau diledakkan!');
  if (targetId === discordId) return respond('❌ Masa ledakkin diri sendiri! 💀');

  const targetUser = interaction.data.resolved?.users?.[targetId];
  if (!targetUser) return respond('❌ User tidak ditemukan!');

  const avatarUrl = targetUser.avatar
    ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.${targetUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(targetUser.discriminator || 0) % 5}.png`;

  const explosionUrl = `https://api.popcat.xyz/burn?image=${encodeURIComponent(avatarUrl)}`;

  const messages = [
    `💣 **${username}** melempar granat ke <@${targetId}>!`,
    `🧨 **${username}** menyalakan sumbu... 3... 2... 1...`,
    `☢️ **${username}** menekan tombol detonator untuk <@${targetId}>!`,
    `🚀 **${username}** meluncurkan rudal langsung ke muka <@${targetId}>!`,
    `💥 **${username}** BOOM! <@${targetId}> gak ada wujudnya lagi!`,
    `🔥 **${username}** membakar <@${targetId}> hidup-hidup!`,
    `⚡ **${username}** memanggil petir buat <@${targetId}>!`
  ];

  const randomMsg = messages[Math.floor(Math.random() * messages.length)];

  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit', minute: '2-digit'
  });

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: randomMsg,
      embeds: [{
        color: 0xFF4500,
        title: '💥 BOOOOM! KA-BOOM! 💥',
        description: [
          `\`\`\`ansi`,
          `\u001b[1;31m━━━━━━━━━━ 💣 EXPLOSION ━━━━━━━━━━\u001b[0m`,
          `\u001b[1;33m 🎯 Target   :\u001b[0m \u001b[0;37m${targetUser.username}\u001b[0m`,
          `\u001b[1;33m 💣 Bomber   :\u001b[0m \u001b[0;37m${username}\u001b[0m`,
          `\u001b[1;33m 🕐 Waktu    :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
          `\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m`,
          `\`\`\``
        ].join('\n'),
        image: { url: explosionUrl },
        footer: { text: '💀 RIP • OwoBim Explosion System' },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}




if (cmd === 'makequote') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const teks = getOption(options, 'teks');
  const targetOption = options.find(o => o.name === 'user');
  const warna = getOption(options, 'warna') || 'default';
  const targetId = targetOption ? String(targetOption.value) : discordId;
  const targetUser = targetOption
    ? interaction.data.resolved?.users?.[targetId]
    : (interaction.member?.user || interaction.user);

  if (!targetUser) return respond('❌ User tidak ditemukan!');
  if (!teks || teks.trim().length === 0) return respond('❌ Teks tidak boleh kosong!');
  if (teks.length > 200) return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  \u001b[1;31m✗  TEKS TERLALU PANJANG  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} ❌ Maksimal **200 karakter**!`,
    `> 📏 Teks kamu **${teks.length} karakter** — kelebihan **${teks.length - 200} karakter**.`
  ].join('\n'));

  const avatarUrl = targetUser.avatar
    ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.${targetUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(targetUser.discriminator || 0) % 5}.png`;

  const colorMap = {
    default: 0x2B2D31, merah: 0xFF4444, biru: 0x3498DB,
    hijau: 0x2ECC71, kuning: 0xF1C40F, ungu: 0x9B59B6,
    pink: 0xFF69B4, orange: 0xFF6B2B, hitam: 0x000000,
  };
  const embedColor = colorMap[warna.toLowerCase()] ?? 0x2B2D31;

  // ── Kirim deferred dulu (loading...) ──
  const deferredResponse = new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });

  // ── Proses berat di background ──
  waitUntil((async () => {
    try {
      // Cooldown
      const cooldownKey = `quote_cd:${discordId}`;
      const lastQuote = await env.USERS_KV.get(cooldownKey);
      if (lastQuote) {
        const sisa = 10000 - (Date.now() - parseInt(lastQuote));
        if (sisa > 0) {
          await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `> ${EMOJI} ⏳ Cooldown! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.` })
          });
          return;
        }
      }

      // Multi API fallback
      const apis = [
        `https://some-random-api.com/canvas/misc/quote?avatar=${encodeURIComponent(avatarUrl)}&username=${encodeURIComponent(targetUser.username)}&quote=${encodeURIComponent(teks)}`,
        `https://api.popcat.xyz/quote?image=${encodeURIComponent(avatarUrl)}&name=${encodeURIComponent(targetUser.username)}&text=${encodeURIComponent(teks)}`,
      ];
      let quoteUrl = apis[0];
      try {
        const test = await fetch(apis[0], { method: 'HEAD' });
        if (!test.ok) quoteUrl = apis[1];
      } catch { quoteUrl = apis[1]; }

      // Simpan ke KV
      const quoteId = `QT-${Date.now()}-${discordId.slice(-4)}`;
      const totalRaw = await env.USERS_KV.get(`quote_total:${targetId}`);
      const totalQuote = totalRaw ? parseInt(totalRaw) + 1 : 1;
      await env.USERS_KV.put(`quote_total:${targetId}`, String(totalQuote));
      await env.USERS_KV.put(`quote:${quoteId}`, JSON.stringify({
        id: quoteId, teks, targetId,
        targetUsername: targetUser.username,
        createdBy: discordId,
        createdByUsername: username,
        guildId: guildId || null,
        createdAt: Date.now()
      }), { expirationTtl: 86400 * 30 });
      await env.USERS_KV.put(cooldownKey, String(Date.now()), { expirationTtl: 60 });

      const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      const intros = [
        `🌟 Kata-kata bijak dari **${targetUser.username}**:`,
        `💭 Seseorang pernah berkata...`,
        `📖 Mutiara kata dari **${targetUser.username}**:`,
        `✨ Quote of the day by **${targetUser.username}**:`,
        `🎯 Words of wisdom dari **${targetUser.username}**:`
      ];
      const intro = intros[Math.floor(Math.random() * intros.length)];

      // Edit response dengan hasil final
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: intro,
          embeds: [{
            color: embedColor,
            author: {
              name: `💬 Quote by ${targetUser.username} • Quote #${totalQuote}`,
              icon_url: avatarUrl
            },
            description: [
              '```ansi',
              '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
              '\u001b[2;34m║  \u001b[1;33m💬  MAKE IT A QUOTE  💬\u001b[0m  \u001b[2;34m║\u001b[0m',
              '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
              '```',
              `> *"${teks}"*`,
              `> — **${targetUser.username}**`,
              '',
              '```ansi',
              '\u001b[1;32m━━━━━━━━━━━━ DETAIL INFO ━━━━━━━━━━━━\u001b[0m',
              `\u001b[1;36m 🆔  Quote ID :\u001b[0m \u001b[0;37m${quoteId}\u001b[0m`,
              `\u001b[1;36m 👤  User     :\u001b[0m \u001b[0;37m${targetUser.username}\u001b[0m`,
              `\u001b[1;36m ✍️  Dibuat   :\u001b[0m \u001b[0;37m${username}\u001b[0m`,
              `\u001b[1;36m 🕐  Waktu    :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
              `\u001b[1;36m 📏  Panjang  :\u001b[0m \u001b[0;37m${teks.length}/200 karakter\u001b[0m`,
              `\u001b[1;36m 🎨  Warna    :\u001b[0m \u001b[0;37m${warna}\u001b[0m`,
              `\u001b[1;36m 📊  Total    :\u001b[0m \u001b[0;37m${totalQuote}x quote dari user ini\u001b[0m`,
              '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              '```'
            ].join('\n'),
            image: { url: quoteUrl },
            thumbnail: { url: avatarUrl },
            footer: {
              text: `💬 OwoBim Quote Generator • ${quoteId}`,
              icon_url: avatarUrl
            },
            timestamp: new Date().toISOString()
          }]
        })
      });
    } catch (err) {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `${EMOJI} ❌ Terjadi error: \`${err.message}\`` })
      });
    }
  })());

  return deferredResponse;
}









// ═══════════════════════════════════════════════════════
// CMD: rps
// ═══════════════════════════════════════════════════════
if (cmd === 'rps') {
  const pilihanUser = getOption(options, 'pilihan');
  const lawanId     = getOption(options, 'lawan');
  const mode        = getOption(options, 'mode') || 'medium';

  const items = {
    batu:    { emoji: '🪨', nama: 'Batu',    menang: 'gunting', kalah: 'kertas'  },
    kertas:  { emoji: '📄', nama: 'Kertas',  menang: 'batu',    kalah: 'gunting' },
    gunting: { emoji: '✂️', nama: 'Gunting', menang: 'kertas',  kalah: 'batu'    }
  };
  const keys = Object.keys(items);

  if (lawanId) {
    if (lawanId === discordId) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Ga bisa lawan diri sendiri bro!', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const existingChallenge = await env.USERS_KV.get(`rps_active:${discordId}`);
    if (existingChallenge) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Kamu masih punya challenge yang belum selesai! Tunggu dulu atau challenge-nya expire.', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const challengeId   = `${discordId}-${Date.now()}`;
    const challengeData = {
      challengerId:      discordId,
      challengerName:    username,
      challengerPilihan: pilihanUser,
      lawanId,
      createdAt:         Date.now()
    };

    await Promise.all([
      env.USERS_KV.put(`rps_challenge:${challengeId}`, JSON.stringify(challengeData), { expirationTtl: 300 }),
      env.USERS_KV.put(`rps_active:${discordId}`, challengeId, { expirationTtl: 300 })
    ]);

    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: `⚔️ <@${lawanId}> kamu ditantang **${username}** main RPS!\n> Pilihan ${username} sudah dikunci 🔒 — pilih senjatamu dalam **5 menit**!`,
        embeds: [{
          color: 0x5865F2,
          title: '⚔️ RPS CHALLENGE!',
          description: [
            '```ansi',
            '\u001b[1;35m━━━━━━━━━━ CHALLENGE MASUK! ━━━━━━━━━━\u001b[0m',
            `\u001b[1;37m  👤 Challenger : \u001b[1;33m${username}\u001b[0m`,
            `\u001b[1;37m  🎯 Pilihan    : \u001b[1;32m[DIKUNCI 🔒]\u001b[0m`,
            `\u001b[1;37m  ⏰ Expire     : \u001b[1;31m5 menit\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `\n<@${lawanId}> pilih senjatamu! 👇`
          ].join('\n'),
          footer: { text: `Challenge ID: ${challengeId}` },
          timestamp: new Date().toISOString()
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 1, label: 'Batu 🪨',    custom_id: `rps_pvp:${challengeId}:batu`    },
            { type: 2, style: 1, label: 'Kertas 📄',  custom_id: `rps_pvp:${challengeId}:kertas`  },
            { type: 2, style: 4, label: 'Gunting ✂️', custom_id: `rps_pvp:${challengeId}:gunting` }
          ]
        }]
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const statsRaw = await env.USERS_KV.get(`rps:${discordId}`);
  const stats = statsRaw ? JSON.parse(statsRaw) : {
    menang: 0, kalah: 0, seri: 0, total: 0,
    streak: 0, bestStreak: 0, history: []
  };
  if (!stats.history) stats.history = [];

  let pilihanBot;
  if (mode === 'easy') {
    pilihanBot = Math.random() < 0.70
      ? items[pilihanUser].menang
      : keys[Math.floor(Math.random() * keys.length)];
  } else if (mode === 'medium') {
    pilihanBot = keys[Math.floor(Math.random() * keys.length)];
  } else if (mode === 'hard') {
    if (stats.history.length < 3) {
      pilihanBot = keys[Math.floor(Math.random() * keys.length)];
    } else {
      const recent = stats.history.slice(-8);
      const freq   = { batu: 0, kertas: 0, gunting: 0 };
      for (const h of recent) freq[h]++;
      const predicted = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      pilihanBot = Math.random() < 0.80
        ? items[predicted].kalah
        : keys[Math.floor(Math.random() * keys.length)];
    }
  }

  stats.history.push(pilihanUser);
  if (stats.history.length > 10) stats.history.shift();

  const userItem = items[pilihanUser];
  const botItem  = items[pilihanBot];

  let hasil, hasilEmoji, hasilColor, hasilAnsi;
  if (pilihanUser === pilihanBot) {
    hasil = 'SERI';   hasilEmoji = '🤝'; hasilColor = 0xF1C40F; hasilAnsi = '\u001b[1;33m';
  } else if (userItem.menang === pilihanBot) {
    hasil = 'MENANG'; hasilEmoji = '🏆'; hasilColor = 0x2ECC71; hasilAnsi = '\u001b[1;32m';
  } else {
    hasil = 'KALAH';  hasilEmoji = '💀'; hasilColor = 0xFF4444; hasilAnsi = '\u001b[1;31m';
  }

  stats.total++;
  if (hasil === 'MENANG') {
    stats.menang++;
    stats.streak = (stats.streak > 0 ? stats.streak : 0) + 1;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  } else if (hasil === 'KALAH') {
    stats.kalah++;
    stats.streak = (stats.streak < 0 ? stats.streak : 0) - 1;
  } else {
    stats.seri++;
    stats.streak = 0;
  }

  await env.USERS_KV.put(`rps:${discordId}`, JSON.stringify(stats), { expirationTtl: 86400 * 365 });

  const winRate = stats.total > 0 ? ((stats.menang / stats.total) * 100).toFixed(1) : '0.0';

  const pesanMenang = [
    `🏆 **${username}** menang! ${userItem.emoji} ${userItem.nama} ngalahin ${botItem.emoji} ${botItem.nama}!`,
    `🔥 GG! **${username}** jago banget! ${userItem.emoji} > ${botItem.emoji}`,
    `💪 **${username}** gaskeun! ${userItem.emoji} KO ${botItem.emoji}!`,
    `👑 **${username}** is UNSTOPPABLE! ${userItem.emoji} menghancurkan ${botItem.emoji}!`
  ];
  const pesanKalah = [
    `💀 **${username}** kalah! ${botItem.emoji} ${botItem.nama} ngalahin ${userItem.emoji} ${userItem.nama}!`,
    `😭 Sial! Bot pake ${botItem.emoji}, **${username}** pake ${userItem.emoji}...`,
    `💀 **${username}** dihajar bot! ${userItem.emoji} < ${botItem.emoji}`,
    `🤖 Bot menang lagi! **${username}** harus latihan dulu nih!`
  ];
  const pesanSeri = [
    `🤝 Seri! Dua-duanya pake ${userItem.emoji} ${userItem.nama}!`,
    `😅 Draw! Sama-sama pake ${userItem.emoji}!`,
    `⚡ Seimbang! **${username}** dan bot sama-sama ${userItem.emoji}!`
  ];
  const pesanHardKalah = [
    `🧠 Bot udah baca gerak lo **${username}**! Prediksi tepat!`,
    `🤖 Hard mode gak ada ampun! Bot udah tau lo mau milih apa!`,
    `📊 Bot analisa pattern lo dan counter! GG no re!`
  ];

  let pesanList;
  if (hasil === 'MENANG') pesanList = pesanMenang;
  else if (hasil === 'KALAH') pesanList = (mode === 'hard' && Math.random() < 0.6) ? pesanHardKalah : pesanKalah;
  else pesanList = pesanSeri;

  const pesan     = pesanList[Math.floor(Math.random() * pesanList.length)];
  const streakStr = stats.streak > 0
    ? `🔥 ${stats.streak}x Winstreak`
    : stats.streak < 0
    ? `❄️ ${Math.abs(stats.streak)}x Losestreak`
    : `➡️ Streak reset`;

  const modeLabel = {
    easy:   '😊 Easy   (Bot agak bego)',
    medium: '⚔️ Medium (Pure RNG)',
    hard:   '🧠 Hard   (Bot baca pola lo)'
  };
  const modeDiff = {
    easy: '🟢🔘🔘', medium: '🟡🟡🔘', hard: '🔴🔴🔴'
  };

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: pesan,
      embeds: [{
        color: hasilColor,
        title: `${hasilEmoji} ROCK PAPER SCISSORS — ${hasil}!`,
        description: [
          '```ansi',
          '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[2;34m║  ${hasilAnsi}${hasilEmoji}  ${hasil.padEnd(6)}  ${hasilEmoji}\u001b[0m  \u001b[2;34m║\u001b[0m`,
          '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '',
          `${userItem.emoji} **${username}** \`${userItem.nama.toUpperCase()}\` **VS** \`${botItem.nama.toUpperCase()}\` ${botItem.emoji} **Bot**`,
          '',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📊 STATISTIK ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;32m 🏆  Menang   :\u001b[0m \u001b[0;37m${stats.menang}x\u001b[0m`,
          `\u001b[1;31m 💀  Kalah    :\u001b[0m \u001b[0;37m${stats.kalah}x\u001b[0m`,
          `\u001b[1;33m 🤝  Seri     :\u001b[0m \u001b[0;37m${stats.seri}x\u001b[0m`,
          `\u001b[1;36m 🎮  Total    :\u001b[0m \u001b[0;37m${stats.total}x main\u001b[0m`,
          `\u001b[1;36m 📈  Win Rate :\u001b[0m \u001b[0;37m${winRate}%\u001b[0m`,
          `\u001b[1;36m ⚡  Streak   :\u001b[0m \u001b[0;37m${streakStr}\u001b[0m`,
          `\u001b[1;36m 🏅  Best     :\u001b[0m \u001b[0;37m${stats.bestStreak}x winstreak\u001b[0m`,
          `\u001b[1;36m 🎯  Mode     :\u001b[0m \u001b[0;37m${modeLabel[mode]}\u001b[0m`,
          `\u001b[1;36m 🎚️  Diff     :\u001b[0m \u001b[0;37m${modeDiff[mode]}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        footer: { text: `🎮 OwoBim RPS System • ${username}` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });

} // ← TUTUP if (cmd === 'rps')
    


    






if (cmd === 'quotesweb') {
  const teks = getOption(options, 'teks');
  if (!teks || teks.trim() === '') {
    return respond('❌ Teks quote tidak boleh kosong!');
  }
  if (teks.length > 300) {
    return respond('❌ Quote maksimal 300 karakter!');
  }

  const quoteId = `QUOTE-${Date.now()}-${discordId.slice(-6)}`;
  const quoteData = {
    id: quoteId,
    discordId: discordId,
    username: username,
    teks: teks.trim(),
    status: 'pending',
    submittedAt: Date.now(),
    guildId: guildId || 'DM'
  };

  await env.USERS_KV.put(`quote:${quoteId}`, JSON.stringify(quoteData), { expirationTtl: 86400 * 7 });

  const CHANNEL_ID = '1492626962567659684';

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
      },
      body: JSON.stringify({
        content: `<@1442230317455900823> 📨 **Quote Baru Masuk!**`,
        embeds: [{
          color: 0xF1C40F,
          title: '📬 Pending Quote',
          description: `> "${teks}"`,
          fields: [
            { name: '👤 Pengirim', value: `<@${discordId}> (${username})`, inline: true },
            { name: '🆔 Quote ID', value: `\`${quoteId}\``, inline: true },
            { name: '⏰ Waktu', value: new Date().toLocaleString('id-ID'), inline: true }
          ]
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: '✅ Approve', custom_id: `quote_approve:${quoteId}` },
            { type: 2, style: 4, label: '❌ Reject',  custom_id: `quote_reject:${quoteId}` }
          ]
        }]
      })
    });
    if (!res.ok) console.error('Gagal kirim ke channel:', await res.text());
  } catch (e) {
    console.error('Error kirim pesan:', e.message);
  }

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║ \u001b[1;33m📨 QUOTE TERKIRIM! 📨\u001b[0m \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> Quote kamu sudah dikirim ke owner.`,
    `> 🆔 **ID:** \`${quoteId}\``,
    `> 📍 Status: **Menunggu persetujuan**`
  ].join('\n'));
}



// ══════════════════════════════════════════════
if (cmd === 'confess') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  const targetOpt = options.find(o => o.name === 'target');
  const pesan     = getOption(options, 'pesan');
  const kategori  = getOption(options, 'kategori') || 'random';
  const mood      = getOption(options, 'mood') || 'shy';
  const targetId  = targetOpt ? String(targetOpt.value) : null;

  if (!targetId) return respond('❌ Pilih user tujuan!');
  if (targetId === discordId) return respond('❌ Ga bisa confess ke diri sendiri 😂');
  if (pesan.length > 500) return respond(`❌ Maks 500 karakter! Kamu: ${pesan.length}`);

  // Cek di-block
  const isBlocked = await env.USERS_KV.get(`confess_block:${targetId}:${discordId}`);
  if (isBlocked) return respond('❌ Kamu tidak bisa confess ke user ini! 🔒');

  // Cooldown 3 menit
  const cdKey      = `confess_cd:${discordId}`;
  const lastSent   = await env.USERS_KV.get(cdKey);
  if (lastSent) {
    const sisa = 180000 - (Date.now() - parseInt(lastSent));
    if (sisa > 0) {
      const m = Math.floor(sisa / 60000), s = Math.ceil((sisa % 60000) / 1000);
      return respond(`⏳ Cooldown! Tunggu **${m > 0 ? m+'m ' : ''}${s}d** lagi.`);
    }
  }

  // Config kategori
  const katCfg = {
    perasaan: { label: '💕 Perasaan', color: 0xFF69B4, ansi: '\u001b[1;35m' },
    sahabat:  { label: '🤝 Persahabatan', color: 0x3498DB, ansi: '\u001b[1;34m' },
    maaf:     { label: '🙏 Permintaan Maaf', color: 0x2ECC71, ansi: '\u001b[1;32m' },
    gosip:    { label: '🔥 Gosip / Tea', color: 0xFF4500, ansi: '\u001b[1;31m' },
    random:   { label: '😂 Random', color: 0xF1C40F, ansi: '\u001b[1;33m' },
    serius:   { label: '🎯 Serius', color: 0x9B59B6, ansi: '\u001b[1;36m' }
  };
  const moodCfg = {
    happy:   { emoji: '😊', label: 'Happy',   bar: '🟩🟩🟩🟩🟩' },
    sad:     { emoji: '😢', label: 'Sad',     bar: '🟦🟦🟦🟦🟦' },
    lovey:   { emoji: '🥰', label: 'Lovey',   bar: '🩷🩷🩷🩷🩷' },
    shy:     { emoji: '😳', label: 'Shy',     bar: '🟧🟧🟧🟧🟧' },
    nervous: { emoji: '😰', label: 'Nervous', bar: '🟨🟨🟨🟨🟨' },
    angry:   { emoji: '😡', label: 'Angry',   bar: '🟥🟥🟥🟥🟥' }
  };
  const cfg  = katCfg[kategori]  ?? katCfg.random;
  const mcfg = moodCfg[mood] ?? moodCfg.shy;

  // Generate ID & counter
  const confessId  = `CF-${Date.now()}-${discordId.slice(-4)}`;
  const totalRaw   = await env.USERS_KV.get(`confess_total:${targetId}`);
  const totalCount = totalRaw ? parseInt(totalRaw) + 1 : 1;
  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Simpan ke KV
  await Promise.all([
    env.USERS_KV.put(`confess:${confessId}`, JSON.stringify({
      id: confessId, senderId: discordId, senderUsername: username,
      targetId, pesan, kategori, mood,
      guildId: guildId || 'DM', createdAt: Date.now(),
      status: 'sent', replyCount: 0
    }), { expirationTtl: 86400 * 30 }),
    env.USERS_KV.put(`confess_total:${targetId}`, String(totalCount)),
    env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 180 })
  ]);

  const tUser    = interaction.data.resolved?.users?.[targetId];
  const tName    = tUser?.username || 'User';
  const tAvatar  = tUser?.avatar
    ? `https://cdn.discordapp.com/avatars/${targetId}/${tUser.avatar}.png?size=256`
    : 'https://cdn.discordapp.com/embed/avatars/5.png';

  // Kirim DM ke target
  try {
    const dmCh = await (await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: targetId })
    })).json();
    if (!dmCh.id) throw new Error('DM channel gagal dibuka');

    await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        content: `📬 Kamu dapat **anonymous confession** #${totalCount}!`,
        embeds: [{
          color: cfg.color,
          author: { name: `💌 Anonymous Confession #${totalCount}`, icon_url: tAvatar },
          description: [
            '```ansi',
            `${cfg.ansi}╔══════════════════════════════════════╗\u001b[0m`,
            `${cfg.ansi}║  💌  ANONYMOUS CONFESSION  💌  ║\u001b[0m`,
            `${cfg.ansi}╚══════════════════════════════════════╝\u001b[0m`,
            '```',
            `> ${mcfg.emoji} *"${pesan}"*`,
            '',
            '```ansi',
            '\u001b[1;37m━━━━━━━━━━━━ 📋 DETAIL ━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🆔  ID      :\u001b[0m \u001b[0;37m${confessId}\u001b[0m`,
            `\u001b[1;36m 🏷️  Kategori:\u001b[0m \u001b[0;37m${cfg.label}\u001b[0m`,
            `\u001b[1;36m ${mcfg.emoji}  Mood    :\u001b[0m \u001b[0;37m${mcfg.label}  ${mcfg.bar}\u001b[0m`,
            `\u001b[1;36m 🕐  Waktu   :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
            '\u001b[1;36m 👤  Dari    :\u001b[0m \u001b[1;31m[ANONIM 🔒]\u001b[0m',
            '\u001b[1;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```'
          ].join('\n'),
          footer: { text: `OwoBim Confess System • ${confessId}` },
          timestamp: new Date().toISOString()
        }],
        components: [{ type: 1, components: [
          { type: 2, style: 1, label: '💬 Reply Anonim', custom_id: `confess_reply:${confessId}` },
          { type: 2, style: 4, label: '🚫 Block',       custom_id: `confess_block:${confessId}`  },
          { type: 2, style: 2, label: '🚨 Report',      custom_id: `confess_report:${confessId}` }
        ]}]
      })
    });

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;32m✓  CONFESS TERKIRIM!  ✓\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} 📬 Confess berhasil dikirim ke **${tName}**!`,
      '> 🔒 Identitasmu **sepenuhnya anonim**.',
      '',
      '```ansi',
      '\u001b[1;32m━━━━━━━━━━━━ 📋 RINGKASAN ━━━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m 🆔  Confess ID :\u001b[0m \u001b[0;37m${confessId}\u001b[0m`,
      `\u001b[1;36m 🏷️  Kategori   :\u001b[0m \u001b[0;37m${cfg.label}\u001b[0m`,
      `\u001b[1;36m ${mcfg.emoji}  Mood       :\u001b[0m \u001b[0;37m${mcfg.label}\u001b[0m`,
      `\u001b[1;36m 🕐  Waktu      :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```'
    ].join('\n'));

  } catch (err) {
    await Promise.all([
      env.USERS_KV.delete(`confess:${confessId}`),
      env.USERS_KV.put(`confess_total:${targetId}`, String(Math.max(0, totalCount - 1)))
    ]);
    return respond(`❌ Gagal kirim DM ke **${tName}**!\n> 💡 Pastikan mereka mengizinkan DM dari server ini.\n> 🔧 \`${err.message}\``);
  }
}





if (cmd === 'slots') {
  const amountRaw = getOption(options, 'jumlah');
  const bet = amountRaw === 'all' ? user.balance : parseInt(amountRaw);

  if (!bet || bet <= 0)     return respond('❌ Jumlah taruhan tidak valid.');
  if (bet < 100)            return respond('❌ Taruhan minimum **🪙 100**!');
  if (bet > 5000000000)     return respond('❌ Taruhan maksimum **🪙 5.000.000.000**!');
  if (bet > user.balance)   return respond(`❌ Saldo tidak cukup! Kamu punya 🪙 **${user.balance.toLocaleString()}**`);

  const SYMBOLS = [
    { s: '💎', name: 'Diamond', weight: 3  },
    { s: '7️⃣',  name: 'Lucky7',  weight: 5  },
    { s: '🍀', name: 'Clover',  weight: 8  },
    { s: '⭐', name: 'Star',    weight: 12 },
    { s: '🔔', name: 'Bell',    weight: 16 },
    { s: '🍇', name: 'Grape',   weight: 18 },
    { s: '🍋', name: 'Lemon',   weight: 19 },
    { s: '🍒', name: 'Cherry',  weight: 19 },
  ];
  const TOTAL_WEIGHT = SYMBOLS.reduce((a, b) => a + b.weight, 0);

  const spinOne = () => {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const sym of SYMBOLS) {
      r -= sym.weight;
      if (r <= 0) return sym;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  };

  const reels = Array.from({ length: 5 }, () => spinOne());

  const freq = {};
  for (const r of reels) freq[r.name] = (freq[r.name] || 0) + 1;
  const maxMatch = Math.max(...Object.values(freq));
  const topSym   = reels.find(r => freq[r.name] === maxMatch);

  const MULT = {
    'Diamond-5': 300, 'Lucky7-5': 150, 'Clover-5': 80,
    'Star-5': 40,     'Bell-5': 25,    'Grape-5': 15,
    'Lemon-5': 10,    'Cherry-5': 8,
    'Diamond-4': 30,  'Lucky7-4': 18,  'Clover-4': 10,
    'Star-4': 7,      'Bell-4': 5,     'Grape-4': 4,
    'Lemon-4': 3,     'Cherry-4': 2.5,
    'Diamond-3': 6,   'Lucky7-3': 4,   'Clover-3': 2.5,
    'Star-3': 2,      'Bell-3': 1.8,   'Grape-3': 1.5,
    'Lemon-3': 1.3,   'Cherry-3': 1.2,
    'Diamond-2': 0.8, 'Lucky7-2': 0.6,
    'Clover-2':  0.4, 'Star-2':   0.3,
  };

  const multKey  = `${topSym.name}-${maxMatch}`;
  const mult     = MULT[multKey] || 0;
  const isWin    = mult > 0;
  const prize    = isWin ? Math.floor(bet * mult) : 0;
  // Profit sejati = prize dikurangi modal
  const netProfit = prize - bet;

  user.balance = isWin ? user.balance - bet + prize : user.balance - bet;
  if (isWin) user.totalEarned = (user.totalEarned || 0) + prize;

  const slotStats = user.slotStats || { spin: 0, wins: 0, totalBet: 0, totalWin: 0, biggestWin: 0, jackpots: 0 };
  slotStats.spin++;
  slotStats.totalBet += bet;
  if (isWin) {
    slotStats.wins++;
    slotStats.totalWin += prize;
    if (prize > slotStats.biggestWin) slotStats.biggestWin = prize;
    if (maxMatch === 5) slotStats.jackpots++;
  }
  user.slotStats = slotStats;
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  waitUntil(pushLinkedRole(env, discordId, null, user));

  const isJackpot = maxMatch === 5;
  const winRate   = slotStats.spin > 0 ? ((slotStats.wins / slotStats.spin) * 100).toFixed(1) : '0.0';
  const roi       = slotStats.totalBet > 0
    ? (((slotStats.totalWin - slotStats.totalBet) / slotStats.totalBet) * 100).toFixed(1)
    : '0.0';

  const resultLabel = isJackpot
    ? `🎊 JACKPOT ${maxMatch}x ${topSym.s}!`
    : isWin && maxMatch === 4
    ? `🔥 NEAR JACKPOT ${maxMatch}x ${topSym.s}!`
    : isWin && maxMatch === 3
    ? `✨ ${maxMatch}x ${topSym.s} — MENANG!`
    : isWin
    ? `💫 ${maxMatch}x ${topSym.s} — BONUS!`
    : '💀 KALAH — Tidak ada kombinasi';

  const headerColor = isJackpot
    ? '\u001b[1;33m'
    : isWin && maxMatch >= 4
    ? '\u001b[1;31m'
    : isWin
    ? '\u001b[1;32m'
    : '\u001b[1;37m';

  // Profit string — selalu positif kalau menang, negatif kalau kalah
  const profitStr = isWin
    ? (netProfit >= 0
        ? `\u001b[1;32m+${netProfit.toLocaleString()}\u001b[0m`
        : `\u001b[1;33m${netProfit.toLocaleString()} (dapat 🪙${prize.toLocaleString()})\u001b[0m`)
    : `\u001b[1;31m-${bet.toLocaleString()}\u001b[0m`;

  const contentLine = isJackpot
    ? `🎊 **JACKPOT!!!** **${username}** meledak dengan **5x ${topSym.s} ${topSym.name}**! 🎊`
    : isWin
    ? `🎉 **${username}** menang! **${maxMatch}x ${topSym.s}** - dapat 🪙 **${prize.toLocaleString()}**!`
    : `💀 **${username}** kalah! Tidak ada kombinasi. -🪙 ${bet.toLocaleString()}`;

  const multDisplay = mult > 0 ? `x${mult} (dapat 🪙 ${prize.toLocaleString()})` : '—';

  // Gulungan — render satu per satu biar emoji tidak hilang
  const reelDisplay = `${reels[0].s}  ${reels[1].s}  ${reels[2].s}  ${reels[3].s}  ${reels[4].s}`;

  const desc = [
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════════╗\u001b[0m',
    headerColor + '║  🎰  S L O T  M A C H I N E  🎰  ║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════════╝\u001b[0m',
    '```',
    '```',
    `  ${reelDisplay}`,
    '```',
    '```ansi',
    '\u001b[1;33m━━━━━━━━━━━ 💰 HASIL SPIN ━━━━━━━━━━━\u001b[0m',
    `\u001b[1;36m 🎯  Kombinasi  :\u001b[0m \u001b[0;37m${maxMatch}x ${topSym.s} ${topSym.name}\u001b[0m`,
    `\u001b[1;36m ✖️   Multiplier :\u001b[0m \u001b[0;37m${multDisplay}\u001b[0m`,
    `\u001b[1;36m 💵  Taruhan    :\u001b[0m \u001b[0;37m🪙 ${bet.toLocaleString()}\u001b[0m`,
    '\u001b[1;36m 💸  Profit     :\u001b[0m ' + profitStr,
    `\u001b[1;36m 💰  Saldo      :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
    '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;35m━━━━━━━━━━━ 📊 STATISTIK ━━━━━━━━━━━━\u001b[0m',
    `\u001b[1;36m 🎰  Total Spin :\u001b[0m \u001b[0;37m${slotStats.spin}x\u001b[0m`,
    `\u001b[1;36m 🏆  Total Wins :\u001b[0m \u001b[0;37m${slotStats.wins}x\u001b[0m`,
    `\u001b[1;36m 📈  Win Rate   :\u001b[0m \u001b[0;37m${winRate}%\u001b[0m`,
    `\u001b[1;36m 💎  Jackpots   :\u001b[0m \u001b[0;37m${slotStats.jackpots}x\u001b[0m`,
    `\u001b[1;36m 🏅  Biggest    :\u001b[0m \u001b[0;37m🪙 ${slotStats.biggestWin.toLocaleString()}\u001b[0m`,
    `\u001b[1;36m 📉  ROI        :\u001b[0m \u001b[0;37m${roi}%\u001b[0m`,
    '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '```',
    '```ansi',
    '\u001b[1;34m━━━━━━━━━ 🗂️ TABEL MULTIPLIER ━━━━━━━━\u001b[0m',
    '\u001b[0;37m 💎x5=300x | 7x5=150x | 🍀x5=80x | ⭐x5=40x\u001b[0m',
    '\u001b[0;37m 💎x4=30x  | 7x4=18x  | 🍀x4=10x | ⭐x4=7x \u001b[0m',
    '\u001b[0;37m 💎x3=6x   | 7x3=4x   | 🍀x3=2.5x| ⭐x3=2x \u001b[0m',
    '\u001b[0;37m 💎x2=0.8x | 7x2=0.6x | 🍀x2=0.4x| ⭐x2=0.3x\u001b[0m',
    '\u001b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '```'
  ].join('\n');

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: contentLine,
      embeds: [{
        color: isJackpot ? 0xFFD700 : isWin ? 0x2ECC71 : 0xFF4444,
        title: `🎰 SLOT MACHINE — ${resultLabel}`,
        description: desc,
        footer: { text: `🎰 OwoBim Slot Machine - ${username}` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}





    // ══════════════════════════════════════════════
// CMD: spawn — munculkan Pokémon random
// ══════════════════════════════════════════════
if (cmd === 'spawn') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  // Cek cooldown spawn (1 menit per channel)
  const spawnCdKey = `spawn_cd:${channelId}`;
  const lastSpawn  = await env.USERS_KV.get(spawnCdKey);
  if (lastSpawn) {
    const sisa = 60000 - (Date.now() - parseInt(lastSpawn));
    if (sisa > 0) {
      return respond(`> ${EMOJI} ⏳ Pokémon baru akan muncul dalam **${Math.ceil(sisa/1000)} detik**!`);
    }
  }

  // Ambil Pokémon random dari PokeAPI (gen 1-9, max ID 1025)
  const randomId = Math.floor(Math.random() * 1025) + 1;
  const pokeRes  = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
  if (!pokeRes.ok) return respond('❌ Gagal fetch Pokémon, coba lagi!');
  const pokeData = await pokeRes.json();

  const pokeName    = pokeData.name;
  const pokeSprite  = pokeData.sprites.other['official-artwork'].front_default
    || pokeData.sprites.front_default;
  const pokeTypes   = pokeData.types.map(t => t.type.name).join(', ');
  const pokeHp      = pokeData.stats.find(s => s.stat.name === 'hp').base_stat;
  const pokeAtk     = pokeData.stats.find(s => s.stat.name === 'attack').base_stat;
  const pokeDef     = pokeData.stats.find(s => s.stat.name === 'defense').base_stat;
  const pokeSpd     = pokeData.stats.find(s => s.stat.name === 'speed').base_stat;

  // Tentukan rarity berdasarkan base_experience
  const baseExp = pokeData.base_experience || 100;
  const rarity  = baseExp >= 250 ? '🔴 Legendary'
    : baseExp >= 180 ? '🟠 Epic'
    : baseExp >= 120 ? '🟡 Rare'
    : baseExp >= 70  ? '🟢 Uncommon'
    : '⚪ Common';

  // Simpan spawn aktif ke KV (expire 5 menit)
  const spawnData = {
    id: randomId,
    name: pokeName,
    sprite: pokeSprite,
    types: pokeTypes,
    hp: pokeHp, atk: pokeAtk, def: pokeDef, spd: pokeSpd,
    rarity, baseExp,
    spawnedAt: Date.now(),
    spawnedBy: discordId,
    channelId, guildId
  };
  await env.USERS_KV.put(`spawn:${channelId}`, JSON.stringify(spawnData), { expirationTtl: 300 });
  await env.USERS_KV.put(spawnCdKey, String(Date.now()), { expirationTtl: 60 });

  const nameHint = pokeName.length <= 4
    ? pokeName[0] + '?'.repeat(pokeName.length - 1)
    : pokeName[0] + '?'.repeat(Math.floor(pokeName.length / 2)) + pokeName.slice(-1);

  return new Response(JSON.stringify({
    type: 4,
    data: {
      embeds: [{
        color: 0xFFCB05,
        title: '⚡ Pokémon Liar Muncul!',
        description: [
          '```ansi',
          '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[1;33m║  ⚡  A WILD POKEMON APPEARED!  ⚡  ║\u001b[0m',
          '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 🔍 HINT ━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;37m  Nama    : \u001b[1;33m${nameHint}\u001b[0m`,
          `\u001b[1;37m  Tipe    : \u001b[0;37m${pokeTypes}\u001b[0m`,
          `\u001b[1;37m  Rarity  : \u001b[0;37m${rarity}\u001b[0m`,
          `\u001b[1;37m  HP      : \u001b[0;37m${pokeHp}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 🎯 Gunakan \`/catch <nama>\` untuk menangkapnya!`,
          `> ⏰ Pokémon akan kabur dalam **5 menit**!`
        ].join('\n'),
        image: { url: pokeSprite },
        footer: { text: `OwoBim Pokémon System • ID #${randomId}` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}


// ══════════════════════════════════════════════
// CMD: catch — tangkap Pokémon yang spawn
// ══════════════════════════════════════════════
if (cmd === 'catch') {
  const EMOJI   = '<a:GifOwoBim:1492599199038967878>';
  const namaInput = getOption(options, 'nama')?.toLowerCase().trim();

  if (!namaInput) return respond('❌ Tulis nama Pokémon yang mau ditangkap!\nContoh: `/catch pikachu`');

  // Cek ada spawn aktif di channel ini
  const spawnRaw = await env.USERS_KV.get(`spawn:${channelId}`);
  if (!spawnRaw) {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m✗  TIDAK ADA POKEMON  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ❌ Tidak ada Pokémon yang muncul di channel ini!`,
      `> 💡 Gunakan \`/spawn\` atau ketik **spawn** untuk memunculkan Pokémon.`
    ].join('\n'));
  }

  const spawnData = JSON.parse(spawnRaw);

  // Cek nama benar
  if (namaInput !== spawnData.name.toLowerCase()) {
    // Kasih hint kalau salah
    const benar  = spawnData.name.toLowerCase();
    const hints  = [];
    let matchCount = 0;
    for (let i = 0; i < Math.min(namaInput.length, benar.length); i++) {
      if (namaInput[i] === benar[i]) matchCount++;
    }
    const pct = Math.round((matchCount / benar.length) * 100);

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m✗  NAMA SALAH!  ✗\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ❌ Nama **\`${namaInput}\`** salah!`,
      `> 🎯 Akurasi: **${pct}%** mendekati nama yang benar`,
      `> 💡 Hint: **${spawnData.name[0]}${'?'.repeat(Math.floor(spawnData.name.length/2))}${spawnData.name.slice(-1)}** — tipe: **${spawnData.types}**`
    ].join('\n'));
  }

  // Nama benar — hitung catch rate berdasarkan rarity
  const catchRates = {
    '⚪ Common': 90, '🟢 Uncommon': 75,
    '🟡 Rare': 55,   '🟠 Epic': 35, '🔴 Legendary': 15
  };
  const catchRate = catchRates[spawnData.rarity] || 70;
  const roll      = Math.random() * 100;
  const caught    = roll <= catchRate;

  if (!caught) {
    // Gagal tangkap — Pokemon kabur 30% chance
    const escape = Math.random() < 0.3;
    if (escape) await env.USERS_KV.delete(`spawn:${channelId}`);

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m💨  POKEMON KABUR!  💨\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} 💨 **${spawnData.name}** berhasil menghindari Poké Ball!`,
      escape
        ? `> 😭 Pokémon **kabur** dari area! Spawn ulang lagi.`
        : `> 🎯 Coba lagi! Pokémon masih di sini.`,
      `> 📊 Catch rate: **${catchRate}%** | Roll: **${Math.round(roll)}**`
    ].join('\n'));
  }

  // Berhasil tangkap!
  await env.USERS_KV.delete(`spawn:${channelId}`);

  // Simpan ke koleksi user
  const collKey  = `pokemon:${discordId}`;
  const collRaw  = await env.USERS_KV.get(collKey);
  const coll     = collRaw ? JSON.parse(collRaw) : [];

  // Cek duplikat
  const isDupe = coll.some(p => p.id === spawnData.id);
  const pokeEntry = {
    id:        spawnData.id,
    name:      spawnData.name,
    types:     spawnData.types,
    rarity:    spawnData.rarity,
    hp:        spawnData.hp,
    atk:       spawnData.atk,
    def:       spawnData.def,
    spd:       spawnData.spd,
    sprite:    spawnData.sprite,
    caughtAt:  Date.now(),
    caughtBy:  username,
    count:     isDupe ? (coll.find(p => p.id === spawnData.id).count || 1) + 1 : 1
  };

  if (isDupe) {
    const idx = coll.findIndex(p => p.id === spawnData.id);
    coll[idx] = pokeEntry;
  } else {
    coll.push(pokeEntry);
  }

  await env.USERS_KV.put(collKey, JSON.stringify(coll));

  // Update stats
  const pokeStats = user.pokeStats || { caught: 0, legendary: 0, epic: 0, rare: 0, dupes: 0 };
  pokeStats.caught++;
  if (isDupe) pokeStats.dupes++;
  if (spawnData.rarity === '🔴 Legendary') pokeStats.legendary++;
  if (spawnData.rarity === '🟠 Epic') pokeStats.epic++;
  if (spawnData.rarity === '🟡 Rare') pokeStats.rare++;
  user.pokeStats = pokeStats;
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  waitUntil(pushLinkedRole(env, discordId, null, user));

  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit',
    month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: isDupe
        ? `🔄 **${username}** dapat duplikat **${spawnData.name}**! (${pokeEntry.count}x)`
        : `🎉 **${username}** berhasil menangkap **${spawnData.name}**! ${spawnData.rarity}`,
      embeds: [{
        color: isDupe ? 0xF1C40F : 0x2ECC71,
        title: isDupe ? `🔄 Duplikat — ${spawnData.name}!` : `✅ Tertangkap — ${spawnData.name}!`,
        description: [
          '```ansi',
          '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[1;32m║  ✅  GOTCHA! ${spawnData.name.toUpperCase().padEnd(20)}║\u001b[0m`,
          '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;32m━━━━━━━━━━━━ 📋 INFO ━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🏷️  Nama    :\u001b[0m \u001b[1;37m${spawnData.name}\u001b[0m`,
          `\u001b[1;36m  🌀  Tipe    :\u001b[0m \u001b[0;37m${spawnData.types}\u001b[0m`,
          `\u001b[1;36m  ⭐  Rarity  :\u001b[0m \u001b[0;37m${spawnData.rarity}\u001b[0m`,
          `\u001b[1;36m  ❤️  HP      :\u001b[0m \u001b[0;37m${spawnData.hp}\u001b[0m`,
          `\u001b[1;36m  ⚔️  ATK     :\u001b[0m \u001b[0;37m${spawnData.atk}\u001b[0m`,
          `\u001b[1;36m  🛡️  DEF     :\u001b[0m \u001b[0;37m${spawnData.def}\u001b[0m`,
          `\u001b[1;36m  💨  SPD     :\u001b[0m \u001b[0;37m${spawnData.spd}\u001b[0m`,
          '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '\u001b[1;33m━━━━━━━━━━━━ 🎒 KOLEKSI ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  📦  Total   :\u001b[0m \u001b[0;37m${coll.length} Pokémon\u001b[0m`,
          `\u001b[1;36m  🔄  Duplikat:\u001b[0m \u001b[0;37m${isDupe ? 'Ya ('+pokeEntry.count+'x)' : 'Tidak — Baru!'}\u001b[0m`,
          `\u001b[1;36m  🏆  Caught  :\u001b[0m \u001b[0;37m${pokeStats.caught}x total\u001b[0m`,
          `\u001b[1;36m  🔴  Legend  :\u001b[0m \u001b[0;37m${pokeStats.legendary}x\u001b[0m`,
          `\u001b[1;36m  🕐  Waktu   :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        thumbnail: { url: spawnData.sprite },
        footer: { text: `OwoBim Pokémon System • #${spawnData.id}` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}


// ══════════════════════════════════════════════
// CMD: pokedex — lihat koleksi Pokémon
// ══════════════════════════════════════════════
if (cmd === 'pokedex') {
  const EMOJI    = '<a:GifOwoBim:1492599199038967878>';
  const targetOpt = options.find(o => o.name === 'user');
  const targetId  = targetOpt ? String(targetOpt.value) : discordId;
  const targetUser = targetOpt
    ? interaction.data.resolved?.users?.[targetId]
    : (interaction.member?.user || interaction.user);
  const targetName = targetUser?.username || 'Unknown';
  const page = parseInt(getOption(options, 'page') || '1');

  const collRaw = await env.USERS_KV.get(`pokemon:${targetId}`);
  const coll    = collRaw ? JSON.parse(collRaw) : [];

  if (coll.length === 0) {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;31m📭  KOLEKSI KOSONG  📭\u001b[0m  \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} **${targetName}** belum punya Pokémon!`,
      `> 💡 Gunakan \`/spawn\` lalu \`/catch <nama>\` untuk mulai koleksi.`
    ].join('\n'));
  }

  // Sort by rarity then ID
  const rarityOrder = { '🔴 Legendary': 0, '🟠 Epic': 1, '🟡 Rare': 2, '🟢 Uncommon': 3, '⚪ Common': 4 };
  coll.sort((a, b) => (rarityOrder[a.rarity] ?? 5) - (rarityOrder[b.rarity] ?? 5) || a.id - b.id);

  const PER_PAGE = 10;
  const totalPage = Math.ceil(coll.length / PER_PAGE);
  const curPage   = Math.min(Math.max(page, 1), totalPage);
  const slice     = coll.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  // Stats koleksi
  const legendary = coll.filter(p => p.rarity === '🔴 Legendary').length;
  const epic      = coll.filter(p => p.rarity === '🟠 Epic').length;
  const rare      = coll.filter(p => p.rarity === '🟡 Rare').length;
  const pokeStats = user.pokeStats || {};

  const pokeList = slice.map((p, i) => {
    const no  = ((curPage - 1) * PER_PAGE) + i + 1;
    const dup = p.count > 1 ? ` (x${p.count})` : '';
    return `\u001b[1;36m ${String(no).padStart(2)}.\u001b[0m \u001b[0;37m#${String(p.id).padStart(4,'0')} ${p.name.padEnd(15)} ${p.rarity}${dup}\u001b[0m`;
  }).join('\n');

  return new Response(JSON.stringify({
    type: 4,
    data: {
      embeds: [{
        color: 0xFF0000,
        title: `📖 Pokédex — ${targetName}`,
        description: [
          '```ansi',
          '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[1;31m║  📖  POKEDEX — ${targetName.slice(0,14).padEnd(14)}  ║\u001b[0m`,
          '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━ 📊 STATISTIK ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  📦  Total Koleksi :\u001b[0m \u001b[0;37m${coll.length} Pokémon\u001b[0m`,
          `\u001b[1;36m  🔴  Legendary     :\u001b[0m \u001b[0;37m${legendary}x\u001b[0m`,
          `\u001b[1;36m  🟠  Epic          :\u001b[0m \u001b[0;37m${epic}x\u001b[0m`,
          `\u001b[1;36m  🟡  Rare          :\u001b[0m \u001b[0;37m${rare}x\u001b[0m`,
          `\u001b[1;36m  🏆  Total Caught  :\u001b[0m \u001b[0;37m${pokeStats.caught || 0}x\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;32m━━━━━━ 📋 DAFTAR (Hal. ${curPage}/${totalPage}) ━━━━━━\u001b[0m`,
          pokeList,
          '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          curPage < totalPage
            ? `> 📄 Halaman ${curPage}/${totalPage} — gunakan \`/pokedex page:${curPage+1}\` untuk lanjut`
            : `> ✅ Halaman terakhir (${totalPage}/${totalPage})`
        ].join('\n'),
        footer: { text: `OwoBim Pokémon System • ${targetName}` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}



    // ══════════════════════════════════════════════
// CMD: pokemon — lihat detail 1 pokemon di koleksi
// ══════════════════════════════════════════════
if (cmd === 'pokemon') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const namaInput = getOption(options, 'nama')?.toLowerCase().trim();

  const collRaw = await env.USERS_KV.get(`pokemon:${discordId}`);
  const coll    = collRaw ? JSON.parse(collRaw) : [];

  if (coll.length === 0) return respond(`> ${EMOJI} ❌ Kamu belum punya Pokémon!`);

  const found = coll.find(p => p.name.toLowerCase() === namaInput);
  if (!found) return respond(`> ${EMOJI} ❌ Pokémon **${namaInput}** tidak ada di koleksimu!\n> 💡 Cek \`/pokedex\` untuk lihat daftar koleksi.`);

  return new Response(JSON.stringify({
    type: 4,
    data: {
      embeds: [{
        color: found.rarity === '🔴 Legendary' ? 0xFF0000
          : found.rarity === '🟠 Epic' ? 0xFF6600
          : found.rarity === '🟡 Rare' ? 0xFFD700
          : found.rarity === '🟢 Uncommon' ? 0x00FF00 : 0xAAAAAA,
        title: `📋 ${found.name.toUpperCase()} — Detail`,
        description: [
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📋 INFO ━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🏷️  Nama    :\u001b[0m \u001b[1;37m${found.name}\u001b[0m`,
          `\u001b[1;36m  🌀  Tipe    :\u001b[0m \u001b[0;37m${found.types}\u001b[0m`,
          `\u001b[1;36m  ⭐  Rarity  :\u001b[0m \u001b[0;37m${found.rarity}\u001b[0m`,
          `\u001b[1;36m  ❤️  HP      :\u001b[0m \u001b[0;37m${found.hp}\u001b[0m`,
          `\u001b[1;36m  ⚔️  ATK     :\u001b[0m \u001b[0;37m${found.atk}\u001b[0m`,
          `\u001b[1;36m  🛡️  DEF     :\u001b[0m \u001b[0;37m${found.def}\u001b[0m`,
          `\u001b[1;36m  💨  SPD     :\u001b[0m \u001b[0;37m${found.spd}\u001b[0m`,
          `\u001b[1;36m  🔄  Jumlah  :\u001b[0m \u001b[0;37m${found.count || 1}x\u001b[0m`,
          `\u001b[1;36m  #️⃣  ID      :\u001b[0m \u001b[0;37m#${String(found.id).padStart(4,'0')}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        image: { url: found.sprite },  // ← gambar full size di bawah
        footer: { text: `OwoBim Pokémon System • Koleksi kamu` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}





    // ══════════════════════════════════════════════
// CMD: gacha — beli Pokemon random pakai coins
// ══════════════════════════════════════════════
if (cmd === 'gacha') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  // Harga gacha per tier
  const GACHA_TIERS = [
    { name: '⚪ Basic',    price: 25000,   pool: ['⚪ Common', '🟢 Uncommon'],                      label: 'Basic Roll'    },
    { name: '🟡 Premium',  price: 75000,  pool: ['🟢 Uncommon', '🟡 Rare', '🟠 Epic'],             label: 'Premium Roll'  },
    { name: '🔴 Legendary',price: 200000,  pool: ['🟡 Rare', '🟠 Epic', '🔴 Legendary'],            label: 'Legend Roll'   },
  ];

  const tierInput = getOption(options, 'tier') || 'basic'; // basic / premium / legendary
  const tier = GACHA_TIERS.find(t => t.name.toLowerCase().includes(tierInput.toLowerCase()))
    || GACHA_TIERS[0];

  // Cek saldo user
  const balance = user.balance || 0;
  if (balance < tier.price) {
    return respond([
      '```ansi',
      '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[1;31m║  💸  SALDO TIDAK CUKUP!  💸         ║\u001b[0m',
      '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ❌ Saldo kamu: **${balance.toLocaleString('id-ID')} coins**`,
      `> 💰 Harga **${tier.name}**: **${tier.price.toLocaleString('id-ID')} coins**`,
      `> 💡 Cari coins dulu ya!`
    ].join('\n'));
  }

  // Ambil Pokemon random dari pool rarity yang sesuai
  // Looping sampai dapat Pokemon dengan rarity yang masuk pool
  let pokeData, attempts = 0;
  while (attempts < 20) {
    const randomId = Math.floor(Math.random() * 1025) + 1;
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
    if (!res.ok) { attempts++; continue; }
    const data = await res.json();

    const baseExp = data.base_experience || 100;
    const rarity  = baseExp >= 250 ? '🔴 Legendary'
      : baseExp >= 180 ? '🟠 Epic'
      : baseExp >= 120 ? '🟡 Rare'
      : baseExp >= 70  ? '🟢 Uncommon'
      : '⚪ Common';

    if (tier.pool.includes(rarity)) {
      pokeData = { data, rarity };
      break;
    }
    attempts++;
  }

  if (!pokeData) return respond('❌ Gagal gacha, coba lagi!');

  const { data, rarity } = pokeData;
  const pokeName   = data.name;
  const pokeSprite = data.sprites.other['official-artwork'].front_default || data.sprites.front_default;
  const pokeTypes  = data.types.map(t => t.type.name).join(', ');
  const pokeHp     = data.stats.find(s => s.stat.name === 'hp').base_stat;
  const pokeAtk    = data.stats.find(s => s.stat.name === 'attack').base_stat;
  const pokeDef    = data.stats.find(s => s.stat.name === 'defense').base_stat;
  const pokeSpd    = data.stats.find(s => s.stat.name === 'speed').base_stat;

  // Kurangi saldo
  user.balance = balance - tier.price;

  // Simpan ke koleksi
  const collKey = `pokemon:${discordId}`;
  const collRaw = await env.USERS_KV.get(collKey);
  const coll    = collRaw ? JSON.parse(collRaw) : [];

  const isDupe = coll.some(p => p.id === data.id);
  const pokeEntry = {
    id: data.id, name: pokeName, types: pokeTypes,
    rarity, hp: pokeHp, atk: pokeAtk, def: pokeDef, spd: pokeSpd,
    sprite: pokeSprite, caughtAt: Date.now(), caughtBy: username,
    count: isDupe ? (coll.find(p => p.id === data.id).count || 1) + 1 : 1
  };

  if (isDupe) {
    const idx = coll.findIndex(p => p.id === data.id);
    coll[idx] = pokeEntry;
  } else {
    coll.push(pokeEntry);
  }

  await env.USERS_KV.put(collKey, JSON.stringify(coll));

  // Update stats & simpan user
  const pokeStats = user.pokeStats || { caught: 0, legendary: 0, epic: 0, rare: 0, dupes: 0 };
  pokeStats.caught++;
  if (isDupe) pokeStats.dupes++;
  if (rarity === '🔴 Legendary') pokeStats.legendary++;
  if (rarity === '🟠 Epic') pokeStats.epic++;
  if (rarity === '🟡 Rare') pokeStats.rare++;
  user.pokeStats = pokeStats;
  await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
  waitUntil(pushLinkedRole(env, discordId, null, user));

  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: isDupe
        ? `🔄 **${username}** gacha duplikat **${pokeName}**! (${pokeEntry.count}x)`
        : `🎰 **${username}** gacha dapat **${pokeName}**! ${rarity}`,
      embeds: [{
        color: rarity === '🔴 Legendary' ? 0xFF0000
          : rarity === '🟠 Epic' ? 0xFF6600
          : rarity === '🟡 Rare' ? 0xFFD700 : 0x00FF00,
        title: `🎰 Gacha Result — ${tier.name}`,
        description: [
          '```ansi',
          '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[1;33m║  🎰  GACHA ${tier.label.toUpperCase().padEnd(22)}║\u001b[0m`,
          '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 🎁 HASIL ━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🏷️  Nama    :\u001b[0m \u001b[1;37m${pokeName}\u001b[0m`,
          `\u001b[1;36m  🌀  Tipe    :\u001b[0m \u001b[0;37m${pokeTypes}\u001b[0m`,
          `\u001b[1;36m  ⭐  Rarity  :\u001b[0m \u001b[0;37m${rarity}\u001b[0m`,
          `\u001b[1;36m  ❤️  HP      :\u001b[0m \u001b[0;37m${pokeHp}\u001b[0m`,
          `\u001b[1;36m  ⚔️  ATK     :\u001b[0m \u001b[0;37m${pokeAtk}\u001b[0m`,
          `\u001b[1;36m  🛡️  DEF     :\u001b[0m \u001b[0;37m${pokeDef}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '\u001b[1;31m━━━━━━━━━━━━ 💰 TRANSAKSI ━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  💸  Bayar   :\u001b[0m \u001b[0;37m-${tier.price.toLocaleString('id-ID')} coins\u001b[0m`,
          `\u001b[1;36m  💰  Sisa    :\u001b[0m \u001b[0;37m${user.balance.toLocaleString('id-ID')} coins\u001b[0m`,
          `\u001b[1;36m  🔄  Duplikat:\u001b[0m \u001b[0;37m${isDupe ? 'Ya ('+pokeEntry.count+'x)' : 'Tidak — Baru!'}\u001b[0m`,
          '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        thumbnail: { url: pokeSprite },
        footer: { text: `OwoBim Pokémon System • Gacha` },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}






// ══════════════════════════════════════════════
// CMD: saham — sistem saham virtual
// Provider: Twelve Data API (multi-key fallback)
// Env vars: TWELVE_DATA_KEY_1, TWELVE_DATA_KEY_2, TWELVE_DATA_KEY_3
// ══════════════════════════════════════════════
if (cmd === 'saham') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const sub   = getOption(options, 'aksi');

  // ── Helper: format angka ──
  const fmt    = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const fmtUSD = (n) => `$${fmt(n)}`;

  // ── Helper: edit deferred message ──
  const DISCORD_API = 'https://discord.com/api/v10';
  const appId       = env.DISCORD_APP_ID;
  const iToken      = interaction.token;

  const editFollowup = async (content) => {
    try {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${iToken}/messages/@original`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      });
    } catch (_) { /* silent fail */ }
  };

  // ══════════════════════════════════════════════
  // Multi-Key Fallback — Twelve Data
  // Tambahkan di Cloudflare env:
  //   TWELVE_DATA_KEY_1 = "key_utama"
  //   TWELVE_DATA_KEY_2 = "key_cadangan_1"
  //   TWELVE_DATA_KEY_3 = "key_cadangan_2"
  // ══════════════════════════════════════════════
  const TD_KEYS = [
    env.TWELVE_DATA_KEY_1,
    env.TWELVE_DATA_KEY_2,
    env.TWELVE_DATA_KEY_3,
  ].filter(Boolean);

  // ══════════════════════════════════════════════
  // fetchHarga — multi-key rotation fallback
  // ══════════════════════════════════════════════
  const fetchHarga = async (ticker) => {
    try {
      // 1. Cek cache per-ticker (TTL 15 menit)
      const cacheKey = `saham_cache:${ticker}`;
      const cached   = await env.USERS_KV.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 15 * 60 * 1000) return parsed.data;
      }

      // 2. Loop semua key, skip yang lagi kena rate limit
      for (let i = 0; i < TD_KEYS.length; i++) {
        const key   = TD_KEYS[i];
        const rlKey = `saham_rl:key${i}`;

        const isRL = await env.USERS_KV.get(rlKey);
        if (isRL) continue;

        try {
          const url  = `https://api.twelvedata.com/quote?symbol=${ticker}&apikey=${key}`;
          const res  = await fetch(url);
          const json = await res.json();

          // Kena rate limit → tandai key ini 65 detik, coba key berikutnya
          if (json.status === 'error' && json.code === 429) {
            await env.USERS_KV.put(rlKey, '1', { expirationTtl: 65 });
            continue;
          }

          // Error lain (ticker invalid, dll) → langsung return null
          if (json.status === 'error') return null;

          // Validasi data
          if (!json.close || json.close === 'N/A') return null;

          const changePct = parseFloat(json.percent_change || 0);

          const data = {
            ticker:       json.symbol,
            nama:         json.name || json.symbol,
            exchange:     json.exchange || '',
            harga:        parseFloat(json.close),
            open:         parseFloat(json.open),
            high:         parseFloat(json.high),
            low:          parseFloat(json.low),
            prev:         parseFloat(json.previous_close),
            change:       parseFloat(json.change),
            changePct:    changePct.toFixed(2) + '%',
            changePctRaw: changePct,
            volume:       parseInt(json.volume || 0),
            latest:       json.datetime || '',
            high52:       parseFloat(json.fifty_two_week?.high || 0),
            low52:        parseFloat(json.fifty_two_week?.low  || 0),
          };

          // Simpan cache 15 menit
          await env.USERS_KV.put(
            cacheKey,
            JSON.stringify({ data, ts: Date.now() }),
            { expirationTtl: 900 }
          );

          return data;

        } catch (_) {
          continue; // error jaringan → coba key berikutnya
        }
      }

      // Semua key kena rate limit
      return { rateLimited: true };

    } catch (_) {
      return null;
    }
  };

  // ── Aksi yang butuh defer ──
  const DEFER_ACTIONS = ['cek', 'beli', 'jual', 'portofolio', 'top', 'info'];

  if (DEFER_ACTIONS.includes(sub)) {
    waitUntil((async () => {
      try {

        // ══════════════════════════════════════════
        // AKSI: cek — cek harga saham real-time
        // ══════════════════════════════════════════
        if (sub === 'cek') {
          const ticker = getOption(options, 'ticker')?.toUpperCase();
          if (!ticker) return editFollowup(`${EMOJI} ❌ Masukkan ticker saham! Contoh: \`AAPL\`, \`GOOGL\`, \`TSLA\``);

          const q = await fetchHarga(ticker);
          if (!q)            return editFollowup(`${EMOJI} ❌ Ticker **${ticker}** tidak ditemukan! Cek kode sahamnya.`);
          if (q.rateLimited) return editFollowup(`${EMOJI} ⏳ Semua API key lagi limit! Coba lagi dalam **1 menit**.\n> 💡 Free tier Twelve Data: 800 req/hari & 8 req/menit per key.`);

          const naik   = q.change >= 0;
          const arrow  = naik ? '📈' : '📉';
          const color  = naik ? '\u001b[1;32m' : '\u001b[1;31m';
          const pct    = Math.abs(q.changePctRaw);
          const barLen = Math.min(Math.round(pct * 2), 10);
          const bar    = (naik ? '█' : '▓').repeat(barLen) + '░'.repeat(10 - barLen);

          const range52 = q.high52 - q.low52;
          const pos52   = range52 > 0 ? Math.round(((q.harga - q.low52) / range52) * 10) : 5;
          const bar52   = '─'.repeat(Math.max(0, pos52 - 1)) + '◆' + '─'.repeat(Math.max(0, 10 - pos52));

          return editFollowup([
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            `\u001b[2;34m║  \u001b[1;33m${arrow}  STOCK QUOTE  ${arrow}\u001b[0m             \u001b[2;34m║\u001b[0m`,
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 🏷️ **${q.ticker}** — ${q.nama} (${q.exchange})`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 💰 HARGA INFO ━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 💵  Harga Saat Ini :\u001b[0m ${color}${fmtUSD(q.harga)}\u001b[0m`,
            `\u001b[1;36m 🔓  Open           :\u001b[0m \u001b[0;37m${fmtUSD(q.open)}\u001b[0m`,
            `\u001b[1;36m 🔺  High           :\u001b[0m \u001b[0;37m${fmtUSD(q.high)}\u001b[0m`,
            `\u001b[1;36m 🔻  Low            :\u001b[0m \u001b[0;37m${fmtUSD(q.low)}\u001b[0m`,
            `\u001b[1;36m 🔒  Prev Close     :\u001b[0m \u001b[0;37m${fmtUSD(q.prev)}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 📊 PERUBAHAN ━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m ${arrow}  Perubahan     :\u001b[0m ${color}${naik ? '+' : ''}${fmtUSD(q.change)} (${q.changePct})\u001b[0m`,
            `\u001b[1;36m 📊  Grafik        :\u001b[0m ${color}\`${bar}\`\u001b[0m`,
            `\u001b[1;36m 📦  Volume        :\u001b[0m \u001b[0;37m${q.volume.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m 📅  Tanggal       :\u001b[0m \u001b[0;37m${q.latest}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;35m━━━━━━━━━━━ 📆 52-WEEK RANGE ━━━━━━━━\u001b[0m',
            `\u001b[0;37m ${fmtUSD(q.low52)} \u001b[1;33m[${bar52}]\u001b[0m \u001b[0;37m${fmtUSD(q.high52)}\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Stock Engine × Twelve Data* ${EMOJI}`
          ].join('\n'));
        }

        // ══════════════════════════════════════════
        // AKSI: beli — beli saham pakai cowoncy
        // ══════════════════════════════════════════
        if (sub === 'beli') {
          const ticker = getOption(options, 'ticker')?.toUpperCase();
          const jumlah = parseInt(getOption(options, 'jumlah') || '1');

          if (!ticker)                return editFollowup(`${EMOJI} ❌ Masukkan ticker saham!`);
          if (!jumlah || jumlah <= 0) return editFollowup(`${EMOJI} ❌ Jumlah tidak valid!`);
          if (jumlah > 1000000000) return editFollowup(`${EMOJI} ❌ Maksimal beli **1.000.000.000 lot** sekaligus!`);

          const q = await fetchHarga(ticker);
          if (!q)            return editFollowup(`${EMOJI} ❌ Ticker **${ticker}** tidak ditemukan!`);
          if (q.rateLimited) return editFollowup(`${EMOJI} ⏳ Semua API key lagi limit! Coba lagi dalam **1 menit**.`);

          const RATE         = 16000;
          const hargaPerLot  = q.harga;
          const totalUSD     = hargaPerLot * jumlah;
          const totalCowoncy = Math.ceil(totalUSD * RATE);

          if (user.balance < totalCowoncy) {
            return editFollowup([
              '```ansi',
              '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
              '\u001b[1;31m║  💸  SALDO TIDAK CUKUP!  💸         ║\u001b[0m',
              '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
              '```',
              `> ${EMOJI} ❌ Kamu butuh 🪙 **${totalCowoncy.toLocaleString()}** tapi cuma punya 🪙 **${user.balance.toLocaleString()}**`,
              `> 💡 Kurangi jumlah lot atau cari cowoncy dulu!`
            ].join('\n'));
          }

          const portoKey = `saham:${discordId}`;
          const [portoRaw, histRaw] = await Promise.all([
            env.USERS_KV.get(portoKey),
            env.USERS_KV.get(`saham_history:${discordId}`)
          ]);
          const porto = portoRaw ? JSON.parse(portoRaw) : {};

          if (porto[ticker]) {
            const totalLot = porto[ticker].lot + jumlah;
            const avgBeli  = ((porto[ticker].avgBeli * porto[ticker].lot) + (hargaPerLot * jumlah)) / totalLot;
            porto[ticker]  = { ...porto[ticker], lot: totalLot, avgBeli };
          } else {
            porto[ticker] = { ticker, nama: q.nama, lot: jumlah, avgBeli: hargaPerLot, beliAt: Date.now() };
          }

          user.balance -= totalCowoncy;

          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ aksi: 'BELI', ticker, lot: jumlah, harga: hargaPerLot, totalUSD, totalCowoncy, at: Date.now() });
          if (hist.length > 50) hist.splice(50);

          await Promise.all([
            env.USERS_KV.put(portoKey, JSON.stringify(porto)),
            env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
            env.USERS_KV.put(`saham_history:${discordId}`, JSON.stringify(hist))
          ]);
          waitUntil(pushLinkedRole(env, discordId, null, user));

          return editFollowup([
            '```ansi',
            '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;32m║  ✅  PEMBELIAN BERHASIL!  ✅        ║\u001b[0m',
            '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 📈 Berhasil beli **${jumlah} lot** saham **${ticker}** (${q.nama})!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 📋 DETAIL BELI ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🏷️  Ticker      :\u001b[0m \u001b[1;37m${ticker}\u001b[0m`,
            `\u001b[1;36m 🏢  Perusahaan  :\u001b[0m \u001b[0;37m${q.nama}\u001b[0m`,
            `\u001b[1;36m 📦  Jumlah Lot  :\u001b[0m \u001b[0;37m${jumlah} lot\u001b[0m`,
            `\u001b[1;36m 💵  Harga/Lot   :\u001b[0m \u001b[0;37m${fmtUSD(hargaPerLot)}\u001b[0m`,
            `\u001b[1;36m 💰  Total USD   :\u001b[0m \u001b[0;37m${fmtUSD(totalUSD)}\u001b[0m`,
            `\u001b[1;36m 🪙  Total Bayar :\u001b[0m \u001b[1;31m-${totalCowoncy.toLocaleString()} cowoncy\u001b[0m`,
            `\u001b[1;36m 💳  Sisa Saldo  :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m 📊  Total Porto :\u001b[0m \u001b[0;37m${porto[ticker].lot} lot @ avg ${fmtUSD(porto[ticker].avgBeli)}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 💡 Rate: **$1 = 🪙 ${RATE.toLocaleString()}**`,
            `> 🤖 *Powered by OwoBim Stock Engine × Twelve Data* ${EMOJI}`
          ].join('\n'));
        }

        // ══════════════════════════════════════════
        // AKSI: jual — jual saham
        // ══════════════════════════════════════════
        if (sub === 'jual') {
          const ticker    = getOption(options, 'ticker')?.toUpperCase();
          const jumlahRaw = getOption(options, 'jumlah');

          if (!ticker) return editFollowup(`${EMOJI} ❌ Masukkan ticker saham!`);

          const portoKey = `saham:${discordId}`;
          const [portoRaw, histRaw] = await Promise.all([
            env.USERS_KV.get(portoKey),
            env.USERS_KV.get(`saham_history:${discordId}`)
          ]);
          const porto = portoRaw ? JSON.parse(portoRaw) : {};

          if (!porto[ticker] || porto[ticker].lot <= 0) {
            return editFollowup(`${EMOJI} ❌ Kamu tidak punya saham **${ticker}**!`);
          }

          const jumlah = jumlahRaw === 'all' ? porto[ticker].lot : parseInt(jumlahRaw || '1');
          if (!jumlah || jumlah <= 0)     return editFollowup(`${EMOJI} ❌ Jumlah tidak valid!`);
          if (jumlah > porto[ticker].lot) return editFollowup(`${EMOJI} ❌ Kamu cuma punya **${porto[ticker].lot} lot** saham **${ticker}**!`);

          const q = await fetchHarga(ticker);
          if (!q)            return editFollowup(`${EMOJI} ❌ Gagal ambil harga **${ticker}**! Ticker mungkin tidak valid.`);
          if (q.rateLimited) return editFollowup(`${EMOJI} ⏳ Semua API key lagi limit! Coba lagi dalam **1 menit**.`);

          const RATE          = 16000;
          const hargaJual     = q.harga;
          const avgBeli       = porto[ticker].avgBeli;
          const totalUSD      = hargaJual * jumlah;
          const totalCowoncy  = Math.floor(totalUSD * RATE);
          const modalUSD      = avgBeli * jumlah;
          const profitUSD     = totalUSD - modalUSD;
          const profitCowoncy = Math.floor(profitUSD * RATE);
          const profitPct     = ((profitUSD / modalUSD) * 100).toFixed(2);
          const untung        = profitUSD >= 0;

          porto[ticker].lot -= jumlah;
          if (porto[ticker].lot <= 0) delete porto[ticker];

          user.balance += totalCowoncy;
          if (untung) user.totalEarned = (user.totalEarned || 0) + totalCowoncy;

          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ aksi: 'JUAL', ticker, lot: jumlah, harga: hargaJual, avgBeli, profitUSD, profitCowoncy, totalUSD, totalCowoncy, at: Date.now() });
          if (hist.length > 50) hist.splice(50);

          await Promise.all([
            env.USERS_KV.put(portoKey, JSON.stringify(porto)),
            env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
            env.USERS_KV.put(`saham_history:${discordId}`, JSON.stringify(hist))
          ]);
          waitUntil(pushLinkedRole(env, discordId, null, user));

          const profitColor = untung ? '\u001b[1;32m' : '\u001b[1;31m';
          const profitSign  = untung ? '+' : '';

          return editFollowup([
            '```ansi',
            untung
              ? '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m'
              : '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
            untung
              ? '\u001b[1;32m║  💰  JUAL BERHASIL — PROFIT!  💰   ║\u001b[0m'
              : '\u001b[1;31m║  📉  JUAL BERHASIL — RUGI!  📉    ║\u001b[0m',
            untung
              ? '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m'
              : '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} ${untung ? '🤑' : '😢'} Berhasil jual **${jumlah} lot** saham **${ticker}**!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 📋 DETAIL JUAL ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🏷️  Ticker      :\u001b[0m \u001b[1;37m${ticker}\u001b[0m`,
            `\u001b[1;36m 📦  Jumlah Lot  :\u001b[0m \u001b[0;37m${jumlah} lot\u001b[0m`,
            `\u001b[1;36m 💵  Harga Jual  :\u001b[0m \u001b[0;37m${fmtUSD(hargaJual)}\u001b[0m`,
            `\u001b[1;36m 📊  Avg Beli    :\u001b[0m \u001b[0;37m${fmtUSD(avgBeli)}\u001b[0m`,
            `\u001b[1;36m 💰  Total Dapat :\u001b[0m \u001b[1;32m+${totalCowoncy.toLocaleString()} cowoncy\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 📈 PROFIT/LOSS ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 💸  Profit USD  :\u001b[0m ${profitColor}${profitSign}${fmtUSD(profitUSD)}\u001b[0m`,
            `\u001b[1;36m 🪙  Profit Coin :\u001b[0m ${profitColor}${profitSign}${profitCowoncy.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m 📊  Return      :\u001b[0m ${profitColor}${profitSign}${profitPct}%\u001b[0m`,
            `\u001b[1;36m 💳  Saldo Baru  :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
            '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Stock Engine × Twelve Data* ${EMOJI}`
          ].join('\n'));
        }

        
        

        // ══════════════════════════════════════════
        // AKSI: portofolio — lihat semua saham (FINAL DEBUG FIX)
        // ══════════════════════════════════════════
        if (sub === 'portofolio') {
          const portoKey = `saham:${discordId}`;
          const portoRaw = await env.USERS_KV.get(portoKey);
          const porto    = portoRaw ? JSON.parse(portoRaw) : {};
          const tickers  = Object.keys(porto);

          if (tickers.length === 0) {
            return editFollowup([
              '```ansi',
              '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
              '\u001b[2;34m║  \u001b[1;31m📭  PORTOFOLIO KOSONG  📭\u001b[0m  \u001b[2;34m║\u001b[0m',
              '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
              '```',
              `> ${EMOJI} Kamu belum punya saham!`,
              `> 💡 Gunakan \`/saham beli ticker:AAPL jumlah:1\` untuk mulai.`
            ].join('\n'));
          }

          const RATE     = 16000;
          const hargaMap = {};
          const symbols  = tickers.join(',');

          // --- LOGIKA AMBIL KEY (FORCE DETECTION) ---
          let batchData = null;
          
          // Kita ambil langsung dari env, tambahkan pengecekan tipe data
          const rawKeys = [
            env.TWELVE_DATA_KEY_1, 
            env.TWELVE_DATA_KEY_2, 
            env.TWELVE_DATA_KEY_3
          ];
          
          const TD_KEYS = rawKeys.filter(k => k && typeof k === 'string' && k.length > 5); 

          // Jika array kosong, berarti script tidak bisa baca Secret di dashboard
          if (TD_KEYS.length === 0) {
            return editFollowup([
              `> ❌ **API Key Detection Failed!**`,
              `> Status: Found **${rawKeys.filter(Boolean).length}** keys, but none are valid strings.`,
              `> 💡 **Solusi:** Kamu harus melakukan **Redeploy** di dashboard Cloudflare agar Secret baru sinkron ke script.`
            ].join('\n'));
          }

          // Loop Fetching
          for (const key of TD_KEYS) {
            try {
              const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${key.trim()}`;
              const res = await fetch(url);
              
              if (!res.ok) continue;

              const json = await res.json();
              if (json.status === 'error' || json.code === 429) continue; 
              
              batchData = json;
              break; 
            } catch (e) {
              continue;
            }
          }

          // Mapping hasil batch ke hargaMap
          tickers.forEach(t => {
            const q = tickers.length > 1 ? batchData?.[t] : batchData;
            if (q && q.close && !q.status?.includes('error')) {
              hargaMap[t] = {
                harga: parseFloat(q.close),
                nama: q.name || t
              };
            } else {
              hargaMap[t] = null;
            }
          });

          let totalModalUSD = 0;
          let totalNilaiUSD = 0;
          const rows = [];

          for (const t of tickers) {
            const q = hargaMap[t];
            const modal = porto[t].avgBeli * porto[t].lot;
            
            if (!q) {
              totalModalUSD += modal;
              totalNilaiUSD += modal; 
              rows.push(`\u001b[1;33m ⚠️  ${t.padEnd(6)}\u001b[0m \u001b[0;37m${porto[t].lot} lot — \u001b[1;31mGagal muat harga\u001b[0m`);
              continue;
            }

            const nilai  = q.harga * porto[t].lot;
            const profit = nilai - modal;
            const pct    = ((profit / modal) * 100).toFixed(1);
            const naik   = profit >= 0;
            const clr    = naik ? '\u001b[1;32m' : '\u001b[1;31m';
            const sign   = naik ? '+' : '';

            totalModalUSD += modal;
            totalNilaiUSD += nilai;

            rows.push(
              `\u001b[1;33m 📌 ${t.padEnd(6)}\u001b[0m \u001b[0;37m${porto[t].lot} lot @ ${fmtUSD(porto[t].avgBeli)}\u001b[0m`,
              `\u001b[1;36m    Harga Kini : \u001b[0m\u001b[0;37m${fmtUSD(q.harga)}\u001b[0m  ${clr}${sign}${pct}%\u001b[0m`,
              `\u001b[1;36m    P/L       : \u001b[0m${clr}${sign}${fmtUSD(profit)} (${sign}🪙${Math.floor(profit * RATE).toLocaleString()})\u001b[0m`,
              ''
            );
          }

          const totalProfit    = totalNilaiUSD - totalModalUSD;
          const totalProfitPct = totalModalUSD > 0 ? ((totalProfit / totalModalUSD) * 100).toFixed(2) : '0.00';
          const totalUntung    = totalProfit >= 0;
          const totalClr       = totalUntung ? '\u001b[1;32m' : '\u001b[1;31m';
          const totalSign      = totalUntung ? '+' : '';

          return editFollowup([
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            `\u001b[2;34m║  \u001b[1;33m📊  PORTOFOLIO SAHAM  📊\u001b[0m           \u001b[2;34m║\u001b[0m`,
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 💼 **${username}** — Portofolio`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 📋 DAFTAR SAHAM ━━━━━━━━━━\u001b[0m',
            ...rows,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 💰 RINGKASAN ━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 💵  Total Modal  :\u001b[0m \u001b[0;37m${fmtUSD(totalModalUSD)}\u001b[0m`,
            `\u001b[1;36m 📈  Total Nilai  :\u001b[0m \u001b[0;37m${fmtUSD(totalNilaiUSD)}\u001b[0m`,
            `\u001b[1;36m 💸  Total P/L    :\u001b[0m ${totalClr}${totalSign}${fmtUSD(totalProfit)} (${totalSign}${totalProfitPct}%)\u001b[0m`,
            `\u001b[1;36m 🪙  P/L Cowoncy  :\u001b[0m ${totalClr}${totalSign}${Math.floor(totalProfit * RATE).toLocaleString()}\u001b[0m`,
            '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Stock Engine* ${EMOJI}`
          ].join('\n'));
        }
        
        // ══════════════════════════════════════════
        // AKSI: info — daftar saham tersedia
        // ══════════════════════════════════════════
        if (sub === 'info') {
          return editFollowup([
            `${EMOJI} 📋 **Daftar Saham Tersedia** — OwoBim Stock Engine`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 💻 TEKNOLOGI ━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m AAPL MSFT GOOGL AMZN NVDA TSLA META NFLX AMD INTC\u001b[0m',
            '\u001b[1;36m ORCL CRM ADBE QCOM AVGO CSCO IBM UBER LYFT SNAP\u001b[0m',
            '\u001b[1;36m PINS RDDT SPOT SHOP SQ PYPL TWLO ZOOM DOCU\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 💰 KEUANGAN ━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m JPM BAC GS MS WFC C V MA AXP BRK.B\u001b[0m',
            '\u001b[1;36m COIN MSTR RIOT MARA\u001b[0m',
            '\u001b[1;35m━━━━━━━━━━━ 🛒 CONSUMER & RETAIL ━━━━━\u001b[0m',
            '\u001b[1;36m WMT COST TGT MCD SBUX NKE KO PEP PG DIS ABNB BKNG LULU AMGN\u001b[0m',
            '\u001b[1;31m━━━━━━━━━━━ ⚡ ENERGI & INDUSTRI ━━━━━\u001b[0m',
            '\u001b[1;36m XOM CVX COP NEE BA CAT GE MMM HON LMT\u001b[0m',
            '\u001b[1;34m━━━━━━━━━━━ 🏥 KESEHATAN ━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m JNJ PFE MRNA ABBV UNH CVS LLY BMY\u001b[0m',
            '\u001b[1;33m━━━━━━━━━━━ 🚗 OTOMOTIF ━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m TSLA F GM TM HMC RIVN LCID\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ ✈️ TRAVEL & TRANSPORTASI ━\u001b[0m',
            '\u001b[1;36m DAL UAL AAL LUV MAR HLT CCL\u001b[0m',
            '\u001b[1;35m━━━━━━━━━━━ 🎮 GAMING & HIBURAN ━━━━━\u001b[0m',
            '\u001b[1;36m ATVI EA TTWO RBLX SONO IMAX\u001b[0m',
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 💡 \`/saham cek ticker:AAPL\` — \`/saham beli ticker:TSLA jumlah:5\``,
            `> ⚠️ Ticker di luar list juga bisa dicoba selama ada di bursa US!`,
            `> 🤖 *Powered by OwoBim Stock Engine × Twelve Data* ${EMOJI}`
          ].join('\n'));
        }

      } catch (err) {
        await editFollowup(`${EMOJI} ❌ Terjadi error internal: \`${err.message}\`\nCoba lagi atau hubungi admin!`);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ══════════════════════════════════════════
  // AKSI: history — riwayat transaksi (no defer)
  // ══════════════════════════════════════════
  if (sub === 'history') {
    const histKey = `saham_history:${discordId}`;
    const histRaw = await env.USERS_KV.get(histKey);
    const hist    = histRaw ? JSON.parse(histRaw) : [];

    if (hist.length === 0) {
      return respond(`${EMOJI} 📭 Belum ada riwayat transaksi saham!`);
    }

    const rows = hist.slice(0, 15).map((h, i) => {
      const tgl = new Date(h.at).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      const isBeli  = h.aksi === 'BELI';
      const clr     = isBeli ? '\u001b[1;31m' : '\u001b[1;32m';
      const sign    = isBeli ? '-' : '+';
      const coinStr = `${sign}🪙${h.totalCowoncy.toLocaleString()}`;
      return [
        `\u001b[1;33m ${i+1}. ${h.aksi} ${h.ticker.padEnd(6)}\u001b[0m \u001b[0;37m${h.lot} lot @ ${fmtUSD(h.harga)}\u001b[0m`,
        `\u001b[1;36m    Cowoncy: \u001b[0m${clr}${coinStr}\u001b[0m  \u001b[0;37m${tgl}\u001b[0m`
      ].join('\n');
    });

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m📜  HISTORY TRANSAKSI  📜\u001b[0m          \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `${EMOJI} 📋 **${username}** — 15 Transaksi Terakhir`,
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      rows.join('\n\n'),
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 🤖 *Powered by OwoBim Stock Engine × Twelve Data* ${EMOJI}`
    ].join('\n'));
  }

  return respond(`${EMOJI} ❌ Aksi tidak dikenal! Gunakan: \`cek\`, \`beli\`, \`jual\`, \`portofolio\`, \`history\`, \`top\`, \`info\``);
}







// ══════════════════════════════════════════════
// CMD: crypto — sistem crypto virtual
// Provider: CoinGecko Demo API (key rotation)
// KV Prefix: crypto: | crypto_history: | cache:crypto:
// Struktur: Subcommand (type 1) — bukan flat options
// ══════════════════════════════════════════════
if (cmd === 'crypto') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const RATE  = 16000; // $1 = 16000 cowoncy

  // ── Baca subcommand dari interaction ──
  // Struktur subcommand: interaction.data.options[0] = { name, options[] }
  const subCommand = interaction.data.options?.[0];
  if (!subCommand) {
    return respond(`${EMOJI} ❌ Aksi tidak valid! Gunakan: \`cek\`, \`beli\`, \`jual\`, \`portofolio\`, \`history\`, \`info\``);
  }
  const sub        = subCommand.name;          // nama subcommand
  const subOptions = subCommand.options || []; // options di dalam subcommand

  // ══════════════════════════════════════════════
  // SECURITY LIMITS — anti exploit/bocor
  // ══════════════════════════════════════════════
  const MAX_UNIT_PER_BELI = 1_000_000;
  const MAX_TOTAL_COWONCY = 999_999_999_999;
  const MAX_PORTO_UNIT    = 10_000_000;
  const MAX_PORTO_COINS   = 20;

  // ── Helper: format angka ──
  const fmt = (n, d = 2) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d });

  // ── Helper: format USD — presisi adaptif ──
  const fmtUSD = (val) => {
    if (val == null || isNaN(val)) return '$0.00';
    const abs = Math.abs(val);
    if (abs === 0)      return '$0.00';
    if (abs < 0.000001) return '$' + Number(val).toFixed(10);
    if (abs < 0.0001)   return '$' + Number(val).toFixed(8);
    if (abs < 0.01)     return '$' + Number(val).toFixed(6);
    if (abs < 1)        return '$' + Number(val).toFixed(4);
    if (abs < 10000)    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // ── Helper: sanitize number ──
  const safeNum = (val, fallback = 0) => {
    const n = Number(val);
    if (!isFinite(n) || isNaN(n) || n < 0) return fallback;
    return n;
  };

  // ── Helper: baca option dari subOptions ──
  const getSubOption = (name) => {
    const found = subOptions.find(o => o.name === name);
    return found?.value ?? null;
  };

  // ── Discord API helpers ──
  const DISCORD_API = 'https://discord.com/api/v10';
  const appId       = env.DISCORD_APP_ID;
  const iToken      = interaction.token;

  // Edit original deferred message
  const editFollowup = async (content) => {
    if (typeof content === 'string' && content.length > 1990) {
      content = content.slice(0, 1987) + '...';
    }
    try {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${iToken}/messages/@original`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      });
    } catch (_) {}
  };

  // Kirim followup message baru (bukan edit original)
  const sendFollowup = async (content) => {
    if (typeof content === 'string' && content.length > 1990) {
      content = content.slice(0, 1987) + '...';
    }
    try {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${iToken}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      });
    } catch (_) {}
  };

  // ══════════════════════════════════════════════
  // API KEY ROTATION
  // ══════════════════════════════════════════════
  const API_KEYS = [
    env.CG_KEY_1,
    env.CG_KEY_2,
    env.CG_KEY_3,
    env.CG_KEY_4,
  ].filter(Boolean);

  const fetchWithKeyRotation = async (url) => {
    if (API_KEYS.length === 0) {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      return res.ok ? res : null;
    }
    for (const key of API_KEYS) {
      try {
        const res = await fetch(`${url}&x_cg_demo_api_key=${key}`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });
        if (res.status === 429) continue;
        if (!res.ok) return null;
        return res;
      } catch (_) { continue; }
    }
    return null;
  };

  // ══════════════════════════════════════════════
  // DAFTAR COIN
  // ══════════════════════════════════════════════
  const COIN_LIST = {
    BTC:   { geckoId: 'bitcoin',               nama: 'Bitcoin' },
    ETH:   { geckoId: 'ethereum',              nama: 'Ethereum' },
    BNB:   { geckoId: 'binancecoin',           nama: 'BNB' },
    SOL:   { geckoId: 'solana',                nama: 'Solana' },
    XRP:   { geckoId: 'ripple',                nama: 'XRP' },
    ADA:   { geckoId: 'cardano',               nama: 'Cardano' },
    DOGE:  { geckoId: 'dogecoin',              nama: 'Dogecoin' },
    DOT:   { geckoId: 'polkadot',              nama: 'Polkadot' },
    MATIC: { geckoId: 'matic-network',         nama: 'Polygon' },
    LINK:  { geckoId: 'chainlink',             nama: 'Chainlink' },
    AVAX:  { geckoId: 'avalanche-2',           nama: 'Avalanche' },
    UNI:   { geckoId: 'uniswap',               nama: 'Uniswap' },
    LTC:   { geckoId: 'litecoin',              nama: 'Litecoin' },
    ATOM:  { geckoId: 'cosmos',                nama: 'Cosmos' },
    ETC:   { geckoId: 'ethereum-classic',      nama: 'Ethereum Classic' },
    XLM:   { geckoId: 'stellar',               nama: 'Stellar' },
    BCH:   { geckoId: 'bitcoin-cash',          nama: 'Bitcoin Cash' },
    NEAR:  { geckoId: 'near',                  nama: 'NEAR Protocol' },
    APT:   { geckoId: 'aptos',                 nama: 'Aptos' },
    ARB:   { geckoId: 'arbitrum',              nama: 'Arbitrum' },
    OP:    { geckoId: 'optimism',              nama: 'Optimism' },
    PEPE:  { geckoId: 'pepe',                  nama: 'Pepe' },
    SHIB:  { geckoId: 'shiba-inu',             nama: 'Shiba Inu' },
    FLOKI: { geckoId: 'floki',                 nama: 'Floki' },
    WIF:   { geckoId: 'dogwifcoin',            nama: 'dogwifhat' },
    BONK:  { geckoId: 'bonk',                  nama: 'Bonk' },
    SUI:   { geckoId: 'sui',                   nama: 'Sui' },
    SEI:   { geckoId: 'sei-network',           nama: 'Sei' },
    TRX:   { geckoId: 'tron',                  nama: 'TRON' },
    TON:   { geckoId: 'the-open-network',      nama: 'Toncoin' },
    SAND:  { geckoId: 'the-sandbox',           nama: 'The Sandbox' },
    MANA:  { geckoId: 'decentraland',          nama: 'Decentraland' },
    AXS:   { geckoId: 'axie-infinity',         nama: 'Axie Infinity' },
    GALA:  { geckoId: 'gala',                  nama: 'Gala' },
    ENJ:   { geckoId: 'enjincoin',             nama: 'Enjin Coin' },
    FTM:   { geckoId: 'fantom',                nama: 'Fantom' },
    ALGO:  { geckoId: 'algorand',              nama: 'Algorand' },
    VET:   { geckoId: 'vechain',               nama: 'VeChain' },
    HBAR:  { geckoId: 'hedera-hashgraph',      nama: 'Hedera' },
    ICP:   { geckoId: 'internet-computer',     nama: 'Internet Computer' },
    FIL:   { geckoId: 'filecoin',              nama: 'Filecoin' },
    AAVE:  { geckoId: 'aave',                  nama: 'Aave' },
    MKR:   { geckoId: 'maker',                 nama: 'Maker' },
    SNX:   { geckoId: 'havven',                nama: 'Synthetix' },
    CRV:   { geckoId: 'curve-dao-token',       nama: 'Curve DAO' },
    LDO:   { geckoId: 'lido-dao',              nama: 'Lido DAO' },
    RUNE:  { geckoId: 'thorchain',             nama: 'THORChain' },
    INJ:   { geckoId: 'injective-protocol',    nama: 'Injective' },
    BLUR:  { geckoId: 'blur',                  nama: 'Blur' },
    JTO:   { geckoId: 'jito-governance-token', nama: 'Jito' },
  };

  const GECKO_TO_SYMBOL = Object.fromEntries(
    Object.entries(COIN_LIST).map(([sym, v]) => [v.geckoId, sym])
  );

  // ══════════════════════════════════════════════
  // fetchCrypto — single coin
  // ══════════════════════════════════════════════
  const fetchCrypto = async (symbol) => {
    symbol = symbol.toUpperCase();
    const coinInfo = COIN_LIST[symbol];
    if (!coinInfo) return { notFound: true };

    try {
      const cacheKey = `crypto_cache:${symbol}`;
      const cached   = await env.USERS_KV.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 2 * 60 * 1000) return parsed.data;
      }

      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinInfo.geckoId}&price_change_percentage=24h`;
      const res = await fetchWithKeyRotation(url);
      if (!res) return null;

      const json = await res.json();
      if (!json || !json[0]) return null;

      const d         = json[0];
      const harga     = safeNum(d.current_price);
      const changePct = d.price_change_percentage_24h || 0;
      const change    = d.price_change_24h            || 0;

      const data = {
        symbol,
        nama:         coinInfo.nama,
        harga,
        open:         harga - change,
        high:         safeNum(d.high_24h, harga),
        low:          safeNum(d.low_24h,  harga),
        prev:         harga - change,
        change,
        changePct:    changePct.toFixed(2) + '%',
        changePctRaw: changePct,
        volumeUSD:    safeNum(d.total_volume),
        marketCap:    safeNum(d.market_cap),
        rank:         safeNum(d.market_cap_rank),
        ath:          safeNum(d.ath),
        atl:          safeNum(d.atl),
      };

      await env.USERS_KV.put(cacheKey, JSON.stringify({ data, ts: Date.now() }), { expirationTtl: 120 });
      return data;
    } catch (_) { return null; }
  };

  // ══════════════════════════════════════════════
  // fetchCryptoBatch — bulk fetch
  // ══════════════════════════════════════════════
  const fetchCryptoBatch = async (symbols) => {
    const result   = {};
    const uncached = [];

    await Promise.all(symbols.map(async (sym) => {
      try {
        const cached = await env.USERS_KV.get(`crypto_cache:${sym}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.ts < 2 * 60 * 1000) { result[sym] = parsed.data; return; }
        }
      } catch (_) {}
      uncached.push(sym);
    }));

    if (uncached.length === 0) return result;

    try {
      const geckoIds = uncached.map(s => COIN_LIST[s]?.geckoId).filter(Boolean).join(',');
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${geckoIds}&price_change_percentage=24h`;
      const res = await fetchWithKeyRotation(url);

      if (res) {
        const json = await res.json();
        if (Array.isArray(json)) {
          for (const d of json) {
            const sym = GECKO_TO_SYMBOL[d.id];
            if (!sym) continue;

            const harga     = safeNum(d.current_price);
            const changePct = d.price_change_percentage_24h || 0;
            const change    = d.price_change_24h            || 0;

            const data = {
              symbol: sym,
              nama:         COIN_LIST[sym].nama,
              harga,
              open:         harga - change,
              high:         safeNum(d.high_24h, harga),
              low:          safeNum(d.low_24h,  harga),
              prev:         harga - change,
              change,
              changePct:    changePct.toFixed(2) + '%',
              changePctRaw: changePct,
              volumeUSD:    safeNum(d.total_volume),
              marketCap:    safeNum(d.market_cap),
              rank:         safeNum(d.market_cap_rank),
              ath:          safeNum(d.ath),
              atl:          safeNum(d.atl),
            };

            result[sym] = data;
            await env.USERS_KV.put(
              `crypto_cache:${sym}`,
              JSON.stringify({ data, ts: Date.now() }),
              { expirationTtl: 120 }
            ).catch(() => {});
          }
        }
      }
    } catch (_) {}

    uncached.forEach(s => { if (!(s in result)) result[s] = null; });
    return result;
  };

  // ══════════════════════════════════════════════
  // Semua aksi pakai defer (type: 5)
  // ══════════════════════════════════════════════
  const DEFER_ACTIONS = ['cek', 'beli', 'jual', 'portofolio', 'history', 'info'];

  if (DEFER_ACTIONS.includes(sub)) {
    waitUntil((async () => {
      try {

        // ════════════════════════════════════════
        // AKSI: cek
        // ════════════════════════════════════════
        if (sub === 'cek') {
          const symbol = getSubOption('coin')?.toUpperCase();
          if (!symbol) return editFollowup(`${EMOJI} ❌ Masukkan kode coin! Contoh: \`BTC\`, \`ETH\`, \`SOL\``);

          const q = await fetchCrypto(symbol);
          if (!q)         return editFollowup(`${EMOJI} ❌ Gagal ambil data! Coba lagi.`);
          if (q.notFound) return editFollowup(`${EMOJI} ❌ Coin **${symbol}** tidak ditemukan! Ketik \`/crypto info\` untuk daftar coin.`);

          const naik   = q.change >= 0;
          const arrow  = naik ? '📈' : '📉';
          const color  = naik ? '\u001b[1;32m' : '\u001b[1;31m';
          const pct    = Math.abs(q.changePctRaw);
          const barLen = Math.min(Math.round(pct * 2), 10);
          const bar    = (naik ? '█' : '▓').repeat(barLen) + '░'.repeat(10 - barLen);

          const range = q.high - q.low;
          const pos   = range > 0 ? Math.round(((q.harga - q.low) / range) * 10) : 5;
          const bar24 = '─'.repeat(Math.max(0, pos - 1)) + '◆' + '─'.repeat(Math.max(0, 10 - pos));

          return editFollowup([
            '```ansi',
            '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
            `\u001b[2;35m║  \u001b[1;33m${arrow}  CRYPTO QUOTE  ${arrow}\u001b[0m             \u001b[2;35m║\u001b[0m`,
            '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 🪙 **${q.symbol}** — ${q.nama}${q.rank ? ` (Rank #${q.rank})` : ''}`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 💰 HARGA INFO ━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 💵  Harga Saat Ini :\u001b[0m ${color}${fmtUSD(q.harga)}\u001b[0m`,
            `\u001b[1;36m 🔓  Open (24h)     :\u001b[0m \u001b[0;37m${fmtUSD(q.open)}\u001b[0m`,
            `\u001b[1;36m 🔺  High (24h)     :\u001b[0m \u001b[0;37m${fmtUSD(q.high)}\u001b[0m`,
            `\u001b[1;36m 🔻  Low  (24h)     :\u001b[0m \u001b[0;37m${fmtUSD(q.low)}\u001b[0m`,
            `\u001b[1;36m 🏆  ATH            :\u001b[0m \u001b[0;37m${fmtUSD(q.ath)}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 📊 PERUBAHAN 24H ━━━━━━━━\u001b[0m',
            `\u001b[1;36m ${arrow}  Perubahan     :\u001b[0m ${color}${naik ? '+' : ''}${fmtUSD(q.change)} (${q.changePct})\u001b[0m`,
            `\u001b[1;36m 📊  Grafik        :\u001b[0m ${color}\`${bar}\`\u001b[0m`,
            `\u001b[1;36m 💲  Volume 24h    :\u001b[0m \u001b[0;37m$${fmt(q.volumeUSD, 0)}\u001b[0m`,
            `\u001b[1;36m 🏦  Market Cap    :\u001b[0m \u001b[0;37m$${fmt(q.marketCap, 0)}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;35m━━━━━━━━━━━ 📆 24H RANGE ━━━━━━━━━━━━\u001b[0m',
            `\u001b[0;37m ${fmtUSD(q.low)} \u001b[1;33m[${bar24}]\u001b[0m \u001b[0;37m${fmtUSD(q.high)}\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Crypto Engine × CoinGecko* ${EMOJI}`
          ].join('\n'));
        }

        // ════════════════════════════════════════
        // AKSI: beli
        // ════════════════════════════════════════
        if (sub === 'beli') {
          const symbol    = getSubOption('coin')?.toUpperCase();
          const jumlahStr = getSubOption('jumlah') || '1';

          if (!symbol) return editFollowup(`${EMOJI} ❌ Masukkan kode coin!`);

          // jumlah harus angka positif (tidak support 'all' saat beli)
          const jumlah = safeNum(parseFloat(jumlahStr), 0);
          if (!jumlah || jumlah <= 0 || !isFinite(jumlah)) {
            return editFollowup(`${EMOJI} ❌ Jumlah tidak valid! Masukkan angka positif. Contoh: \`0.5\`, \`10\``);
          }
          if (jumlah > MAX_UNIT_PER_BELI) {
            return editFollowup(`${EMOJI} ❌ Maksimum pembelian **${MAX_UNIT_PER_BELI.toLocaleString()} unit** per transaksi!`);
          }

          const q = await fetchCrypto(symbol);
          if (!q)         return editFollowup(`${EMOJI} ❌ Gagal ambil data! Coba lagi.`);
          if (q.notFound) return editFollowup(`${EMOJI} ❌ Coin **${symbol}** tidak ditemukan! Ketik \`/crypto info\` untuk daftar coin.`);
          if (!q.harga || q.harga <= 0) return editFollowup(`${EMOJI} ❌ Harga coin tidak valid! Coba lagi.`);

          const hargaPerUnit = q.harga;
          const totalUSD     = hargaPerUnit * jumlah;
          const totalCowoncy = Math.ceil(totalUSD * RATE);

          if (totalCowoncy < 1) {
            return editFollowup(`${EMOJI} ❌ Total terlalu kecil! Tambah jumlah unitnya.`);
          }
          if (totalCowoncy > MAX_TOTAL_COWONCY) {
            return editFollowup(`${EMOJI} ❌ Total transaksi terlalu besar! Maksimum **${MAX_TOTAL_COWONCY.toLocaleString()} cowoncy** per beli.`);
          }

          if (user.balance < totalCowoncy) {
            return editFollowup([
              '```ansi',
              '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
              '\u001b[1;31m║  💸  SALDO TIDAK CUKUP!  💸         ║\u001b[0m',
              '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
              '```',
              `> ${EMOJI} ❌ Kamu butuh 🪙 **${totalCowoncy.toLocaleString()}** tapi cuma punya 🪙 **${user.balance.toLocaleString()}**`,
              `> 💡 Kurangi jumlah unit atau cari cowoncy dulu!`
            ].join('\n'));
          }

          const portoKey = `crypto:${discordId}`;
          const [portoRaw, histRaw] = await Promise.all([
            env.USERS_KV.get(portoKey),
            env.USERS_KV.get(`crypto_history:${discordId}`)
          ]);
          const porto = portoRaw ? JSON.parse(portoRaw) : {};

          if (!porto[symbol] && Object.keys(porto).length >= MAX_PORTO_COINS) {
            return editFollowup(`${EMOJI} ❌ Portofolio penuh! Maksimum **${MAX_PORTO_COINS} jenis coin**. Jual dulu salah satunya.`);
          }

          const unitBaru = porto[symbol] ? porto[symbol].unit + jumlah : jumlah;
          if (unitBaru > MAX_PORTO_UNIT) {
            return editFollowup(`${EMOJI} ❌ Maksimum hold **${MAX_PORTO_UNIT.toLocaleString()} unit** per coin!`);
          }

          if (porto[symbol]) {
            const totalUnit = porto[symbol].unit + jumlah;
            const avgBeli   = ((porto[symbol].avgBeli * porto[symbol].unit) + (hargaPerUnit * jumlah)) / totalUnit;
            porto[symbol]   = { ...porto[symbol], unit: totalUnit, avgBeli };
          } else {
            porto[symbol] = { symbol, nama: q.nama, unit: jumlah, avgBeli: hargaPerUnit, beliAt: Date.now() };
          }

          user.balance -= totalCowoncy;

          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ aksi: 'BELI', symbol, unit: jumlah, harga: hargaPerUnit, totalUSD, totalCowoncy, at: Date.now() });
          if (hist.length > 50) hist.length = 50;

          await Promise.all([
            env.USERS_KV.put(portoKey, JSON.stringify(porto)),
            env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
            env.USERS_KV.put(`crypto_history:${discordId}`, JSON.stringify(hist))
          ]);
          waitUntil(pushLinkedRole(env, discordId, null, user));

          return editFollowup([
            '```ansi',
            '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;32m║  ✅  PEMBELIAN BERHASIL!  ✅        ║\u001b[0m',
            '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 🚀 Berhasil beli **${fmt(jumlah, 8)} ${symbol}** (${q.nama})!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 📋 DETAIL BELI ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🪙  Coin        :\u001b[0m \u001b[1;37m${symbol} (${q.nama})\u001b[0m`,
            `\u001b[1;36m 📦  Jumlah      :\u001b[0m \u001b[0;37m${fmt(jumlah, 8)} unit\u001b[0m`,
            `\u001b[1;36m 💵  Harga/Unit  :\u001b[0m \u001b[0;37m${fmtUSD(hargaPerUnit)}\u001b[0m`,
            `\u001b[1;36m 💰  Total USD   :\u001b[0m \u001b[0;37m${fmtUSD(totalUSD)}\u001b[0m`,
            `\u001b[1;36m 🪙  Total Bayar :\u001b[0m \u001b[1;31m-${totalCowoncy.toLocaleString()} cowoncy\u001b[0m`,
            `\u001b[1;36m 💳  Sisa Saldo  :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m 📊  Total Hold  :\u001b[0m \u001b[0;37m${fmt(porto[symbol].unit, 8)} unit @ avg ${fmtUSD(porto[symbol].avgBeli)}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 💡 Rate: **$1 = 🪙 ${RATE.toLocaleString()}**`,
            `> 🤖 *Powered by OwoBim Crypto Engine × CoinGecko* ${EMOJI}`
          ].join('\n'));
        }

        // ════════════════════════════════════════
        // AKSI: jual
        // ════════════════════════════════════════
        if (sub === 'jual') {
          const symbol    = getSubOption('coin')?.toUpperCase();
          const jumlahRaw = getSubOption('jumlah'); // null = tidak diisi = jual semua

          if (!symbol) return editFollowup(`${EMOJI} ❌ Masukkan kode coin!`);

          const portoKey = `crypto:${discordId}`;
          const [portoRaw, histRaw] = await Promise.all([
            env.USERS_KV.get(portoKey),
            env.USERS_KV.get(`crypto_history:${discordId}`)
          ]);
          const porto = portoRaw ? JSON.parse(portoRaw) : {};

          if (!porto[symbol] || porto[symbol].unit <= 0) {
            return editFollowup(`${EMOJI} ❌ Kamu tidak punya **${symbol}**!`);
          }

          const unitTersimpan = safeNum(porto[symbol].unit, 0);
          if (unitTersimpan <= 0) {
            delete porto[symbol];
            await env.USERS_KV.put(portoKey, JSON.stringify(porto));
            return editFollowup(`${EMOJI} ❌ Data porto **${symbol}** tidak valid, sudah direset.`);
          }

          // null / kosong / 'all' → jual semua
          let jumlah;
          if (!jumlahRaw || jumlahRaw.trim() === '' || jumlahRaw.trim().toLowerCase() === 'all') {
            jumlah = unitTersimpan;
          } else {
            jumlah = safeNum(parseFloat(jumlahRaw), 0);
          }

          if (!jumlah || jumlah <= 0) return editFollowup(`${EMOJI} ❌ Jumlah tidak valid!`);
          if (jumlah > unitTersimpan)  return editFollowup(`${EMOJI} ❌ Kamu cuma punya **${fmt(unitTersimpan, 8)} ${symbol}**!`);

          const q = await fetchCrypto(symbol);
          if (!q)         return editFollowup(`${EMOJI} ❌ Gagal ambil harga! Coba lagi.`);
          if (q.notFound) return editFollowup(`${EMOJI} ❌ Coin **${symbol}** tidak ditemukan!`);
          if (!q.harga || q.harga <= 0) return editFollowup(`${EMOJI} ❌ Harga coin tidak valid! Coba lagi.`);

          const hargaJual     = q.harga;
          const avgBeli       = safeNum(porto[symbol].avgBeli, 0);
          const namaKoin      = porto[symbol]?.nama || q.nama;
          const totalUSD      = hargaJual * jumlah;
          const totalCowoncy  = Math.floor(totalUSD * RATE);
          const modalUSD      = avgBeli * jumlah;
          const profitUSD     = totalUSD - modalUSD;
          const profitAbs     = Math.abs(profitUSD);
          const profitCowoncy = Math.floor(profitAbs * RATE);
          const profitPct     = modalUSD > 0 ? (profitUSD / modalUSD) * 100 : 0;
          const untung        = profitUSD >= 0;

          porto[symbol].unit = unitTersimpan - jumlah;
          if (porto[symbol].unit <= 0.000000001) delete porto[symbol];

          user.balance += totalCowoncy;
          if (untung) user.totalEarned = (user.totalEarned || 0) + totalCowoncy;

          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ aksi: 'JUAL', symbol, unit: jumlah, harga: hargaJual, avgBeli, profitUSD, profitCowoncy, totalUSD, totalCowoncy, at: Date.now() });
          if (hist.length > 50) hist.length = 50;

          await Promise.all([
            env.USERS_KV.put(portoKey, JSON.stringify(porto)),
            env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
            env.USERS_KV.put(`crypto_history:${discordId}`, JSON.stringify(hist))
          ]);
          waitUntil(pushLinkedRole(env, discordId, null, user));

          const profitColor = untung ? '\u001b[1;32m' : '\u001b[1;31m';
          const profitSign  = untung ? '+' : '-';

          return editFollowup([
            '```ansi',
            untung
              ? '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m'
              : '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
            untung
              ? '\u001b[1;32m║  💰  JUAL BERHASIL — PROFIT!  💰   ║\u001b[0m'
              : '\u001b[1;31m║  📉  JUAL BERHASIL — RUGI!  📉    ║\u001b[0m',
            untung
              ? '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m'
              : '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} ${untung ? '🤑' : '😢'} Berhasil jual **${fmt(jumlah, 8)} ${symbol}** (${namaKoin})!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 📋 DETAIL JUAL ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 🪙  Coin        :\u001b[0m \u001b[1;37m${symbol} (${namaKoin})\u001b[0m`,
            `\u001b[1;36m 📦  Jumlah      :\u001b[0m \u001b[0;37m${fmt(jumlah, 8)} unit\u001b[0m`,
            `\u001b[1;36m 💵  Harga Jual  :\u001b[0m \u001b[0;37m${fmtUSD(hargaJual)}\u001b[0m`,
            `\u001b[1;36m 📊  Avg Beli    :\u001b[0m \u001b[0;37m${fmtUSD(avgBeli)}\u001b[0m`,
            `\u001b[1;36m 💰  Total Dapat :\u001b[0m \u001b[1;32m+${totalCowoncy.toLocaleString()} cowoncy\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ 📈 PROFIT/LOSS ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m 💸  Profit USD  :\u001b[0m ${profitColor}${profitSign}${fmtUSD(profitAbs)}\u001b[0m`,
            `\u001b[1;36m 🪙  Profit Coin :\u001b[0m ${profitColor}${profitSign}${profitCowoncy.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m 📊  Return      :\u001b[0m ${profitColor}${profitSign}${Math.abs(profitPct).toFixed(2)}%\u001b[0m`,
            `\u001b[1;36m 💳  Saldo Baru  :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
            '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Crypto Engine × CoinGecko* ${EMOJI}`
          ].join('\n'));
        }




        

// ══════════════════════════════════════════════════════════════════════
// AKSI: portofolio (ULTRA CLEAN - FIX ANSI RENDER)
// ══════════════════════════════════════════════════════════════════════
if (sub === 'portofolio') {
  const portoKey = `crypto:${discordId}`;
  const portoRaw = await env.USERS_KV.get(portoKey);
  const porto    = portoRaw ? JSON.parse(portoRaw) : {};
  const symbols  = Object.keys(porto);

  if (symbols.length === 0) {
    return editFollowup(`${EMOJI} Portofolio crypto kamu kosong!\n> Gunakan \`/crypto beli\` untuk mulai investasi.`);
  }

  const hargaMap = await fetchCryptoBatch(symbols);
  const ESC = "\u001b"; // Definisi karakter escape untuk render warna

  let totalModalUSD = 0;
  let totalNilaiUSD = 0;
  const coinBlocks  = [];

  for (const s of symbols) {
    const q       = hargaMap[s];
    const unit    = (Number(porto[s].unit) || 0);
    const avgBeli = (Number(porto[s].avgBeli) || 0);
    const modal   = avgBeli * unit;
    totalModalUSD += modal;

    if (!q) {
      totalNilaiUSD += modal;
      coinBlocks.push(`${ESC}[1;33m${s.padEnd(6)}${ESC}[0m ${ESC}[0;37m${unit.toLocaleString('en-US')} unit${ESC}[0m ${ESC}[2;37m(Data Error)${ESC}[0m`);
      continue;
    }

    const nilai     = q.harga * unit;
    const profit    = nilai - modal;
    const profitAbs = Math.abs(profit);
    const isNetral  = profitAbs < 0.01;
    const naik      = !isNetral && profit > 0;

    const pct  = isNetral ? '0.00' : Math.abs((profit / (modal || 1)) * 100).toFixed(2);
    const clr  = isNetral ? `${ESC}[0;37m` : naik ? `${ESC}[1;32m` : `${ESC}[1;31m`;
    const sign = isNetral ? ' ' : naik ? '+' : '-';
    const icon = isNetral ? '●' : naik ? '▲' : '▼';

    totalNilaiUSD += nilai;

    // Menampilkan detail per koin dengan format yang lebih tahan error parser
    coinBlocks.push(
      `${ESC}[1;33m${s.padEnd(6)}${ESC}[0m ${ESC}[0;37m${unit.toLocaleString('en-US')} unit${ESC}[0m\n` +
      `${ESC}[1;36mHarga :${ESC}[0m ${ESC}[0;37m${fmtUSD(q.harga).padEnd(10)}${ESC}[0m ${clr}${icon} ${sign}${pct}%${ESC}[0m\n` +
      `${ESC}[1;36mP/L   :${ESC}[0m ${clr}${sign}${fmtUSD(profitAbs)}${ESC}[0m`
    );
  }

  // ── 1. HEADER (Pesan Pertama) ──
  const header = "```ansi\n" +
    `${ESC}[1;34m╔══════════════════════════════════════╗${ESC}[0m\n` +
    `${ESC}[1;34m║${ESC}[1;33m      📊  PORTOFOLIO CRYPTO           ${ESC}[1;34m║${ESC}[0m\n` +
    `${ESC}[1;34m║${ESC}[0;37m  👤 ${username.slice(0, 28).padEnd(30)}${ESC}[1;34m║${ESC}[0m\n` +
    `${ESC}[1;34m╚══════════════════════════════════════╝${ESC}[0m\n` +
    `${ESC}[1;33m      📋 DAFTAR ASET${ESC}[0m\n` + "```";

  // ── 2. DAFTAR COIN (Pesan Bertahap jika koin banyak) ──
  const chunks = [];
  let currentStr = "";
  for (const block of coinBlocks) {
    if ((currentStr + block).length > 1200) { 
      chunks.push("```ansi\n" + currentStr.trim() + "\n```");
      currentStr = "";
    }
    currentStr += block + "\n\n";
  }
  if (currentStr.trim()) chunks.push("```ansi\n" + currentStr.trim() + "\n```");

  // ── 3. RINGKASAN (Pesan Terakhir) ──
  const totalProfit    = totalNilaiUSD - totalModalUSD;
  const totalProfitAbs = Math.abs(totalProfit);
  const totalUntung    = totalProfit > 0;
  const totalClr       = totalProfitAbs < 0.01 ? `${ESC}[0;37m` : totalUntung ? `${ESC}[1;32m` : `${ESC}[1;31m`;
  const totalSign      = totalProfitAbs < 0.01 ? '' : totalUntung ? '+' : '-';

  const summary = "```ansi\n" +
    `${ESC}[1;34m══════════════════════════════════════${ESC}[0m\n` +
    `${ESC}[1;33m      📊 RINGKASAN AKUMULASI${ESC}[0m\n` +
    `${ESC}[1;34m══════════════════════════════════════${ESC}[0m\n` +
    `${ESC}[1;36mModal Total :${ESC}[0m ${ESC}[0;37m${fmtUSD(totalModalUSD)}${ESC}[0m\n` +
    `${ESC}[1;36mNilai Kini  :${ESC}[0m ${ESC}[0;37m${fmtUSD(totalNilaiUSD)}${ESC}[0m\n` +
    `${ESC}[1;36mTotal P/L   :${ESC}[0m ${totalClr}${totalSign}${fmtUSD(totalProfitAbs)} (${totalSign}${((totalProfit/(totalModalUSD||1))*100).toFixed(2)}%)${ESC}[0m\n` +
    `${ESC}[1;36mEstimasi    :${ESC}[0m ${totalClr}${totalSign}${Math.floor(totalProfitAbs * RATE).toLocaleString('en-US')} cowoncy${ESC}[0m\n` +
    `${ESC}[1;36mSaldo Kamu  :${ESC}[0m ${ESC}[0;37m${(user.balance || 0).toLocaleString('en-US')} cowoncy${ESC}[0m\n` +
    `${ESC}[1;34m══════════════════════════════════════${ESC}[0m\n` + "```";

  // ── EKSEKUSI PENGIRIMAN ──
  // Menggunakan editFollowup untuk pesan awal, dan sendFollowup untuk sisanya
  await editFollowup(header);
  for (const chunk of chunks) { 
    await sendFollowup(chunk); 
  }
  await sendFollowup(summary);

  return;
}


  


  

        // ════════════════════════════════════════
        // AKSI: history
        // ════════════════════════════════════════
        if (sub === 'history') {
          const histKey = `crypto_history:${discordId}`;
          const histRaw = await env.USERS_KV.get(histKey);
          const hist    = histRaw ? JSON.parse(histRaw) : [];

          if (hist.length === 0) {
            return editFollowup(`${EMOJI} 📭 Belum ada riwayat transaksi crypto!`);
          }

          const rows = hist.slice(0, 15).map((h, i) => {
            const tgl = new Date(h.at).toLocaleDateString('id-ID', {
              day: '2-digit', month: 'short', year: '2-digit',
              hour: '2-digit', minute: '2-digit'
            });
            const isBeli  = h.aksi === 'BELI';
            const clr     = isBeli ? '\u001b[1;31m' : '\u001b[1;32m';
            const sign    = isBeli ? '-' : '+';
            const coinStr = `${sign}🪙${h.totalCowoncy.toLocaleString()}`;
            return [
              `\u001b[1;33m ${i + 1}. ${h.aksi} ${h.symbol.padEnd(6)}\u001b[0m \u001b[0;37m${fmt(h.unit, 8)} unit @ ${fmtUSD(h.harga)}\u001b[0m`,
              `\u001b[1;36m    Cowoncy: \u001b[0m${clr}${coinStr}\u001b[0m  \u001b[0;37m${tgl}\u001b[0m`
            ].join('\n');
          });

          return editFollowup([
            '```ansi',
            '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
            `\u001b[2;35m║  \u001b[1;33m📜  HISTORY CRYPTO  📜\u001b[0m             \u001b[2;35m║\u001b[0m`,
            '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `${EMOJI} 📋 **${username}** — 15 Transaksi Crypto Terakhir`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            rows.join('\n\n'),
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🤖 *Powered by OwoBim Crypto Engine × CoinGecko* ${EMOJI}`
          ].join('\n'));
        }

        // ════════════════════════════════════════
        // AKSI: info
        // ════════════════════════════════════════
        if (sub === 'info') {
          return editFollowup([
            `${EMOJI} 📋 **Daftar Coin Tersedia** — OwoBim Crypto Engine`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━ 🏆 BLUE CHIP ━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m BTC  ETH  BNB  SOL  XRP  ADA  DOT\u001b[0m',
            '\u001b[1;36m LTC  BCH  ATOM ETC  XLM  HBAR ICP\u001b[0m',
            '\u001b[1;32m━━━━━━━━━━━ ⚡ LAYER 2 & DeFi ━━━━━━━\u001b[0m',
            '\u001b[1;36m MATIC AVAX LINK UNI  AAVE MKR  SNX\u001b[0m',
            '\u001b[1;36m CRV  LDO  RUNE INJ  NEAR ARB  OP\u001b[0m',
            '\u001b[1;35m━━━━━━━━━━━ 🐕 MEME COINS ━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m DOGE SHIB PEPE FLOKI WIF  BONK\u001b[0m',
            '\u001b[1;31m━━━━━━━━━━━ 🎮 WEB3 & GAMING ━━━━━━━\u001b[0m',
            '\u001b[1;36m SAND MANA AXS  GALA ENJ  FTM\u001b[0m',
            '\u001b[1;34m━━━━━━━━━━━ 🔗 LAINNYA ━━━━━━━━━━━━━\u001b[0m',
            '\u001b[1;36m TRX  TON  ALGO VET  FIL  SUI  SEI\u001b[0m',
            '\u001b[1;36m APT  BLUR JTO\u001b[0m',
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 💡 \`/crypto cek coin:BTC\` — \`/crypto beli coin:ETH jumlah:0.5\``,
            `> ⚡ Data real-time dari CoinGecko, update tiap 2 menit!`,
            `> 🤖 *Powered by OwoBim Crypto Engine × CoinGecko* ${EMOJI}`
          ].join('\n'));
        }

      } catch (err) {
        await editFollowup(`${EMOJI} ❌ Terjadi error internal: \`${err.message}\`\nCoba lagi atau hubungi admin!`);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fallback — seharusnya tidak pernah tercapai karena semua aksi ada di DEFER_ACTIONS
  return respond(`${EMOJI} ❌ Aksi tidak dikenal! Gunakan: \`cek\`, \`beli\`, \`jual\`, \`portofolio\`, \`history\`, \`info\``);
}







    // ══════════════════════════════════════════════
// CMD: search — Web Search via SerpAPI
// Env: SERPAPI_KEY
// Gratis: 100 searches/bulan
// ══════════════════════════════════════════════
if (cmd === 'search') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const query  = getOption(options, 'query');
  const tipe   = getOption(options, 'tipe') || 'web'; // web / image / news

  if (!query || query.trim() === '') {
    return respond(`> ${EMOJI} ❌ Masukkan kata kunci pencarian!`);
  }

  if (query.length > 200) {
    return respond(`> ${EMOJI} ❌ Query terlalu panjang! Maksimal **200 karakter**.`);
  }

  // ── Cooldown 10 detik per user ──
  const cdKey      = `search_cd:${discordId}`;
  const lastSearch = await env.USERS_KV.get(cdKey);
  if (lastSearch) {
    const sisa = 10000 - (Date.now() - parseInt(lastSearch));
    if (sisa > 0) {
      return respond(`> ${EMOJI} ⏳ Cooldown! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.`);
    }
  }
  await env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 60 });

  // ── Defer dulu biar tidak timeout ──
  waitUntil((async () => {
    try {
      const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      // ── Build URL SerpAPI berdasarkan tipe ──
      let searchUrl = `https://serpapi.com/search.json?api_key=${env.SERPAPI_KEY}&q=${encodeURIComponent(query)}&hl=id&gl=id&num=5`;

      if (tipe === 'image') searchUrl += '&tbm=isch';
      if (tipe === 'news')  searchUrl += '&tbm=nws';

      const res  = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await res.json();

      // ── Handle error dari SerpAPI ──
      if (data.error) {
        let errText = `❌ Search Error: \`${data.error}\``;
        if (data.error.includes('Invalid API key')) errText = '❌ SERPAPI_KEY tidak valid! Cek Cloudflare env.';
        if (data.error.includes('limit'))           errText = '❌ Limit search habis! (100/bulan)\nCoba lagi bulan depan atau hubungi owner.';

        await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `> ${EMOJI} ${errText}` })
        });
        return;
      }

      // ── Ambil hasil sesuai tipe ──
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      let items = [];
      let hasilText = '';

      if (tipe === 'image') {
        items = data.images_results || [];
        if (items.length === 0) {
          await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `> ${EMOJI} ❌ Tidak ada hasil gambar untuk **"${query}"**` })
          });
          return;
        }
        hasilText = items.slice(0, 5).map((item, i) => {
          const title  = item.title?.slice(0, 60) || 'Tanpa Judul';
          const link   = item.original || item.link || '#';
          const source = item.source || 'Unknown';
          return [
            `${medals[i]} **${title}**`,
            `> 🔗 [Lihat Gambar](${link})`,
            `> 🌐 Sumber: \`${source}\``
          ].join('\n');
        }).join('\n\n');

      } else if (tipe === 'news') {
        items = data.news_results || [];
        if (items.length === 0) {
          await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `> ${EMOJI} ❌ Tidak ada berita untuk **"${query}"**` })
          });
          return;
        }
        hasilText = items.slice(0, 5).map((item, i) => {
          const title   = item.title?.slice(0, 80) || 'Tanpa Judul';
          const snippet = item.snippet?.slice(0, 120) || 'Tidak ada deskripsi.';
          const link    = item.link || '#';
          const source  = item.source?.name || item.source || 'Unknown';
          const tanggal = item.date || null;
          return [
            `${medals[i]} **${title}**`,
            `> 📝 ${snippet}`,
            `> 🔗 [Buka Link](${link}) • 🌐 \`${source}\``,
            tanggal ? `> 📅 ${tanggal}` : null
          ].filter(Boolean).join('\n');
        }).join('\n\n');

      } else {
        // Web (default)
        items = data.organic_results || [];
        if (items.length === 0) {
          await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `> ${EMOJI} ❌ Tidak ada hasil untuk **"${query}"**` })
          });
          return;
        }
        hasilText = items.slice(0, 5).map((item, i) => {
          const title   = item.title?.slice(0, 80) || 'Tanpa Judul';
          const snippet = item.snippet?.slice(0, 120) || 'Tidak ada deskripsi.';
          const link    = item.link || '#';
          const source  = item.displayed_link || item.source || 'Unknown';
          return [
            `${medals[i]} **${title}**`,
            `> 📝 ${snippet}`,
            `> 🔗 [Buka Link](${link}) • 🌐 \`${source}\``
          ].join('\n');
        }).join('\n\n');
      }

      // ── Tipe label ──
      const tipeLabel = {
        web:   '🌐 Web',
        image: '🖼️ Gambar',
        news:  '📰 Berita'
      }[tipe] || '🌐 Web';

      // ── Info pencarian ──
      const totalResults = data.search_information?.total_results
        ? parseInt(data.search_information.total_results).toLocaleString('id-ID')
        : 'N/A';
      const searchTime = data.search_information?.time_taken_displayed || 'N/A';

      // ── Counter quota harian per user ──
      const quotaKey  = `search_quota:${discordId}`;
      const quotaRaw  = await env.USERS_KV.get(quotaKey);
      const quotaData = quotaRaw ? JSON.parse(quotaRaw) : { count: 0, resetAt: Date.now() + 86400000 };
      if (Date.now() > quotaData.resetAt) {
        quotaData.count   = 0;
        quotaData.resetAt = Date.now() + 86400000;
      }
      quotaData.count++;
      await env.USERS_KV.put(quotaKey, JSON.stringify(quotaData), { expirationTtl: 86400 });

      // ── Build response ──
      const content = [
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        `\u001b[2;34m║  \u001b[1;33m🔍  SEARCH RESULT  🔍\u001b[0m             \u001b[2;34m║\u001b[0m`,
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `${EMOJI} 🔍 **Query:** \`${query}\` — ${tipeLabel}`,
        '',
        '```ansi',
        '\u001b[1;33m━━━━━━━━━━━━ 📊 INFO ━━━━━━━━━━━━━━━\u001b[0m',
        `\u001b[1;36m 🌐  Total Hasil  :\u001b[0m \u001b[0;37m${totalResults} hasil\u001b[0m`,
        `\u001b[1;36m ⚡  Waktu Cari   :\u001b[0m \u001b[0;37m${searchTime} detik\u001b[0m`,
        `\u001b[1;36m 🕐  Dicari Pada  :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
        `\u001b[1;36m 🔢  Search Kamu  :\u001b[0m \u001b[0;37m${quotaData.count}x hari ini\u001b[0m`,
        '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
        '```',
        '',
        hasilText,
        '',
        `> 🤖 *Powered by OwoBim Search Engine API* ${EMOJI}`
      ].join('\n');

      const finalContent = content.length > 1990 ? content.slice(0, 1987) + '...' : content;

      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent })
      });

    } catch (err) {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `> ❌ Error: \`${err.message}\`` })
      });
    }
  })());

  return new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}










// ══════════════════════════════════════════════════════════════
// DATA MASTER
// ══════════════════════════════════════════════════════════════

const FISHING_RODS = {
  basic: {
    id: 'basic', name: '🎣 Basic Rod', price: 0,
    desc: 'Joran standar, gratis untuk semua',
    rarityBoost: 0, cooldownMs: 60000, emoji: '🎣'
  },
  iron: {
    id: 'iron', name: '⚙️ Iron Rod', price: 15000,
    desc: 'Joran besi, sedikit meningkatkan chance rare',
    rarityBoost: 5, cooldownMs: 50000, emoji: '⚙️'
  },
  gold: {
    id: 'gold', name: '✨ Gold Rod', price: 50000,
    desc: 'Joran emas, chance rare meningkat signifikan',
    rarityBoost: 15, cooldownMs: 40000, emoji: '✨'
  },
  diamond: {
    id: 'diamond', name: '💎 Diamond Rod', price: 150000,
    desc: 'Joran berlian, chance legendary sangat tinggi',
    rarityBoost: 30, cooldownMs: 30000, emoji: '💎'
  },
  mythic: {
    id: 'mythic', name: '🌌 Mythic Rod', price: 500000,
    desc: 'Joran mitos, garansi minimal Rare tiap cast',
    rarityBoost: 50, cooldownMs: 20000, emoji: '🌌'
  }
};

const FISHING_BAITS = {
  worm: {
    id: 'worm', name: '🪱 Cacing', price: 500, stock: 1,
    desc: 'Umpan biasa, sedikit boost common fish',
    rarityBoost: 2, sizeBoost: 0, emoji: '🪱'
  },
  shrimp: {
    id: 'shrimp', name: '🦐 Udang', price: 2000, stock: 1,
    desc: 'Boost chance uncommon & ukuran ikan',
    rarityBoost: 8, sizeBoost: 10, emoji: '🦐'
  },
  squid: {
    id: 'squid', name: '🦑 Cumi', price: 5000, stock: 1,
    desc: 'Boost signifikan untuk rare fish',
    rarityBoost: 18, sizeBoost: 20, emoji: '🦑'
  },
  goldfish: {
    id: 'goldfish', name: '🐠 Ikan Emas', price: 15000, stock: 1,
    desc: 'Umpan premium, boost legendary fish',
    rarityBoost: 35, sizeBoost: 35, emoji: '🐠'
  },
  legendary_lure: {
    id: 'legendary_lure', name: '⚡ Legendary Lure', price: 50000, stock: 1,
    desc: 'Garansi minimal Epic, massive size boost',
    rarityBoost: 60, sizeBoost: 50, emoji: '⚡'
  }
};

const RARITY = {
  trash:     { name: '🗑️ Sampah',    color: '\u001b[2;37m', weight: 20, basePrice: 0     },
  common:    { name: '⚪ Common',     color: '\u001b[0;37m', weight: 35, basePrice: 200   },
  uncommon:  { name: '🟢 Uncommon',  color: '\u001b[0;32m', weight: 25, basePrice: 800   },
  rare:      { name: '🔵 Rare',      color: '\u001b[1;34m', weight: 12, basePrice: 3000  },
  epic:      { name: '🟣 Epic',      color: '\u001b[1;35m', weight: 5,  basePrice: 12000 },
  legendary: { name: '🟡 Legendary', color: '\u001b[1;33m', weight: 2,  basePrice: 50000 },
  mythic:    { name: '🌌 Mythic',    color: '\u001b[1;36m', weight: 1,  basePrice: 200000}
};

const TRASH_ITEMS = [
  { name: 'Botol Plastik', emoji: '🍶' },
  { name: 'Sepatu Bekas',  emoji: '👟' },
  { name: 'Kaleng Rusak',  emoji: '🥫' },
  { name: 'Ban Mobil',     emoji: '🛞' },
  { name: 'Kantong Plastik', emoji: '🛍️' },
  { name: 'Ember Bocor',   emoji: '🪣' },
];

const FALLBACK_FISH = {
  common:    [{ name: 'Ikan Mas',      scientificName: 'Carassius auratus',       habitat: 'freshwater', emoji: '🐟' },
              { name: 'Lele',           scientificName: 'Clarias batrachus',        habitat: 'freshwater', emoji: '🐟' },
              { name: 'Nila',           scientificName: 'Oreochromis niloticus',    habitat: 'freshwater', emoji: '🐟' }],
  uncommon:  [{ name: 'Kakap Putih',   scientificName: 'Lates calcarifer',         habitat: 'saltwater',  emoji: '🐠' },
              { name: 'Bawal',          scientificName: 'Pampus argenteus',         habitat: 'saltwater',  emoji: '🐠' }],
  rare:      [{ name: 'Marlin',         scientificName: 'Makaira nigricans',        habitat: 'saltwater',  emoji: '🐡' },
              { name: 'Tenggiri',       scientificName: 'Scomberomorus commerson',  habitat: 'saltwater',  emoji: '🐡' }],
  epic:      [{ name: 'Napoleon Fish',  scientificName: 'Cheilinus undulatus',      habitat: 'saltwater',  emoji: '🦈' },
              { name: 'Swordfish',      scientificName: 'Xiphias gladius',          habitat: 'saltwater',  emoji: '🦈' }],
  legendary: [{ name: 'Giant Tuna',     scientificName: 'Thunnus thynnus',          habitat: 'saltwater',  emoji: '🐋' }],
  mythic:    [{ name: 'Coelacanth',     scientificName: 'Latimeria chalumnae',      habitat: 'deep sea',   emoji: '🌌' }],
};

// ══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

// FIX: getSafeRod — selalu return rod yang valid dengan cooldownMs yang benar
function getSafeRod(rodRaw) {
  if (!rodRaw) return FISHING_RODS.basic;
  try {
    const parsed = JSON.parse(rodRaw);
    // Pastikan rod punya id yang valid dan cooldownMs yang benar
    const canonical = FISHING_RODS[parsed.id];
    if (canonical) return canonical; // selalu pakai data master, bukan data KV
    return FISHING_RODS.basic;
  } catch {
    return FISHING_RODS.basic;
  }
}

// FIX: getSafeCooldownTtl — pastikan tidak NaN
function getSafeCooldownTtl(cooldownMs) {
  const ms = Number(cooldownMs);
  if (!ms || isNaN(ms) || ms <= 0) return 65;
  return Math.max(60, Math.ceil(ms / 1000) + 5);
}

async function fetchFishImage(scientificName) {
  if (!scientificName) return null;
  try {
    const encoded = encodeURIComponent(scientificName.trim());
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {
        headers: { 'User-Agent': 'OwoBimBot/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.thumbnail?.source || data?.originalimage?.source || null;
  } catch {
    return null;
  }
}

async function fetchFishFromNOAA(rarity) {
  try {
    const res = await fetch('https://www.fishwatch.gov/api/species', {
      headers: { 'User-Agent': 'OwoBimBot/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error('API down');
    const all = await res.json();
    if (!Array.isArray(all) || all.length === 0) throw new Error('Empty');

    let filtered = all.filter(f => f['Species Name'] && f['Scientific Name']);

    if (rarity === 'trash')     return null;
    if (rarity === 'common')    filtered = filtered.filter(f => !f['Fishing Rate'] || f['Fishing Rate'].includes('not overfished'));
    if (rarity === 'uncommon')  filtered = filtered.slice(0, 100);
    if (rarity === 'rare')      filtered = filtered.filter(f => f['Population'] && f['Population'].includes('below'));
    if (rarity === 'epic')      filtered = filtered.filter(f => f['Fishing Rate'] && f['Fishing Rate'].includes('overfished'));
    if (rarity === 'legendary') filtered = filtered.filter(f => f['NOAA Fisheries Region'] && f['NOAA Fisheries Region'].includes('Pacific'));
    if (rarity === 'mythic')    filtered = filtered.slice(-10);

    if (filtered.length === 0) filtered = all;

    const pick = filtered[Math.floor(Math.random() * filtered.length)];

    return {
      name:           pick['Species Name']    || pick['Species Aliases'] || 'Unknown Fish',
      scientificName: pick['Scientific Name'] || '',
      habitat:        pick['Habitat']         || 'ocean',
      imageUrl:       pick['Species Illustration Photo']?.src || null,
      fishingRate:    pick['Fishing Rate']    || '',
      population:     pick['Population']     || '',
      emoji:          getHabitatEmoji(pick['Habitat'] || ''),
    };
  } catch (_) {
    return null;
  }
}

function getHabitatEmoji(habitat) {
  const h = habitat.toLowerCase();
  if (h.includes('fresh'))  return '🐟';
  if (h.includes('deep'))   return '🌊';
  if (h.includes('coral'))  return '🐠';
  if (h.includes('reef'))   return '🐡';
  if (h.includes('pelagic'))return '🦈';
  return '🐟';
}

function rollRarity(totalBoost) {
  const weights = { ...Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [k, v.weight])) };

  const boost = Math.min(totalBoost, 80);
  weights.trash    = Math.max(1, weights.trash    - boost * 0.3);
  weights.common   = Math.max(1, weights.common   - boost * 0.4);
  weights.uncommon = weights.uncommon + boost * 0.2;
  weights.rare     = weights.rare     + boost * 0.3;
  weights.epic     = weights.epic     + boost * 0.25;
  weights.legendary= weights.legendary + boost * 0.15;
  weights.mythic   = weights.mythic   + boost * 0.1;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return 'common';
}

function calcFishPrice(rarity, weightKg) {
  const base = RARITY[rarity]?.basePrice || 0;
  const sizeMultiplier = 1 + (weightKg / 10);
  return Math.floor(base * sizeMultiplier);
}

function rollFishSize(rarity, sizeBoost) {
  const ranges = {
    trash: [0, 0], common: [0.1, 2], uncommon: [0.5, 5],
    rare: [2, 15], epic: [10, 50], legendary: [30, 150], mythic: [100, 500]
  };
  const [min, max] = ranges[rarity] || [0.1, 2];
  const boost = sizeBoost / 100;
  const base = min + Math.random() * (max - min);
  return Math.round((base * (1 + boost)) * 100) / 100;
}

function genAuctionId() {
  return `AUC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

// ══════════════════════════════════════════════════════════════
// CMD: fishing — mancing utama
// ══════════════════════════════════════════════════════════════
if (cmd === 'fishing') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const useBait = getOption(options, 'bait') || 'none';
  const location = getOption(options, 'location') || 'ocean';

  // FIX: Return defer response DULU sebelum waitUntil
  // Ini penting agar Discord tidak timeout 3 detik
  waitUntil((async () => {
    const cdKey    = `fishing:cd:${discordId}`;
    const rodKey   = `fishing:rod:${discordId}`;
    const baitKey  = `fishing:bait:${discordId}`;
    const statsKey = `fishing:stats:${discordId}`;
    const invKey   = `fishing:inventory:${discordId}`;

    const editMsg = async (content, embeds) => {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embeds ? { content, embeds } : { content })
      });
    };

    try {
      const [cdRaw, rodRaw, baitRaw, statsRaw, invRaw] = await Promise.all([
        env.USERS_KV.get(cdKey),
        env.USERS_KV.get(rodKey),
        env.USERS_KV.get(baitKey),
        env.USERS_KV.get(statsKey),
        env.USERS_KV.get(invKey),
      ]);

      // FIX: Selalu pakai getSafeRod agar cooldownMs tidak pernah undefined/NaN
      const rod   = getSafeRod(rodRaw);
      const baits = baitRaw  ? JSON.parse(baitRaw)  : {};
      const stats = statsRaw ? JSON.parse(statsRaw) : { totalCast: 0, totalCatch: 0, totalValue: 0, biggestFish: null, byRarity: {} };
      const inv   = invRaw   ? JSON.parse(invRaw)   : [];

      // FIX: Pastikan stats.byRarity selalu ada
      if (!stats.byRarity) stats.byRarity = {};

      if (cdRaw) {
        const sisa = rod.cooldownMs - (Date.now() - parseInt(cdRaw));
        if (sisa > 0) {
          return await editMsg([
            `> ${EMOJI} ⏳ Joran kamu masih basah! Tunggu **${fmtDuration(sisa)}** lagi.`,
            `> 🎣 Rod: **${rod.name}** | Cooldown: **${fmtDuration(rod.cooldownMs)}**`
          ].join('\n'));
        }
      }

      if (inv.length >= 30) {
        return await editMsg([
          `> ${EMOJI} 🎒 Kantong penuh! Kamu punya **${inv.length}/30** ikan.`,
          `> 💡 Jual lewat \`/fish-sell\` atau simpan di \`/aquarium add\` dulu!`
        ].join('\n'));
      }

      let rarityBoost = rod.rarityBoost || 0;
      let sizeBoost   = 0;
      let baitUsed    = null;

      if (useBait !== 'none' && FISHING_BAITS[useBait]) {
        const baitInfo  = FISHING_BAITS[useBait];
        const baitStock = baits[useBait] || 0;
        if (baitStock <= 0) {
          return await editMsg(`> ${EMOJI} ❌ Kamu tidak punya **${baitInfo.name}**!\n> 💡 Beli di \`/fish-shop\``);
        }
        rarityBoost += baitInfo.rarityBoost;
        sizeBoost   += baitInfo.sizeBoost;
        baits[useBait] = baitStock - 1;
        baitUsed = baitInfo;
      }

      const locationBonus = { ocean: 0, river: -5, deep: 20 };
      rarityBoost += locationBonus[location] || 0;

      const rarity     = rollRarity(rarityBoost);
      const weightKg   = rollFishSize(rarity, sizeBoost);
      const rarityInfo = RARITY[rarity];

      let fishData;
      if (rarity === 'trash') {
        const trash = TRASH_ITEMS[Math.floor(Math.random() * TRASH_ITEMS.length)];
        fishData = { name: trash.name, scientificName: '', emoji: trash.emoji, habitat: 'trash', imageUrl: null };
      } else {
        const apiResult = await fetchFishFromNOAA(rarity);
        if (apiResult) {
          fishData = apiResult;
        } else {
          const pool = FALLBACK_FISH[rarity] || FALLBACK_FISH.common;
          fishData = { ...pool[Math.floor(Math.random() * pool.length)] };
        }

        if (!fishData.imageUrl && fishData.scientificName) {
          fishData.imageUrl = await fetchFishImage(fishData.scientificName);
        }
      }

      const price   = calcFishPrice(rarity, weightKg);
      const catchId = `FISH-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      const fishEntry = {
        id:             catchId,
        name:           fishData.name,
        scientificName: fishData.scientificName || '',
        emoji:          fishData.emoji || '🐟',
        rarity,
        weightKg,
        price,
        habitat:        fishData.habitat || 'unknown',
        imageUrl:       fishData.imageUrl || null,
        caughtAt:       Date.now(),
        caughtBy:       username,
        location,
        rodUsed:        rod.id,
        baitUsed:       baitUsed?.id || null,
      };

      inv.push(fishEntry);
      stats.totalCast++;
      if (rarity !== 'trash') {
        stats.totalCatch++;
        stats.totalValue += price;
        stats.byRarity[rarity] = (stats.byRarity[rarity] || 0) + 1;
        if (!stats.biggestFish || weightKg > stats.biggestFish.weightKg) {
          stats.biggestFish = { name: fishData.name, weightKg, rarity, caughtAt: Date.now() };
        }
      }

      // FIX: Pakai getSafeCooldownTtl agar tidak pernah NaN → tidak throw error
      const cooldownTtl = getSafeCooldownTtl(rod.cooldownMs);

      await Promise.all([
        env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: cooldownTtl }),
        env.USERS_KV.put(invKey, JSON.stringify(inv)),
        env.USERS_KV.put(statsKey, JSON.stringify(stats)),
        baitUsed ? env.USERS_KV.put(baitKey, JSON.stringify(baits)) : Promise.resolve(),
      ]);

      const isTrash     = rarity === 'trash';
      const isMythic    = rarity === 'mythic';
      const isLegendary = rarity === 'legendary';
      const headerColor = isMythic ? '\u001b[1;36m' : isLegendary ? '\u001b[1;33m' : rarityInfo.color;
      const locationLabel = { ocean: '🌊 Laut', river: '🏞️ Sungai', deep: '🌑 Laut Dalam' };

      const winMsg = isTrash
        ? `🗑️ **${username}** malah dapat sampah! Buang dulu bro...`
        : isMythic
        ? `🌌 **MYTHIC CATCH!!!** **${username}** dapat **${fishData.name}** yang LEGENDARIS!!! 🎊🎊🎊`
        : isLegendary
        ? `🟡 **LEGENDARY!** **${username}** dapat **${fishData.name}**! Luar biasa!!! 🏆`
        : `🎣 **${username}** dapat tangkapan!`;

      const lines = [
        '```ansi',
        `\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m`,
        `\u001b[2;34m║  ${headerColor}🎣  FISHING RESULT  🎣\u001b[0m             \u001b[2;34m║\u001b[0m`,
        `\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m`,
        '```',
      ];

      if (isTrash) {
        lines.push(
          `> ${fishData.emoji} Narik... narik... dapat **${fishData.name}**? Hadeh.`,
          `> 🗑️ Sampah gak ada harganya. Buang aja.`
        );
      } else {
        lines.push(
          '```ansi',
          `\u001b[1;33m━━━━━━━━━━━━ 🐟 TANGKAPAN ━━━━━━━━━━━━\u001b[0m`,
          `\u001b[1;36m  ${fishData.emoji}  Nama       :\u001b[0m \u001b[1;37m${fishData.name}\u001b[0m`,
          fishData.scientificName ? `\u001b[1;36m  🔬  Ilmiah    :\u001b[0m \u001b[2;37m${fishData.scientificName}\u001b[0m` : null,
          `\u001b[1;36m  ⭐  Rarity    :\u001b[0m ${rarityInfo.color}${rarityInfo.name}\u001b[0m`,
          `\u001b[1;36m  ⚖️  Berat     :\u001b[0m \u001b[0;37m${weightKg} kg\u001b[0m`,
          `\u001b[1;36m  🌍  Habitat   :\u001b[0m \u001b[0;37m${fishData.habitat}\u001b[0m`,
          `\u001b[1;36m  💰  Nilai     :\u001b[0m \u001b[1;32m🪙 ${price.toLocaleString()}\u001b[0m`,
          `\u001b[1;36m  📍  Lokasi    :\u001b[0m \u001b[0;37m${locationLabel[location] || location}\u001b[0m`,
          `\u001b[1;36m  🎣  Rod       :\u001b[0m \u001b[0;37m${rod.name}\u001b[0m`,
          baitUsed ? `\u001b[1;36m  🪱  Bait      :\u001b[0m \u001b[0;37m${baitUsed.name}\u001b[0m` : null,
          `\u001b[1;36m  🆔  ID        :\u001b[0m \u001b[2;37m${catchId}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '\u001b[1;32m━━━━━━━━━━━━ 📊 STATS ━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🎒  Inventory :\u001b[0m \u001b[0;37m${inv.length}/30 ikan\u001b[0m`,
          `\u001b[1;36m  🏆  Total Catch:\u001b[0m \u001b[0;37m${stats.totalCatch}x\u001b[0m`,
          `\u001b[1;36m  ⏳  Next Cast  :\u001b[0m \u001b[0;37m${fmtDuration(rod.cooldownMs)}\u001b[0m`,
          `\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m`,
          '```',
          `> 💡 \`/fish-sell start\` buat lelang | \`/aquarium add\` buat koleksi`
        );
      }

      await editMsg(winMsg, [{
        color: isMythic ? 0x00FFFF : isLegendary ? 0xFFD700 : isTrash ? 0x808080 : 0x2ECC71,
        description: lines.filter(Boolean).join('\n'),
        image: (!isTrash && fishData.imageUrl) ? { url: fishData.imageUrl } : undefined,
        footer: { text: `OwoBim Fishing System • ${catchId}` },
        timestamp: new Date().toISOString()
      }]);

    } catch (err) {
      // FIX: Catch error di waitUntil agar tidak silent crash
      try {
        await editMsg(`> ❌ Error mancing: \`${err.message}\`\n> Coba lagi dalam beberapa detik.`);
      } catch (_) {}
    }
  })());

  return new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}


// ══════════════════════════════════════════════════════════════
// CMD: fish-inventory — lihat kantong ikan
// ══════════════════════════════════════════════════════════════
if (cmd === 'fish-inventory') {
  const EMOJI  = '<a:GifOwoBim:1492599199038967878>';
  const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
  const inv    = invRaw ? JSON.parse(invRaw) : [];

  if (inv.length === 0) {
    return respond([
      `> ${EMOJI} 🎒 Kantong ikanmu kosong!`,
      `> 💡 Gunakan \`/fishing\` untuk mulai mancing.`
    ].join('\n'));
  }

  const sorted = [...inv].sort((a, b) => (RARITY[b.rarity]?.basePrice || 0) - (RARITY[a.rarity]?.basePrice || 0));
  const totalValue = inv.reduce((s, f) => s + (f.price || 0), 0);

  const rows = sorted.map((f, i) => {
    const r = RARITY[f.rarity];
    return `${String(i+1).padStart(2)}. ${f.emoji || '🐟'} **${f.name}** ${r?.name || ''} — ${f.weightKg}kg — 🪙 ${(f.price||0).toLocaleString()} — \`${f.id}\``;
  }).join('\n');

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    `\u001b[2;34m║  \u001b[1;33m🎒  FISH INVENTORY  🎒\u001b[0m            \u001b[2;34m║\u001b[0m`,
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    rows,
    '',
    `> 🎒 **${inv.length}/30** ikan | Total Nilai: 🪙 **${totalValue.toLocaleString()}**`,
    `> 💡 \`/fish-sell start id:FISH-xxx\` untuk lelang | \`/fish-sell sellall\` jual semua`
  ].join('\n'));
}


// ══════════════════════════════════════════════════════════════
// CMD: fish-sell
// ══════════════════════════════════════════════════════════════
if (cmd === 'fish-sell') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const sub   = getOption(options, 'aksi') || 'start';

  // ← TARUH DI SINI JUAL KE BOT
  if (sub === 'sell') {
    const fishId = getOption(options, 'id');
    if (!fishId) return respond(`> ${EMOJI} ❌ Masukkan ID ikan! Cek \`/fish-inventory\``);

    const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
    const inv    = invRaw ? JSON.parse(invRaw) : [];
    const fishIdx = inv.findIndex(f => f.id === fishId);

    if (fishIdx === -1) return respond(`> ${EMOJI} ❌ Ikan ID **${fishId}** tidak ada di inventory!`);

    const fish = inv[fishIdx];
    if (fish.rarity === 'trash') return respond(`> ${EMOJI} ❌ Sampah tidak bisa dijual! 🗑️`);

    inv.splice(fishIdx, 1);
    user.balance += fish.price;
    user.totalEarned = (user.totalEarned || 0) + fish.price;

    await Promise.all([
      env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
      env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
    ]);
    waitUntil(pushLinkedRole(env, discordId, null, user));

    const r = RARITY[fish.rarity];
    return respond([
      '```ansi',
      '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[1;32m║  💰  IKAN TERJUAL!  💰               ║\u001b[0m',
      '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ✅ **${fish.emoji || '🐟'} ${fish.name}** berhasil dijual!`,
      `> ⭐ Rarity: **${r?.name || fish.rarity}** | ⚖️ Berat: **${fish.weightKg}kg**`,
      `> 🪙 Dapat: **${fish.price.toLocaleString()} cowoncy**`,
      `> 💳 Saldo baru: **${user.balance.toLocaleString()} cowoncy**`,
      `> 🎒 Sisa inventory: **${inv.length}/30**`
    ].join('\n'));
  }


  

  if (sub === 'sellall') {
    const rarityFilter = getOption(options, 'rarity') || 'all';
    const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
    const inv    = invRaw ? JSON.parse(invRaw) : [];

    if (inv.length === 0) return respond(`> ${EMOJI} 🎒 Inventory kosong!`);

    let toSell = inv;
    if (rarityFilter !== 'all') toSell = inv.filter(f => f.rarity === rarityFilter);
    toSell = toSell.filter(f => f.rarity !== 'trash');

    if (toSell.length === 0) return respond(`> ${EMOJI} ❌ Tidak ada ikan untuk dijual dengan filter **${rarityFilter}**!`);

    const totalEarned = toSell.reduce((s, f) => s + (f.price || 0), 0);
    const remaining   = inv.filter(f => !toSell.includes(f));

    user.balance += totalEarned;
    user.totalEarned = (user.totalEarned || 0) + totalEarned;

    await Promise.all([
      env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(remaining)),
      env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
    ]);
    waitUntil(pushLinkedRole(env, discordId, null, user));

    return respond([
      '```ansi',
      '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[1;32m║  💰  IKAN TERJUAL!  💰               ║\u001b[0m',
      '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ✅ Berhasil jual **${toSell.length} ikan**!`,
      `> 🪙 Dapat: **${totalEarned.toLocaleString()} cowoncy**`,
      `> 💳 Saldo baru: **${user.balance.toLocaleString()} cowoncy**`,
      `> 🎒 Sisa inventory: **${remaining.length}/30**`
    ].join('\n'));
  }

  if (sub === 'claim') {
    const auctionId = getOption(options, 'id');
    if (!auctionId) return respond(`> ${EMOJI} ❌ Masukkan Auction ID!`);

    const auctionRaw = await env.USERS_KV.get(`fishing:auction:${auctionId}`);
    if (!auctionRaw) return respond(`> ${EMOJI} ❌ Lelang tidak ditemukan!`);

    const auction = JSON.parse(auctionRaw);
    if (Date.now() < auction.endTime) {
      return respond(`> ${EMOJI} ⏳ Lelang belum berakhir! Sisa: **${fmtDuration(auction.endTime - Date.now())}**`);
    }
    if (auction.status === 'claimed') return respond(`> ${EMOJI} ❌ Lelang ini sudah diklaim!`);

    if (discordId === auction.sellerId) {
      if (!auction.highestBidder) {
        auction.status = 'claimed';
        const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
        const inv = invRaw ? JSON.parse(invRaw) : [];
        inv.push(auction.fish);
        await Promise.all([
          env.USERS_KV.put(`fishing:auction:${auctionId}`, JSON.stringify(auction)),
          env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
        ]);
        return respond(`> ${EMOJI} 😔 Tidak ada yang bid! Ikan **${auction.fish.name}** dikembalikan ke inventory.`);
      }
      const earned = auction.currentBid;
      user.balance += earned;
      user.totalEarned = (user.totalEarned || 0) + earned;
      auction.status = 'claimed';
      await Promise.all([
        env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
        env.USERS_KV.put(`fishing:auction:${auctionId}`, JSON.stringify(auction)),
      ]);
      waitUntil(pushLinkedRole(env, discordId, null, user));
      return respond([
        `> ${EMOJI} 🎉 Lelang selesai! **${auction.fish.name}** terjual seharga 🪙 **${earned.toLocaleString()}**`,
        `> 👑 Dibeli oleh: **${auction.highestBidderName}**`,
        `> 💳 Saldo baru: 🪙 **${user.balance.toLocaleString()}**`
      ].join('\n'));
    }

    if (discordId === auction.highestBidder) {
      auction.status = 'claimed';
      const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
      const inv = invRaw ? JSON.parse(invRaw) : [];
      inv.push(auction.fish);
      await Promise.all([
        env.USERS_KV.put(`fishing:auction:${auctionId}`, JSON.stringify(auction)),
        env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
      ]);
      return respond([
        `> ${EMOJI} 🎉 Selamat! Kamu memenangkan lelang!`,
        `> 🐟 **${auction.fish.name}** (${RARITY[auction.fish.rarity]?.name}) sudah masuk inventory!`,
        `> 💰 Dibayar: 🪙 **${auction.currentBid.toLocaleString()}**`
      ].join('\n'));
    }

    return respond(`> ${EMOJI} ❌ Kamu bukan seller maupun pemenang lelang ini!`);
  }

  const DEFER_SUBS = ['start', 'bid', 'list'];

  if (DEFER_SUBS.includes(sub)) {
    waitUntil((async () => {
      const editMsg = async (content, embeds) => {
        await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embeds ? { content, embeds } : { content })
        });
      };

      try {

        if (sub === 'start') {
          const fishId    = getOption(options, 'id');
          const startBid  = parseInt(getOption(options, 'harga_awal') || '0');
          const durationH = parseInt(getOption(options, 'durasi') || '1');

          if (!fishId) return await editMsg(`> ${EMOJI} ❌ Masukkan ID ikan! Cek \`/fish-inventory\``);
          if (startBid < 0) return await editMsg(`> ${EMOJI} ❌ Harga awal tidak boleh negatif!`);
          if (durationH < 1 || durationH > 24) return await editMsg(`> ${EMOJI} ❌ Durasi lelang 1-24 jam!`);

          const invRaw = await env.USERS_KV.get(`fishing:inventory:${discordId}`);
          const inv    = invRaw ? JSON.parse(invRaw) : [];
          const fishIdx = inv.findIndex(f => f.id === fishId);

          if (fishIdx === -1) return await editMsg(`> ${EMOJI} ❌ Ikan ID **${fishId}** tidak ada di inventory kamu!`);

          const fish        = inv[fishIdx];
          const rInfo       = RARITY[fish.rarity];
          const minPrice    = Math.floor(fish.price * 0.1);
          const actualStart = Math.max(startBid, minPrice);
          const auctionId   = genAuctionId();
          const endTime     = Date.now() + durationH * 3600000;

          let fishImageUrl = fish.imageUrl || null;
          if (!fishImageUrl && fish.scientificName) {
            fishImageUrl = await fetchFishImage(fish.scientificName);
          }

          inv.splice(fishIdx, 1);

          const auctionData = {
            id: auctionId,
            fish: { ...fish, imageUrl: fishImageUrl },
            sellerId: discordId,
            sellerName: username,
            startBid: actualStart,
            currentBid: actualStart,
            highestBidder: null,
            highestBidderName: null,
            bids: [],
            endTime,
            createdAt: Date.now(),
            channelId, guildId,
            status: 'active'
          };

          const listRaw = await env.USERS_KV.get('fishing:auctions:active');
          const auctionList = listRaw ? JSON.parse(listRaw) : [];
          auctionList.push({ id: auctionId, endTime, sellerId: discordId });

          await Promise.all([
            env.USERS_KV.put(`fishing:auction:${auctionId}`, JSON.stringify(auctionData), { expirationTtl: 86400 * 2 }),
            env.USERS_KV.put('fishing:auctions:active', JSON.stringify(auctionList)),
            env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
          ]);

          const auctionLines = [
            '```ansi',
            '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;32m║  🔨  LELANG DIMULAI!  🔨             ║\u001b[0m',
            '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `> ${EMOJI} 🔨 **${fish.emoji || '🐟'} ${fish.name}** sekarang dilelang!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━ 🔨 DETAIL LELANG ━━━━━━━━\u001b[0m',
            `\u001b[1;36m  🆔  Auction ID :\u001b[0m \u001b[0;37m${auctionId}\u001b[0m`,
            `\u001b[1;36m  🐟  Ikan       :\u001b[0m \u001b[1;37m${fish.name}\u001b[0m`,
            fish.scientificName ? `\u001b[1;36m  🔬  Ilmiah     :\u001b[0m \u001b[2;37m${fish.scientificName}\u001b[0m` : null,
            `\u001b[1;36m  ⭐  Rarity     :\u001b[0m ${rInfo?.color || ''}${rInfo?.name || fish.rarity}\u001b[0m`,
            `\u001b[1;36m  ⚖️  Berat      :\u001b[0m \u001b[0;37m${fish.weightKg} kg\u001b[0m`,
            `\u001b[1;36m  💰  Harga Awal :\u001b[0m \u001b[1;32m🪙 ${actualStart.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m  💎  Est. Value :\u001b[0m \u001b[0;37m🪙 ${fish.price.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m  ⏰  Berakhir   :\u001b[0m \u001b[0;37m${durationH} jam dari sekarang\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> 🏷️ User lain bid pakai: \`/fish-sell bid id:${auctionId} jumlah:xxx\``
          ].filter(Boolean).join('\n');

          return await editMsg('', [{
            color: 0x2ECC71,
            description: auctionLines,
            image: fishImageUrl ? { url: fishImageUrl } : undefined,
            footer: { text: `OwoBim Auction System • ${auctionId}` },
            timestamp: new Date().toISOString()
          }]);
        }

        if (sub === 'bid') {
          const auctionId = getOption(options, 'id');
          const bidAmount = parseInt(getOption(options, 'jumlah') || '0');

          if (!auctionId) return await editMsg(`> ${EMOJI} ❌ Masukkan Auction ID!`);
          if (!bidAmount || bidAmount <= 0) return await editMsg(`> ${EMOJI} ❌ Jumlah bid tidak valid!`);

          const auctionRaw = await env.USERS_KV.get(`fishing:auction:${auctionId}`);
          if (!auctionRaw) return await editMsg(`> ${EMOJI} ❌ Lelang **${auctionId}** tidak ditemukan atau sudah berakhir!`);

          const auction = JSON.parse(auctionRaw);

          if (auction.status !== 'active') return await editMsg(`> ${EMOJI} ❌ Lelang ini sudah **${auction.status}**!`);
          if (Date.now() > auction.endTime) return await editMsg(`> ${EMOJI} ❌ Lelang sudah berakhir!`);
          if (auction.sellerId === discordId) return await editMsg(`> ${EMOJI} ❌ Tidak bisa bid di lelang sendiri!`);
          if (bidAmount <= auction.currentBid) return await editMsg(`> ${EMOJI} ❌ Bid harus lebih dari 🪙 **${auction.currentBid.toLocaleString()}**!`);
          if (bidAmount > user.balance) return await editMsg(`> ${EMOJI} ❌ Saldo tidak cukup! Kamu punya 🪙 **${user.balance.toLocaleString()}**`);

          if (auction.highestBidder && auction.highestBidder !== discordId) {
            const prevBidderStr = await env.USERS_KV.get(`user:${auction.highestBidder}`);
            if (prevBidderStr) {
              const prevBidder = JSON.parse(prevBidderStr);
              prevBidder.balance += auction.currentBid;
              await env.USERS_KV.put(`user:${auction.highestBidder}`, JSON.stringify(prevBidder));
            }
          }

          user.balance -= bidAmount;
          await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));

          auction.currentBid = bidAmount;
          auction.highestBidder = discordId;
          auction.highestBidderName = username;
          auction.bids.push({ bidderId: discordId, bidderName: username, amount: bidAmount, at: Date.now() });
          if (auction.bids.length > 20) auction.bids = auction.bids.slice(-20);

          await env.USERS_KV.put(`fishing:auction:${auctionId}`, JSON.stringify(auction), { expirationTtl: 86400 * 2 });

          const sisa = auction.endTime - Date.now();
          const bidFishImageUrl = auction.fish?.imageUrl || null;

          const bidLines = [
            '```ansi',
            '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;32m║  💰  BID BERHASIL!  💰               ║\u001b[0m',
            '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            `> ${EMOJI} 🏷️ Kamu memimpin lelang **${auction.fish.name}**!`,
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━ 💰 BID INFO ━━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m  🆔  Auction    :\u001b[0m \u001b[0;37m${auctionId}\u001b[0m`,
            `\u001b[1;36m  🐟  Ikan       :\u001b[0m \u001b[1;37m${auction.fish.name}\u001b[0m`,
            `\u001b[1;36m  💰  Bid Kamu   :\u001b[0m \u001b[1;32m🪙 ${bidAmount.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m  👑  Posisi     :\u001b[0m \u001b[1;32m#1 TERTINGGI\u001b[0m`,
            `\u001b[1;36m  ⏰  Sisa Waktu :\u001b[0m \u001b[0;37m${fmtDuration(sisa)}\u001b[0m`,
            `\u001b[1;36m  💳  Saldo Sisa :\u001b[0m \u001b[0;37m🪙 ${user.balance.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m  📊  Total Bid  :\u001b[0m \u001b[0;37m${auction.bids.length}x\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            `> ⚠️ Jika ada yang bid lebih tinggi, uangmu dikembalikan otomatis.`
          ].join('\n');

          return await editMsg('', [{
            color: 0x2ECC71,
            description: bidLines,
            thumbnail: bidFishImageUrl ? { url: bidFishImageUrl } : undefined,
            footer: { text: `OwoBim Auction System • ${auctionId}` },
            timestamp: new Date().toISOString()
          }]);
        }

        if (sub === 'list') {
          const listRaw = await env.USERS_KV.get('fishing:auctions:active');
          const auctionList = listRaw ? JSON.parse(listRaw) : [];
          const active = auctionList.filter(a => Date.now() < a.endTime);

          if (active.length === 0) return await editMsg(`> ${EMOJI} 📭 Tidak ada lelang aktif saat ini!`);

          const details = await Promise.all(
            active.slice(-10).map(a => env.USERS_KV.get(`fishing:auction:${a.id}`))
          );
          const validAuctions = details.filter(Boolean).map(raw => JSON.parse(raw));

          const embeds = [{
            color: 0x3498DB,
            title: '🔨 LELANG AKTIF',
            description: `> **${active.length}** lelang sedang berlangsung\n> Bid: \`/fish-sell bid id:AUC-xxx jumlah:xxx\``,
            footer: { text: 'OwoBim Auction System' },
            timestamp: new Date().toISOString()
          }];

          for (const a of validAuctions.slice(0, 9)) {
            const r = RARITY[a.fish.rarity];
            const sisa = a.endTime - Date.now();
            const fishImg = a.fish?.imageUrl || null;
            embeds.push({
              color: 0x2ECC71,
              author: { name: `${a.fish.emoji || '🐟'} ${a.fish.name} ${r?.name || ''}` },
              description: [
                `**⚖️ Berat:** ${a.fish.weightKg} kg`,
                `**💰 Bid Sekarang:** 🪙 ${a.currentBid.toLocaleString()}`,
                `**👤 Penjual:** ${a.sellerName}`,
                `**⏰ Sisa Waktu:** ${fmtDuration(sisa)}`,
                a.highestBidderName ? `**👑 Leading:** ${a.highestBidderName}` : `**👑 Leading:** _belum ada bid_`,
                `\`🆔 ${a.id}\``
              ].join('\n'),
              thumbnail: fishImg ? { url: fishImg } : undefined,
            });
          }

          return await editMsg('', embeds);
        }

      } catch (err) {
        try { await editMsg(`> ❌ Error: \`${err.message}\``); } catch (_) {}
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return respond(`> ❌ Aksi tidak dikenal!`);
}


// ══════════════════════════════════════════════════════════════
// CMD: fish-shop — beli rod & bait
// ══════════════════════════════════════════════════════════════
if (cmd === 'fish-shop') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const sub   = getOption(options, 'aksi') || 'browse';

  if (sub === 'browse') {
    const rodRaw  = await env.USERS_KV.get(`fishing:rod:${discordId}`);
    const baitRaw = await env.USERS_KV.get(`fishing:bait:${discordId}`);
    // FIX: Pakai getSafeRod agar rod yang ditampilkan selalu akurat
    const rod     = getSafeRod(rodRaw);
    const baits   = baitRaw ? JSON.parse(baitRaw) : {};

    const rodLines = Object.values(FISHING_RODS).map(r => {
      const owned = rod.id === r.id;
      return `${owned ? '✅' : '  '} ${r.emoji} **${r.name}** — 🪙 ${r.price.toLocaleString()} | CD: ${fmtDuration(r.cooldownMs)} | Boost: +${r.rarityBoost}%\n  > ${r.desc}`;
    }).join('\n');

    const baitLines = Object.values(FISHING_BAITS).map(b => {
      const stock = baits[b.id] || 0;
      return `${b.emoji} **${b.name}** — 🪙 ${b.price.toLocaleString()} | Rarity +${b.rarityBoost}% | Size +${b.sizeBoost}% | Stok: **${stock}**\n  > ${b.desc}`;
    }).join('\n');

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      `\u001b[2;34m║  \u001b[1;33m🏪  FISH SHOP  🏪\u001b[0m                 \u001b[2;34m║\u001b[0m`,
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} 💰 Saldo: 🪙 **${user.balance.toLocaleString()}** | Rod aktif: **${rod.name}**`,
      '',
      '**🎣 FISHING RODS:**',
      rodLines,
      '',
      '**🪱 BAIT / UMPAN:**',
      baitLines,
      '',
      `> 💡 Beli rod: \`/fish-shop buy rod:gold\``,
      `> 💡 Beli bait: \`/fish-shop buy bait:squid jumlah:5\``
    ].join('\n'));
  }

  if (sub === 'buy') {
    const rodId    = getOption(options, 'rod');
    const baitId   = getOption(options, 'bait');
    const qty      = parseInt(getOption(options, 'jumlah') || '1');

    if (rodId) {
      const rodInfo = FISHING_RODS[rodId];
      if (!rodInfo) return respond(`> ${EMOJI} ❌ Rod **${rodId}** tidak ada!`);
      if (rodInfo.price === 0 && rodId === 'basic') return respond(`> ${EMOJI} ℹ️ Basic Rod sudah kamu miliki gratis!`);
      if (user.balance < rodInfo.price) {
        return respond(`> ${EMOJI} ❌ Saldo tidak cukup! Butuh 🪙 **${rodInfo.price.toLocaleString()}** tapi kamu punya 🪙 **${user.balance.toLocaleString()}**`);
      }

      user.balance -= rodInfo.price;
      // FIX: Simpan hanya id rod ke KV, bukan seluruh object
      // Supaya getSafeRod selalu bisa resolve ke data master yang benar
      await Promise.all([
        env.USERS_KV.put(`fishing:rod:${discordId}`, JSON.stringify({ id: rodInfo.id })),
        env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
      ]);

      return respond([
        `> ${EMOJI} ✅ Berhasil beli **${rodInfo.name}**!`,
        `> 🎣 Sekarang cooldown mancing kamu **${fmtDuration(rodInfo.cooldownMs)}** | Rarity boost **+${rodInfo.rarityBoost}%**`,
        `> 💳 Saldo: 🪙 **${user.balance.toLocaleString()}**`
      ].join('\n'));
    }

    if (baitId) {
      if (!qty || qty <= 0 || qty > 99) return respond(`> ${EMOJI} ❌ Jumlah bait 1-99!`);
      const baitInfo = FISHING_BAITS[baitId];
      if (!baitInfo) return respond(`> ${EMOJI} ❌ Bait **${baitId}** tidak ada!`);

      const totalPrice = baitInfo.price * qty;
      if (user.balance < totalPrice) {
        return respond(`> ${EMOJI} ❌ Saldo tidak cukup! Butuh 🪙 **${totalPrice.toLocaleString()}**`);
      }

      user.balance -= totalPrice;
      const baitRaw = await env.USERS_KV.get(`fishing:bait:${discordId}`);
      const baits   = baitRaw ? JSON.parse(baitRaw) : {};
      baits[baitId] = (baits[baitId] || 0) + qty;

      await Promise.all([
        env.USERS_KV.put(`fishing:bait:${discordId}`, JSON.stringify(baits)),
        env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user)),
      ]);

      return respond([
        `> ${EMOJI} ✅ Beli **${qty}x ${baitInfo.name}** seharga 🪙 **${totalPrice.toLocaleString()}**!`,
        `> 🪱 Stok ${baitInfo.name}: **${baits[baitId]}**`,
        `> 💳 Saldo: 🪙 **${user.balance.toLocaleString()}**`
      ].join('\n'));
    }

    return respond(`> ${EMOJI} ❌ Tentukan \`rod:\` atau \`bait:\` yang mau dibeli!`);
  }

  return respond(`> ❌ Aksi tidak dikenal! Gunakan: \`browse\` atau \`buy\``);
}


// ══════════════════════════════════════════════════════════════
// CMD: aquarium — koleksi & pelihara ikan
// ══════════════════════════════════════════════════════════════
if (cmd === 'aquarium') {
  const EMOJI  = '<a:GifOwoBim:1492599199038967878>';
  const sub    = getOption(options, 'aksi') || 'view';
  const fishId = getOption(options, 'id');

  const targetOpt  = options.find(o => o.name === 'user');
  const targetId   = targetOpt ? String(targetOpt.value) : discordId;
  const targetUser = targetOpt
    ? interaction.data.resolved?.users?.[targetId]
    : (interaction.member?.user || interaction.user);
  const targetName = targetUser?.username || 'Unknown';

  const editMsg = async (content, embeds) => {
    await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embeds ? { content, embeds } : { content })
    });
  };

  if (sub === 'add') {
    if (!fishId) return respond(`> ${EMOJI} ❌ Masukkan ID ikan!`);
    const [invRaw, aquaRaw] = await Promise.all([
      env.USERS_KV.get(`fishing:inventory:${discordId}`),
      env.USERS_KV.get(`fishing:aquarium:${discordId}`),
    ]);
    const inv  = invRaw  ? JSON.parse(invRaw)  : [];
    const aqua = aquaRaw ? JSON.parse(aquaRaw) : [];
    const fishIdx = inv.findIndex(f => f.id === fishId);
    if (fishIdx === -1) return respond(`> ${EMOJI} ❌ Ikan ID **${fishId}** tidak ada di inventory!`);
    if (aqua.length >= 20) return respond(`> ${EMOJI} ❌ Aquarium penuh! Maksimal **20 ikan**.`);
    const fish = inv[fishIdx];
    if (fish.rarity === 'trash') return respond(`> ${EMOJI} ❌ Tidak bisa simpan sampah di aquarium! 🗑️`);
    inv.splice(fishIdx, 1);
    aqua.push({ ...fish, addedToAquariumAt: Date.now() });
    await Promise.all([
      env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
      env.USERS_KV.put(`fishing:aquarium:${discordId}`, JSON.stringify(aqua)),
    ]);
    return respond([
      `> ${EMOJI} 🐠 **${fish.name}** berhasil dipindah ke aquarium!`,
      `> 🐠 Aquarium: **${aqua.length}/20** | Inventory: **${inv.length}/30**`,
      `> 💡 Lihat gambar: \`/aquarium info id:${fish.id}\``
    ].join('\n'));
  }

  if (sub === 'remove') {
    if (!fishId) return respond(`> ${EMOJI} ❌ Masukkan ID ikan!`);
    const [invRaw, aquaRaw] = await Promise.all([
      env.USERS_KV.get(`fishing:inventory:${discordId}`),
      env.USERS_KV.get(`fishing:aquarium:${discordId}`),
    ]);
    const inv  = invRaw  ? JSON.parse(invRaw)  : [];
    const aqua = aquaRaw ? JSON.parse(aquaRaw) : [];
    const fishIdx = aqua.findIndex(f => f.id === fishId);
    if (fishIdx === -1) return respond(`> ${EMOJI} ❌ Ikan ID **${fishId}** tidak ada di aquarium!`);
    if (inv.length >= 30) return respond(`> ${EMOJI} ❌ Inventory penuh! Jual dulu beberapa ikan.`);
    const fish = aqua[fishIdx];
    aqua.splice(fishIdx, 1);
    inv.push(fish);
    await Promise.all([
      env.USERS_KV.put(`fishing:inventory:${discordId}`, JSON.stringify(inv)),
      env.USERS_KV.put(`fishing:aquarium:${discordId}`, JSON.stringify(aqua)),
    ]);
    return respond([
      `> ${EMOJI} 🎒 **${fish.name}** dikembalikan ke inventory!`,
      `> 🐠 Aquarium: **${aqua.length}/20** | Inventory: **${inv.length}/30**`
    ].join('\n'));
  }

  if (sub === 'view' || sub === 'info') {
    waitUntil((async () => {
      try {

        if (sub === 'view') {
          const aquaRaw = await env.USERS_KV.get(`fishing:aquarium:${targetId}`);
          const aqua    = aquaRaw ? JSON.parse(aquaRaw) : [];

          if (aqua.length === 0) {
            return await editMsg([
              `> ${EMOJI} 🐠 Aquarium **${targetName}** masih kosong!`,
              `> 💡 Tambah ikan dengan \`/aquarium add id:FISH-xxx\``
            ].join('\n'));
          }

          const totalValue = aqua.reduce((s, f) => s + (f.price || 0), 0);
          const sorted = [...aqua].sort((a, b) =>
            (RARITY[b.rarity]?.basePrice || 0) - (RARITY[a.rarity]?.basePrice || 0)
          );
          const rows = sorted.map((f, i) => {
            const r   = RARITY[f.rarity];
            const age = Math.floor((Date.now() - f.caughtAt) / 86400000);
            return `${String(i + 1).padStart(2)}. ${f.emoji || '🐟'} **${f.name}** ${r?.name || ''} — ${f.weightKg}kg — ${age}h lalu`;
          }).join('\n');

          const bestFish = sorted[0];
          let thumbUrl = bestFish?.imageUrl || null;
          if (!thumbUrl && bestFish?.scientificName) {
            thumbUrl = await fetchFishImage(bestFish.scientificName);
          }

          const aquaDesc = [
            '```ansi',
            '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
            `\u001b[2;34m║  \u001b[1;36m🐠  AQUARIUM ${targetName.slice(0, 12).padEnd(12)}  🐠\u001b[0m \u001b[2;34m║\u001b[0m`,
            '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            rows,
            '',
            `> 🐠 **${aqua.length}/20** ikan | Nilai Koleksi: 🪙 **${totalValue.toLocaleString()}**`,
            `> 💡 \`/aquarium info id:FISH-xxx\` untuk lihat detail & gambar ikan`
          ].join('\n');

          return await editMsg('', [{
            color: 0x00BFFF,
            description: aquaDesc,
            thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
            footer: { text: `OwoBim Aquarium • ${targetName}` },
            timestamp: new Date().toISOString()
          }]);
        }

        if (sub === 'info') {
          if (!fishId) return await editMsg(`> ${EMOJI} ❌ Masukkan ID ikan! Cek \`/aquarium view\``);

          const [aquaRaw, invRaw] = await Promise.all([
            env.USERS_KV.get(`fishing:aquarium:${targetId}`),
            env.USERS_KV.get(`fishing:inventory:${targetId}`),
          ]);
          const aqua = aquaRaw ? JSON.parse(aquaRaw) : [];
          const inv  = invRaw  ? JSON.parse(invRaw)  : [];

          const fish = aqua.find(f => f.id === fishId) || inv.find(f => f.id === fishId);
          if (!fish) return await editMsg(`> ${EMOJI} ❌ Ikan ID **${fishId}** tidak ditemukan!`);

          const r = RARITY[fish.rarity];

          let imgUrl = fish.imageUrl || null;
          if (!imgUrl && fish.scientificName) {
            imgUrl = await fetchFishImage(fish.scientificName);
          }

          // FIX: Pakai getSafeRod untuk display rod name
          const rodDisplay = FISHING_RODS[fish.rodUsed]?.name || fish.rodUsed || '-';

          const infoLines = [
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━ 🐟 DETAIL IKAN ━━━━━━━━━━\u001b[0m',
            `\u001b[1;36m  ${fish.emoji || '🐟'}  Nama       :\u001b[0m \u001b[1;37m${fish.name}\u001b[0m`,
            fish.scientificName ? `\u001b[1;36m  🔬  Ilmiah    :\u001b[0m \u001b[2;37m${fish.scientificName}\u001b[0m` : null,
            `\u001b[1;36m  ⭐  Rarity    :\u001b[0m ${r?.color || ''}${r?.name || fish.rarity}\u001b[0m`,
            `\u001b[1;36m  ⚖️  Berat     :\u001b[0m \u001b[0;37m${fish.weightKg} kg\u001b[0m`,
            `\u001b[1;36m  🌍  Habitat   :\u001b[0m \u001b[0;37m${fish.habitat || 'unknown'}\u001b[0m`,
            `\u001b[1;36m  💰  Nilai     :\u001b[0m \u001b[1;32m🪙 ${fish.price.toLocaleString()}\u001b[0m`,
            `\u001b[1;36m  📍  Lokasi    :\u001b[0m \u001b[0;37m${fish.location || 'unknown'}\u001b[0m`,
            `\u001b[1;36m  🎣  Rod       :\u001b[0m \u001b[0;37m${rodDisplay}\u001b[0m`,
            fish.baitUsed ? `\u001b[1;36m  🪱  Bait      :\u001b[0m \u001b[0;37m${FISHING_BAITS[fish.baitUsed]?.name || fish.baitUsed}\u001b[0m` : null,
            `\u001b[1;36m  👤  Ditangkap :\u001b[0m \u001b[0;37m${fish.caughtBy || 'Unknown'}\u001b[0m`,
            `\u001b[1;36m  📅  Tanggal   :\u001b[0m \u001b[0;37m${new Date(fish.caughtAt).toLocaleDateString('id-ID')}\u001b[0m`,
            `\u001b[1;36m  🆔  ID        :\u001b[0m \u001b[2;37m${fish.id}\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```'
          ].filter(Boolean).join('\n');

          return await editMsg('', [{
            color: fish.rarity === 'mythic'    ? 0x00FFFF :
                   fish.rarity === 'legendary' ? 0xFFD700 :
                   fish.rarity === 'epic'      ? 0xAA00FF :
                   fish.rarity === 'rare'      ? 0x0099FF :
                   fish.rarity === 'uncommon'  ? 0x00CC44 : 0xAAAAAA,
            description: infoLines,
            image: imgUrl ? { url: imgUrl } : undefined,
            footer: { text: `OwoBim Aquarium • ${fish.id}` },
            timestamp: new Date().toISOString()
          }]);
        }

      } catch (err) {
        try { await editMsg(`> ❌ Error: \`${err.message}\``); } catch (_) {}
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return respond(`> ❌ Aksi tidak dikenal! Gunakan: \`view\`, \`add\`, \`remove\`, \`info\``);
}


// ══════════════════════════════════════════════════════════════
// CMD: fish-leaderboard — top fisher
// ══════════════════════════════════════════════════════════════
if (cmd === 'fish-leaderboard') {
  const EMOJI  = '<a:GifOwoBim:1492599199038967878>';
  const filter = getOption(options, 'filter') || 'catch';

  const { keys } = await env.USERS_KV.list({ prefix: 'fishing:stats:' });

  const allStats = [];
  for (const key of keys) {
    const raw = await env.USERS_KV.get(key.name);
    if (!raw) continue;
    const s   = JSON.parse(raw);
    const uid = key.name.replace('fishing:stats:', '');
    allStats.push({ ...s, discordId: uid });
  }

  let sorted, title;
  if (filter === 'value') {
    sorted = allStats.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
    title  = '💰 Top Fisher by Nilai Tangkapan';
  } else if (filter === 'legendary') {
    sorted = allStats.sort((a, b) => ((b.byRarity?.legendary || 0) + (b.byRarity?.mythic || 0)) - ((a.byRarity?.legendary || 0) + (a.byRarity?.mythic || 0)));
    title  = '🟡 Top Fisher Legendary Catches';
  } else {
    sorted = allStats.sort((a, b) => (b.totalCatch || 0) - (a.totalCatch || 0));
    title  = '🎣 Top Fisher by Total Tangkapan';
  }

  const medals   = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const top10    = sorted.slice(0, 10);

  const myRank = sorted.findIndex(s => s.discordId === discordId) + 1;
  const myStats = sorted.find(s => s.discordId === discordId);

  const rows = top10.map((s, i) => {
    const valueStr = filter === 'value'
      ? `🪙 ${(s.totalValue || 0).toLocaleString()}`
      : filter === 'legendary'
      ? `🟡 ${(s.byRarity?.legendary || 0)}x Leg. | 🌌 ${(s.byRarity?.mythic || 0)}x Myth.`
      : `🎣 ${s.totalCatch || 0}x tangkap`;

    const bigFish = s.biggestFish ? `| Terbesar: **${s.biggestFish.name}** ${s.biggestFish.weightKg}kg` : '';
    return `${medals[i]} <@${s.discordId}> — ${valueStr} ${bigFish}`;
  }).join('\n');

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    `\u001b[2;34m║  \u001b[1;33m🏆  FISH LEADERBOARD  🏆\u001b[0m          \u001b[2;34m║\u001b[0m`,
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} **${title}**`,
    '',
    rows || '> Belum ada data.',
    '',
    myStats
      ? `> 👤 **Rank kamu: #${myRank}** | Catch: ${myStats.totalCatch || 0} | Nilai: 🪙 ${(myStats.totalValue || 0).toLocaleString()}`
      : `> 👤 Kamu belum pernah mancing! Coba \`/fishing\``,
    `> Filter: \`catch\` | \`value\` | \`legendary\``
  ].join('\n'));
}


// ══════════════════════════════════════════════════════════════
// CMD: fish-stats — statistik mancing pribadi
// ══════════════════════════════════════════════════════════════
if (cmd === 'fish-stats') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  const targetOpt  = options.find(o => o.name === 'user');
  const targetId   = targetOpt ? String(targetOpt.value) : discordId;
  const targetUser = targetOpt
    ? interaction.data.resolved?.users?.[targetId]
    : (interaction.member?.user || interaction.user);
  const targetName = targetUser?.username || 'Unknown';

  const [statsRaw, rodRaw, baitRaw, invRaw, aquaRaw] = await Promise.all([
    env.USERS_KV.get(`fishing:stats:${targetId}`),
    env.USERS_KV.get(`fishing:rod:${targetId}`),
    env.USERS_KV.get(`fishing:bait:${targetId}`),
    env.USERS_KV.get(`fishing:inventory:${targetId}`),
    env.USERS_KV.get(`fishing:aquarium:${targetId}`),
  ]);

  const stats = statsRaw ? JSON.parse(statsRaw) : { totalCast: 0, totalCatch: 0, totalValue: 0, biggestFish: null, byRarity: {} };
  // FIX: Pakai getSafeRod
  const rod   = getSafeRod(rodRaw);
  const baits = baitRaw ? JSON.parse(baitRaw) : {};
  const inv   = invRaw ? JSON.parse(invRaw) : [];
  const aqua  = aquaRaw ? JSON.parse(aquaRaw) : [];

  // FIX: Pastikan byRarity ada
  if (!stats.byRarity) stats.byRarity = {};

  const catchRate = stats.totalCast > 0 ? ((stats.totalCatch / stats.totalCast) * 100).toFixed(1) : '0.0';

  const rarityBreakdown = Object.entries(RARITY)
    .filter(([k]) => k !== 'trash')
    .map(([k, v]) => `${v.color}${v.name}\u001b[0m: ${stats.byRarity?.[k] || 0}x`)
    .join(' | ');

  const baitSummary = Object.entries(baits)
    .map(([id, qty]) => `${FISHING_BAITS[id]?.emoji || ''} ${FISHING_BAITS[id]?.name || id}: ${qty}x`)
    .join(', ') || 'Tidak ada';

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    `\u001b[2;34m║  \u001b[1;33m📊  FISHING STATS  📊\u001b[0m             \u001b[2;34m║\u001b[0m`,
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `${EMOJI} 🎣 **Statistik Mancing ${targetName}**`,
    '```ansi',
    '\u001b[1;33m━━━━━━━━━━━━ 🎣 FISHING ━━━━━━━━━━━━━━\u001b[0m',
    `\u001b[1;36m  🎯  Total Cast      :\u001b[0m \u001b[0;37m${stats.totalCast}x\u001b[0m`,
    `\u001b[1;36m  🐟  Total Catch     :\u001b[0m \u001b[0;37m${stats.totalCatch}x\u001b[0m`,
    `\u001b[1;36m  📈  Catch Rate      :\u001b[0m \u001b[0;37m${catchRate}%\u001b[0m`,
    `\u001b[1;36m  💰  Total Nilai     :\u001b[0m \u001b[1;32m🪙 ${(stats.totalValue || 0).toLocaleString()}\u001b[0m`,
    stats.biggestFish
      ? `\u001b[1;36m  🏆  Terbesar        :\u001b[0m \u001b[0;37m${stats.biggestFish.name} (${stats.biggestFish.weightKg}kg) ${RARITY[stats.biggestFish.rarity]?.name || ''}\u001b[0m`
      : null,
    '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;32m━━━━━━━━━━━━ ⭐ RARITY ━━━━━━━━━━━━━━\u001b[0m',
    `\u001b[0;37m  ${rarityBreakdown}\u001b[0m`,
    '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '\u001b[1;35m━━━━━━━━━━━━ 🎒 INVENTARIS ━━━━━━━━━━\u001b[0m',
    `\u001b[1;36m  🎣  Rod Aktif       :\u001b[0m \u001b[0;37m${rod.name}\u001b[0m`,
    `\u001b[1;36m  🪱  Bait Stok       :\u001b[0m \u001b[0;37m${baitSummary}\u001b[0m`,
    `\u001b[1;36m  🎒  Inventory       :\u001b[0m \u001b[0;37m${inv.length}/30 ikan\u001b[0m`,
    `\u001b[1;36m  🐠  Aquarium        :\u001b[0m \u001b[0;37m${aqua.length}/20 ikan\u001b[0m`,
    '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '```',
  ].filter(Boolean).join('\n'));
}






if (cmd === 'buycowoncy') {
  try {
    const dmCh = await (await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: discordId })
    })).json();

    if (!dmCh.id) throw new Error('Gagal buka DM');

    await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        embeds: [{
          color: 0xF1C40F,
          title: '🪙 OwoBim Shop — Beli Cowoncy',
          description: [
            '```ansi',
            '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;33m║  🛒  PILIH PAKET COWONCY  🛒        ║\u001b[0m',
            '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━ 📦 PAKET TERSEDIA ━━━━━━━\u001b[0m',
            '\u001b[1;36m 🥉  Starter  :\u001b[0m \u001b[0;37m800 cowoncy — Rp 5.000\u001b[0m',
            '\u001b[1;36m 🥈  Basic    :\u001b[0m \u001b[0;37m5.000 cowoncy — Rp 30.000\u001b[0m',
            '\u001b[1;36m 🥇  Premium  :\u001b[0m \u001b[0;37m12.000 cowoncy — Rp 50.000\u001b[0m',
            '\u001b[1;36m 💎  Ultimate :\u001b[0m \u001b[0;37m25.000 cowoncy — Rp 150.000\u001b[0m',
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            '> 👇 Klik tombol di bawah untuk memilih paket!'
          ].join('\n'),
          footer: { text: 'OwoBim Shop • Pembayaran via Transfer Bank' }
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 1, label: '🥉 Starter — Rp 5.000',    custom_id: `buy_cowoncy:starter:${discordId}`  },
            { type: 2, style: 1, label: '🥈 Basic — Rp 30.000',     custom_id: `buy_cowoncy:basic:${discordId}`    },
            { type: 2, style: 3, label: '🥇 Premium — Rp 50.000',   custom_id: `buy_cowoncy:premium:${discordId}`  },
            { type: 2, style: 4, label: '💎 Ultimate — Rp 150.000', custom_id: `buy_cowoncy:ultimate:${discordId}` }
          ]
        }]
      })
    });

    return respond([
      '```ansi',
      '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[1;32m║  ✅  CEK DM KAMU!  ✅               ║\u001b[0m',
      '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      '> 📬 Info pembelian sudah dikirim ke **DM** kamu!',
      '> 🔒 Transaksi dilakukan secara **privat** di DM.'
    ].join('\n'));

  } catch (err) {
    return respond(`❌ Gagal kirim DM! Pastikan DM kamu terbuka.\n> \`${err.message}\``);
  }
}







    if (cmd === 'addcowoncy') {
  if (discordId !== '1442230317455900823') return respond('❌ Bukan pemilik bot!');

  const targetId = getOption(options, 'target');
  const jumlah   = parseInt(getOption(options, 'jumlah'));
  const orderId  = getOption(options, 'orderid') || null;

  if (!targetId || !jumlah || jumlah <= 0) return respond('❌ Target atau jumlah tidak valid!');

  const targetStr = await env.USERS_KV.get(`user:${targetId}`);
  if (!targetStr) return respond('❌ User belum punya akun!');

  let target = JSON.parse(targetStr);
  target.balance     += jumlah;
  target.totalEarned  = (target.totalEarned || 0) + jumlah;

  // Update order status + hapus order aktif
  const deletes = [env.USERS_KV.put(`user:${targetId}`, JSON.stringify(target))];

  if (orderId) {
    const orderRaw = await env.USERS_KV.get(`cowoncy_order:${orderId}`);
    if (orderRaw) {
      const order    = JSON.parse(orderRaw);
      order.status   = 'completed';
      order.approvedAt = Date.now();
      deletes.push(env.USERS_KV.put(`cowoncy_order:${orderId}`, JSON.stringify(order), { expirationTtl: 86400 * 7 }));
      // Hapus flag order aktif
      deletes.push(env.USERS_KV.delete(`cowoncy_order_active:${targetId}`));
    }
  }

  await Promise.all(deletes);
  waitUntil(pushLinkedRole(env, targetId, null, target));

  // Kirim DM notif ke buyer
  try {
    const dmCh = await (await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({ recipient_id: targetId })
    })).json();

    await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body: JSON.stringify({
        embeds: [{
          color: 0x2ECC71,
          title: '🎉 Cowoncy Berhasil Ditambahkan!',
          description: [
            '```ansi',
            '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
            '\u001b[1;32m║  🪙  PEMBAYARAN DIKONFIRMASI!  🪙   ║\u001b[0m',
            '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
            '```',
            '```ansi',
            '\u001b[1;33m━━━━━━━━━━━━ 📋 DETAIL ━━━━━━━━━━━━━━\u001b[0m',
            orderId ? `\u001b[1;36m 🆔  Order ID  :\u001b[0m \u001b[0;37m${orderId}\u001b[0m` : null,
            `\u001b[1;36m 🪙  Ditambah  :\u001b[0m \u001b[1;33m+${jumlah.toLocaleString('id-ID')} cowoncy\u001b[0m`,
            `\u001b[1;36m 💰  Saldo Baru:\u001b[0m \u001b[1;32m${target.balance.toLocaleString('id-ID')} cowoncy\u001b[0m`,
            '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```',
            '> ✅ Terima kasih sudah top up di **OwoBim Shop**!',
            '> 🪙 Selamat menikmati cowoncy kamu!'
          ].filter(Boolean).join('\n'),
          footer: { text: 'OwoBim Shop' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (_) {}

  return respond([
    '```ansi',
    '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[1;32m║  ✅  COWONCY BERHASIL DITAMBAH!      ║\u001b[0m',
    '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> 🪙 **+${jumlah.toLocaleString('id-ID')} cowoncy** ke <@${targetId}>`,
    `> 💰 Saldo baru: **${target.balance.toLocaleString('id-ID')}**`,
    orderId ? `> 🆔 Order: \`${orderId}\`` : null
  ].filter(Boolean).join('\n'));
}





    if (cmd === 'love') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
 
  const targetOption = options.find(o => o.name === 'target');
  const target2Id    = targetOption ? String(targetOption.value) : null;
 
  if (!target2Id) return respond('❌ Pilih user yang mau dicek love-nya!');
  if (target2Id === discordId) return respond('❌ Masa cek love sama diri sendiri! 💀');
 
  const user1Info = interaction.member?.user || interaction.user;
  const user2Info = interaction.data.resolved?.users?.[target2Id];
  if (!user2Info) return respond('❌ User tidak ditemukan!');
 
  // Persentase konsisten berdasarkan ID, atau random kalau user2 = bot
  const isRandom  = getOption(options, 'mode') === 'random';
  const seed      = [...(discordId + target2Id)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const lovePct   = isRandom ? Math.floor(Math.random() * 101) : seed % 101;
 
  const { msg, color, heart } = buildLoveResult(lovePct, user1Info.username, user2Info.username);
 
  const avatar1 = user1Info.avatar
    ? `https://cdn.discordapp.com/avatars/${user1Info.id}/${user1Info.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  const avatar2 = user2Info.avatar
    ? `https://cdn.discordapp.com/avatars/${user2Info.id}/${user2Info.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
 
  // Ship image dari popcat (sama kayak yang lo pake di /makequote dll)
  const shipUrl   = `https://api.popcat.xyz/ship?user1=${encodeURIComponent(avatar1)}&user2=${encodeURIComponent(avatar2)}`;
  const barFilled = Math.round(lovePct / 10);
 
  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: `${EMOJI} 💌 **${user1Info.username}** + **${user2Info.username}** = **${lovePct}% Love** ${heart}`,
      embeds: [{
        color,
        description: [
          msg,
          '',
          `> ${'❤️'.repeat(barFilled)}${'🖤'.repeat(10 - barFilled)} **${lovePct}%**`,
          '',
          '```ansi',
          '\u001b[1;35m━━━━━━━━━━ 💕 DETAIL ━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m 👤  User 1   :\u001b[0m \u001b[0;37m${user1Info.username}\u001b[0m`,
          `\u001b[1;36m 👤  User 2   :\u001b[0m \u001b[0;37m${user2Info.username}\u001b[0m`,
          `\u001b[1;36m 💖  Love     :\u001b[0m \u001b[1;35m${lovePct}%\u001b[0m`,
          `\u001b[1;36m 🎯  Status   :\u001b[0m \u001b[0;37m${getLoveStatus(lovePct)}\u001b[0m`,
          '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```'
        ].join('\n'),
        image: { url: shipUrl },
        footer: { text: 'OwoBim Love Calculator 💕 • /love target:@user' },
        timestamp: new Date().toISOString()
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: '🎲 Random',       custom_id: `love_random:${discordId}:${target2Id}` },
          { type: 2, style: 2, label: '🔄 Change User',  custom_id: `love_change:${discordId}` },
          { type: 2, style: 3, label: '💍 Propose?',     custom_id: `love_propose:${discordId}:${target2Id}` },
          { type: 2, style: 5, label: '📊 Custom Results', url: 'https://owo.kraxx.my.id' }
        ]
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}





if (cmd === 'download') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const url   = getOption(options, 'url');

  if (!url || url.trim() === '') {
    return respond(`> ${EMOJI} ❌ Masukkan URL video!`);
  }

  // Deteksi platform
  const isTikTok = url.includes('tiktok.com') || url.includes('vm.tiktok.com');

  if (!isTikTok) {
    return respond([
      `> ${EMOJI} ❌ URL tidak didukung!`,
      `> 💡 Yang didukung:`,
      `> • TikTok: \`https://www.tiktok.com/@user/video/...\``
    ].join('\n'));
  }

  // Cooldown 15 detik per user
  const cdKey  = `download_cd:${discordId}`;
  const lastDl = await env.USERS_KV.get(cdKey);
  if (lastDl) {
    const sisa = 15000 - (Date.now() - parseInt(lastDl));
    if (sisa > 0) {
      return respond(`> ${EMOJI} ⏳ Cooldown! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.`);
    }
  }
  await env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 60 });

  // Return defer DULU ke Discord
  const deferResponse = new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });

  waitUntil((async () => {

    const editMsg = async (content) => {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, components: [] })
      });
    };

    const editMsgWithButtons = async (content, buttons) => {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          components: [{ type: 1, components: buttons }]
        })
      });
    };

    try {
      let videoUrl = null;
      let thumbUrl = null;
      let title    = 'Video';
      let author   = 'Unknown';
      let duration = 0;
      const platform = 'TikTok';

      // ══════════════════════════════════════════════════
      // TIKTOK — Chain: tikwm → RapidAPI → cobalt.tools
      // ══════════════════════════════════════════════════

      // [1] Coba tikwm.com dulu
      try {
        const res  = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0'
          },
          body: new URLSearchParams({ url, hd: '1' })
        });
        const data = await res.json();
        if (data.code === 0 && data.data) {
          const d = data.data;
          const candidates = [d.hdplay, d.play, d.wmplay].filter(u =>
            u &&
            !u.includes('music') &&
            !u.includes('audio_mpeg') &&
            !u.includes('ies-music') &&
            !u.includes('mime_type=audio')
          );
          if (candidates.length > 0) {
            videoUrl = candidates[0];
            thumbUrl = d.cover || d.origin_cover;
            title    = d.title || 'TikTok Video';
            author   = d.author?.nickname || d.author?.unique_id || 'Unknown';
            duration = d.duration || 0;
          }
        }
      } catch (_) {}

      // [2] Fallback ke RapidAPI
      if (!videoUrl && env.RAPIDAPI_KEY) {
        try {
          const res  = await fetch(
            `https://tiktok-video-no-watermark2.p.rapidapi.com/?url=${encodeURIComponent(url)}&hd=1`,
            {
              headers: {
                'X-RapidAPI-Key':  env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'tiktok-video-no-watermark2.p.rapidapi.com'
              }
            }
          );
          const data = await res.json();
          if (data.data) {
            const d = data.data;
            const candidates = [d.hdplay, d.play, d.wmplay].filter(u =>
              u &&
              !u.includes('music') &&
              !u.includes('audio_mpeg') &&
              !u.includes('ies-music') &&
              !u.includes('mime_type=audio')
            );
            if (candidates.length > 0) {
              videoUrl = candidates[0];
              thumbUrl = d.cover || null;
              title    = d.title || 'TikTok Video';
              author   = d.author?.nickname || 'Unknown';
              duration = d.duration || 0;
            }
          }
        } catch (_) {}
      }

      // [3] Fallback ke cobalt.tools
      if (!videoUrl) {
        try {
          const res  = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              url,
              videoQuality: '720',
              filenameStyle: 'pretty',
              disableTTWatermark: true
            })
          });
          const data = await res.json();
          if ((data.status === 'stream' || data.status === 'redirect') && data.url) {
            videoUrl = data.url;
            title    = 'TikTok Video';
            author   = 'TikTok';
          } else if (data.status === 'picker' && data.picker?.[0]?.url) {
            videoUrl = data.picker[0].url;
            title    = 'TikTok Video';
          }
        } catch (_) {}
      }

      if (!videoUrl) {
        return await editMsg([
          `> ${EMOJI} ❌ Gagal download TikTok!`,
          `> 💡 Semua API sedang limit. Coba lagi besok atau gunakan URL lain.`,
          `> 🔄 *Tip: Tambahkan \`RAPIDAPI_KEY\` di Cloudflare env untuk fallback ekstra.*`
        ].join('\n'));
      }

      // ══════════════════════════════
      // CEK UKURAN FILE (pakai Range)
      // ══════════════════════════════
      let fileSize = 'Unknown';
      let fileSizeBytes = 0;
      try {
        const headRes = await fetch(videoUrl, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-0' }
        });
        const contentRange = headRes.headers.get('content-range');
        if (contentRange) {
          fileSizeBytes = parseInt(contentRange.split('/')[1]);
        }
        if (!fileSizeBytes) {
          const cl = headRes.headers.get('content-length');
          if (cl) fileSizeBytes = parseInt(cl);
        }
        if (fileSizeBytes && !isNaN(fileSizeBytes)) {
          fileSize = `${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB`;
        }
      } catch (_) {}

      // Format durasi
      const fmtDur = (sec) => {
        if (!sec) return 'N/A';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
      };

      const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      // ══════════════════════════════════════════
      // KIRIM HASIL + TOMBOL DOWNLOAD & THUMBNAIL
      // ══════════════════════════════════════════
      const buttons = [
        { type: 2, style: 5, label: '⬇️ Download Video', url: videoUrl }
      ];
      if (thumbUrl) {
        buttons.push({ type: 2, style: 5, label: '🖼️ Thumbnail', url: thumbUrl });
      }
      buttons.push({ type: 2, style: 5, label: '🔗 Sumber', url: url });

      const content = [
        '```ansi',
        '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
        `\u001b[2;34m║  \u001b[1;33m⬇️  VIDEO DOWNLOADER  ⬇️\u001b[0m          \u001b[2;34m║\u001b[0m`,
        '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `${EMOJI} ✅ **Berhasil download ${platform}!**`,
        '',
        '```ansi',
        '\u001b[1;33m━━━━━━━━━━━━ 📋 INFO VIDEO ━━━━━━━━━━━\u001b[0m',
        `\u001b[1;36m 🎬  Platform  :\u001b[0m \u001b[0;37m${platform}\u001b[0m`,
        `\u001b[1;36m 📝  Judul     :\u001b[0m \u001b[0;37m${title.slice(0, 50)}${title.length > 50 ? '...' : ''}\u001b[0m`,
        `\u001b[1;36m 👤  Author    :\u001b[0m \u001b[0;37m${author}\u001b[0m`,
        duration ? `\u001b[1;36m ⏱️  Durasi    :\u001b[0m \u001b[0;37m${fmtDur(duration)}\u001b[0m` : null,
        `\u001b[1;36m 📦  Ukuran    :\u001b[0m \u001b[0;37m${fileSize}\u001b[0m`,
        `\u001b[1;36m 🕐  Waktu     :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
        '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
        '```',
        `> ⚠️ *Link berlaku sementara, segera download!*`,
        `> 🤖 *Powered by OwoBim Downloader* ${EMOJI}`
      ].filter(Boolean).join('\n');

      await editMsgWithButtons(content, buttons);

    } catch (err) {
      await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\`\n> Coba lagi atau pastikan URL valid.`);
    }
  })());

  return deferResponse;
}





// ==================== EMAIL OTP (FIXED VERSION) ====================
if (cmd === 'email-otp') {
  const randomId = Math.random().toString(36).substring(2, 15);
  // WAJIB lowercase supaya sinkron dengan Email Worker
  const tempEmail = `${randomId}@kraxx.my.id`.toLowerCase().trim();

  // 1. Simpan Sesi Utama
  await env.USERS_KV.put(`otp:${discordId}`, JSON.stringify({
    otp: "WAITING",
    email: tempEmail,
    createdAt: Date.now()
  }), { expirationTtl: 300 });

  // 2. Simpan Mapping Email ke Discord ID (PENTING!)
  await env.USERS_KV.put(`email_map:${tempEmail}`, discordId, { expirationTtl: 300 });

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  📧  EMAIL OTP (OWOBIM BOT)          ║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> 📬 **Email sementara kamu:** \`${tempEmail}\``,
    `> ⏳ **Status:** Menunggu OTP dari website...`,
    '',
    '### 💡 CARA KERJA',
    '> 1. Daftar di website menggunakan email di atas.',
    '> 2. **OTP AKAN DIKIRIM KE DM KAMU** secara otomatis oleh bot.',
    '> 3. Setelah terima DM, ketik command verifikasi di bawah.',
    '',
    '> Ketik: `/verify-otp kode:123456` untuk menyelesaikan.'
  ].join('\n'));
}

// ==================== VERIFY OTP (FIXED VERSION) ====================
if (cmd === 'verify-otp') {
  const inputOtp = options.find(opt => opt.name === 'kode')?.value;
  if (!inputOtp) return respond('❌ Contoh: `/verify-otp kode:123456`');

  const otpDataRaw = await env.USERS_KV.get(`otp:${discordId}`);
  if (!otpDataRaw) return respond('❌ Sesi OTP tidak ditemukan. Silahkan ketik `/email-otp` ulang.');

  let otpData;
  try {
    otpData = JSON.parse(otpDataRaw);
  } catch (e) {
    return respond('❌ Terjadi kesalahan data. Ulangi `/email-otp`.');
  }

  // Jika status masih WAITING
  if (otpData.otp === "WAITING") {
    return respond('⏳ OTP belum masuk ke sistem. Silahkan cek DM kamu atau tunggu sebentar.');
  }

  const elapsed = Date.now() - otpData.createdAt;
  if (elapsed > 5 * 60 * 1000) {
    await env.USERS_KV.delete(`otp:${discordId}`);
    return respond('⏰ Sesi kedaluwarsa (lebih dari 5 menit). Silahkan minta email baru.');
  }

  // Cek kecocokan OTP
  if (String(inputOtp).trim() === String(otpData.otp).trim()) {
    const finalEmail = otpData.email;
    // Hapus data dari KV agar bersih
    await env.USERS_KV.delete(`otp:${discordId}`);
    await env.USERS_KV.delete(`email_map:${finalEmail}`);
    
    return respond([
      '✅ **VERIFIKASI BERHASIL!**',
      `> 📧 Email: \`${finalEmail}\``,
      '> Selamat, kamu sudah terverifikasi.'
    ].join('\n'));
  }

  return respond('❌ Kode OTP salah! Silahkan periksa kembali kode yang dikirim ke DM kamu.');
}







    
// ══════════════════════════════════════════════════════════════════════
// CMD: imagine — AI Image Generator (FAST VERSION)
// Provider Chain: Pollinations.ai → Together AI → Hugging Face → Stability AI
// FIX: Pollinations langsung embed URL tanpa fetch/verifikasi (jauh lebih cepat!)
// Env vars: TOGETHER_API_KEY, HUGGINGFACE_API_KEY, STABILITY_API_KEY
// Cooldown: 60 detik per user
// ══════════════════════════════════════════════════════════════════════
if (cmd === 'imagine') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  const prompt    = getOption(options, 'prompt');
  const negPrompt = getOption(options, 'negative') || 'blurry, low quality, deformed, ugly, bad anatomy, watermark, text, nsfw';
  const ratio     = getOption(options, 'ratio') || '1:1';

  if (!prompt || prompt.trim() === '') {
    return respond(`> ${EMOJI} ❌ Masukkan prompt gambar!\n> 💡 Contoh: \`/imagine prompt:a beautiful sunset over ocean, ultra realistic\``);
  }

  if (prompt.length > 800) {
    return respond(`> ${EMOJI} ❌ Prompt terlalu panjang! Maksimal **800 karakter**. (kamu: **${prompt.length}**)`);
  }

  // ── Cooldown 60 detik per user ──
  const cdKey   = `imagine_cd:${discordId}`;
  const lastGen = await env.USERS_KV.get(cdKey);
  if (lastGen) {
    const sisa = 60000 - (Date.now() - parseInt(lastGen));
    if (sisa > 0) {
      return respond(`> ${EMOJI} ⏳ Cooldown! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.`);
    }
  }

  // ── Simpan cooldown DULU sebelum defer ──
  await env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 65 });

  // ── Resolve dimensi berdasarkan ratio ──
  const RATIO_MAP = {
    '1:1':  { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720  },
    '9:16': { width: 720,  height: 1280 },
    '4:3':  { width: 1024, height: 768  },
    '3:4':  { width: 768,  height: 1024 },
  };
  const dims = RATIO_MAP[ratio] || RATIO_MAP['1:1'];

  // ── Defer response ──
  waitUntil((async () => {

    const editMsg = async (content, embeds) => {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(embeds ? { content, embeds } : { content })
      });
    };

    const buildDesc = (prov, mdl) => {
      const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      return [
        '```ansi',
        '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[1;35m║  🎨  AI IMAGE GENERATOR  🎨         ║\u001b[0m',
        '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        '```ansi',
        '\u001b[1;33m━━━━━━━━━━━━ 📋 DETAIL ━━━━━━━━━━━━━━\u001b[0m',
        `\u001b[1;36m  ✍️  Prompt   :\u001b[0m \u001b[0;37m${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\u001b[0m`,
        `\u001b[1;36m  🤖  Provider :\u001b[0m \u001b[0;37m${prov}\u001b[0m`,
        `\u001b[1;36m  🧠  Model    :\u001b[0m \u001b[0;37m${mdl}\u001b[0m`,
        `\u001b[1;36m  📐  Rasio    :\u001b[0m \u001b[0;37m${ratio} (${dims.width}×${dims.height}px)\u001b[0m`,
        `\u001b[1;36m  👤  Dibuat   :\u001b[0m \u001b[0;37m${username}\u001b[0m`,
        `\u001b[1;36m  🕐  Waktu    :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
        '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
        '```',
      ].join('\n');
    };

    // ── Helper: kirim via URL (tanpa download, Discord yang load) ──
    const sendImageUrl = async (imgUrl, prov, mdl) => {
      await editMsg('', [{
        color:       0x9B59B6,
        title:       '🎨 AI Image Generated!',
        description: buildDesc(prov, mdl),
        image:       { url: imgUrl },
        footer:      { text: `OwoBim AI Image • ${prov} × ${mdl}` },
        timestamp:   new Date().toISOString(),
      }]);
    };

    // ── Helper: kirim via base64 upload ──
    const sendImageBase64 = async (imageBase64, prov, mdl) => {
      const base64Data = imageBase64.split(',')[1];
      const mimeType   = imageBase64.split(';')[0].split(':')[1] || 'image/png';
      const ext        = mimeType.includes('webp') ? 'webp' : 'png';
      const binaryStr  = atob(base64Data);
      const bytes      = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const filename = `owobim_imagine_${Date.now()}.${ext}`;
      const blob     = new Blob([bytes], { type: mimeType });
      const form     = new FormData();

      const payload = {
        content: '',
        embeds: [{
          color:       0x9B59B6,
          title:       '🎨 AI Image Generated!',
          description: buildDesc(prov, mdl),
          image:       { url: `attachment://${filename}` },
          footer:      { text: `OwoBim AI Image • ${prov} × ${mdl}` },
          timestamp:   new Date().toISOString(),
        }],
        attachments: [{ id: '0', filename }],
      };

      form.append('payload_json', JSON.stringify(payload));
      form.append('files[0]', blob, filename);

      const uploadRes = await fetch(
        `https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`,
        {
          method:  'PATCH',
          headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
          body:    form,
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        console.error('[IMAGINE] Discord upload error:', uploadRes.status, errText.slice(0, 300));
        throw new Error(`Discord upload failed: ${uploadRes.status}`);
      }
    };

    try {
      let success  = false;
      let provider = null;
      let model    = null;

      // ════════════════════════════════════════════════════════
      // [1] POLLINATIONS.AI — PRIMARY ⚡ PALING CEPAT
      // FIX: Langsung embed URL tanpa fetch sama sekali!
      // Discord yang akan load gambarnya sendiri.
      // ~1-3 detik response time
      // ════════════════════════════════════════════════════════
      if (!success) {
        try {
          const seed          = Math.floor(Math.random() * 999999);
          const safePrompt    = prompt.replace(/[^\w\s,.-]/g, ' ').trim();
          const encodedPrompt = encodeURIComponent(safePrompt);

          // Langsung kirim URL ke Discord — TANPA fetch/verifikasi
          // Pollinations sangat reliable, jarang gagal
          const pollinationsUrl = [
            `https://image.pollinations.ai/prompt/${encodedPrompt}`,
            `?width=${dims.width}`,
            `&height=${dims.height}`,
            `&seed=${seed}`,
            `&model=flux`,
            `&nologo=true`,
            `&enhance=true`,
            `&safe=false`,
          ].join('');

          await sendImageUrl(pollinationsUrl, 'Pollinations.ai', 'FLUX');
          provider = 'Pollinations.ai';
          model    = 'FLUX';
          success  = true;

        } catch (e) {
          console.error('[IMAGINE] Pollinations.ai exception:', e.message);
        }
      }

      // ════════════════════════════════════════════════════════
      // [2] TOGETHER AI — FALLBACK 1
      // ~5-15 detik
      // Butuh env: TOGETHER_API_KEY
      // ════════════════════════════════════════════════════════
      if (!success && env.TOGETHER_API_KEY) {
        try {
          const res = await fetch('https://api.together.xyz/v1/images/generations', {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${env.TOGETHER_API_KEY}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              model:           'black-forest-labs/FLUX.1-schnell-Free',
              prompt:          prompt,
              width:            dims.width,
              height:           dims.height,
              steps:            3,   // diperkecil dari 4 → 3 biar lebih cepat
              n:                1,
              response_format: 'b64_json',
            }),
            signal: AbortSignal.timeout(30000), // timeout diperkecil 50s → 30s
          });

          const json = await res.json();

          if (res.ok && json?.data?.[0]?.b64_json) {
            await sendImageBase64(
              `data:image/png;base64,${json.data[0].b64_json}`,
              'Together AI',
              'FLUX.1 Schnell'
            );
            provider = 'Together AI';
            model    = 'FLUX.1 Schnell';
            success  = true;
          } else {
            console.error('[IMAGINE] Together AI error:', res.status, JSON.stringify(json).slice(0, 200));
          }
        } catch (e) {
          console.error('[IMAGINE] Together AI exception:', e.message);
        }
      }

      // ════════════════════════════════════════════════════════
      // [3] HUGGING FACE — FALLBACK 2
      // ~15-40 detik (model perlu warm up)
      // Butuh env: HUGGINGFACE_API_KEY
      // ════════════════════════════════════════════════════════
      if (!success && env.HUGGINGFACE_API_KEY) {
        // Prioritas model yang lebih ringan & cepat
        const HF_MODELS = [
          { id: 'stabilityai/stable-diffusion-2-1', steps: 20 }, // paling cepat
          { id: 'stabilityai/stable-diffusion-xl-base-1.0', steps: 25 },
          { id: 'black-forest-labs/FLUX.1-dev', steps: 20 },
        ];

        for (const hfModel of HF_MODELS) {
          if (success) break;
          try {
            const hfWidth  = Math.min(dims.width,  1024);
            const hfHeight = Math.min(dims.height, 1024);

            const res = await fetch(
              `https://api-inference.huggingface.co/models/${hfModel.id}`,
              {
                method:  'POST',
                headers: {
                  'Authorization':    `Bearer ${env.HUGGINGFACE_API_KEY}`,
                  'Content-Type':     'application/json',
                  'x-wait-for-model': 'true',
                },
                body: JSON.stringify({
                  inputs: prompt,
                  parameters: {
                    negative_prompt:     negPrompt,
                    width:               hfWidth,
                    height:              hfHeight,
                    num_inference_steps: hfModel.steps,
                    guidance_scale:      7,
                  },
                }),
                signal: AbortSignal.timeout(40000), // 40 detik timeout per model
              }
            );

            if (res.ok) {
              const contentType = res.headers.get('content-type') || 'image/png';

              if (contentType.includes('application/json')) {
                const errJson = await res.json();
                console.error('[IMAGINE] HF JSON error:', JSON.stringify(errJson).slice(0, 200));
                continue;
              }

              if (!contentType.startsWith('image/')) {
                console.error('[IMAGINE] HF non-image response:', contentType);
                continue;
              }

              const buffer  = await res.arrayBuffer();
              const base64  = btoa(String.fromCharCode(...new Uint8Array(buffer)));
              const mdlName = hfModel.id.split('/').pop();

              await sendImageBase64(
                `data:${contentType};base64,${base64}`,
                'Hugging Face',
                mdlName
              );
              provider = 'Hugging Face';
              model    = mdlName;
              success  = true;

            } else {
              const errText = await res.text().catch(() => '');
              console.error(`[IMAGINE] HF ${hfModel.id} error:`, res.status, errText.slice(0, 150));
            }
          } catch (eInner) {
            console.error(`[IMAGINE] HF ${hfModel.id} exception:`, eInner.message);
          }
        }
      }

      // ════════════════════════════════════════════════════════
      // [4] STABILITY AI — FALLBACK 3 (berbayar, last resort)
      // Butuh env: STABILITY_API_KEY
      // ════════════════════════════════════════════════════════
      if (!success && env.STABILITY_API_KEY) {
        try {
          const formData = new FormData();
          formData.append('prompt',          prompt);
          formData.append('negative_prompt', negPrompt);
          formData.append('output_format',   'webp');
          formData.append('width',           String(dims.width));
          formData.append('height',          String(dims.height));
          formData.append('cfg_scale',       '7');
          formData.append('steps',           '25'); // dikurangi dari 30 → 25

          const res = await fetch(
            'https://api.stability.ai/v2beta/stable-image/generate/sd3',
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${env.STABILITY_API_KEY}`,
                'Accept':        'image/*',
              },
              body:   formData,
              signal: AbortSignal.timeout(45000),
            }
          );

          if (res.ok) {
            const contentType = res.headers.get('content-type') || 'image/webp';
            const buffer      = await res.arrayBuffer();
            const base64      = btoa(String.fromCharCode(...new Uint8Array(buffer)));

            await sendImageBase64(
              `data:${contentType};base64,${base64}`,
              'Stability AI',
              'SD 3.5 Large'
            );
            provider = 'Stability AI';
            model    = 'SD 3.5 Large';
            success  = true;
          } else {
            const errText = await res.text().catch(() => '');
            console.error('[IMAGINE] Stability AI error:', res.status, errText.slice(0, 200));
          }
        } catch (e) {
          console.error('[IMAGINE] Stability AI exception:', e.message);
        }
      }

      // ── Semua provider gagal ──
      if (!success) {
        await env.USERS_KV.delete(cdKey);
        return await editMsg([
          `> ${EMOJI} ❌ Semua provider gagal generate gambar!`,
          `> `,
          `> 💡 **Kemungkinan penyebab:**`,
          `> • Prompt mengandung konten yang diblokir`,
          `> • Quota API habis atau server sedang down`,
          `> • Coba prompt yang berbeda`,
          `> `,
          `> ⏳ Cooldown direset, silahkan coba lagi!`
        ].join('\n'));
      }

      // ── Update stats per user (background) ──
      try {
        const statsKey = `imagine_stats:${discordId}`;
        const statsRaw = await env.USERS_KV.get(statsKey);
        const stats    = statsRaw
          ? JSON.parse(statsRaw)
          : { total: 0, byProvider: {}, lastPrompt: null, lastAt: null };
        stats.total++;
        stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
        stats.lastPrompt = prompt.slice(0, 100);
        stats.lastAt     = Date.now();
        await env.USERS_KV.put(statsKey, JSON.stringify(stats), { expirationTtl: 86400 * 90 });
      } catch (_) {}

    } catch (err) {
      console.error('[IMAGINE] Fatal error:', err.message);
      await env.USERS_KV.delete(cdKey).catch(() => {});
      await editMsg([
        `> ${EMOJI} ❌ Terjadi error internal: \`${err.message}\``,
        `> ⏳ Cooldown direset, silahkan coba lagi.`
      ].join('\n'));
    }

  })());

  return new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
// ══════════════════════════════════════════════════════════════════════
// END OF CMD: imagine
// ══════════════════════════════════════════════════════════════════════






    if (cmd === 'nasa') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const sub   = getOption(options, 'aksi') || 'apod';

  const NASA_KEY = env.NASA_API_KEY || 'DEMO_KEY';

  const editMsg = async (content, embeds) => {
    await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embeds ? { content, embeds } : { content })
    });
  };

  // ══════════════════════════════════════════════
  // APOD — Astronomy Picture of the Day
  // ══════════════════════════════════════════════
  if (sub === 'apod') {
    const tanggal = getOption(options, 'tanggal') || null;
    const url = tanggal
      ? `https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}&date=${tanggal}`
      : `https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}`;

    waitUntil((async () => {
      try {
      // ✅ TAMBAH CACHE DI SINI — sebelum fetch
      let data;
      const today = new Date().toISOString().split('T')[0];

      // Cek cache, tapi hanya kalau tidak pakai tanggal custom
      if (!tanggal) {
        const cacheRaw = await env.USERS_KV.get('nasa_apod_cache');
        if (cacheRaw) {
          const cached = JSON.parse(cacheRaw);
          if (cached.date === today) {
            data = cached.data; // pakai cache, skip fetch
          }
        }
      }

      // Kalau tidak ada cache, baru fetch ke NASA
      if (!data) {
        const res = await fetch(url);
        data = await res.json();

        // Simpan cache 24 jam (hanya untuk APOD hari ini, bukan tanggal custom)
        if (!tanggal) {
          await env.USERS_KV.put('nasa_apod_cache', JSON.stringify({
            date: data.date,
            data: data
          }), { expirationTtl: 86400 });
        }
      }
      // ✅ SELESAI BAGIAN CACHE

        if (data.code || data.error) {
          return await editMsg(`> ${EMOJI} ❌ ${data.msg || data.error || 'Gagal ambil data APOD!'}`);
        }

        const isVideo   = data.media_type === 'video';
        const imageUrl  = isVideo ? null : data.url;
        const hdUrl     = data.hdurl || data.url;
        const desc      = data.explanation?.slice(0, 400) + (data.explanation?.length > 400 ? '...' : '') || 'Tidak ada deskripsi.';

        const lines = [
          '```ansi',
          '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[2;34m║  \u001b[1;33m🌌  ASTRONOMY PICTURE OF THE DAY  🌌\u001b[0m  \u001b[2;34m║\u001b[0m',
          '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📋 DETAIL ━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  📅  Tanggal  :\u001b[0m \u001b[0;37m${data.date}\u001b[0m`,
          `\u001b[1;36m  🎬  Tipe     :\u001b[0m \u001b[0;37m${isVideo ? '🎥 Video' : '🖼️ Gambar'}\u001b[0m`,
          data.copyright ? `\u001b[1;36m  ©️   Credit   :\u001b[0m \u001b[0;37m${data.copyright.trim()}\u001b[0m` : null,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 📖 *${desc}*`,
          isVideo ? `\n> 🎥 [Tonton Video](${data.url})` : null,
          !isVideo ? `\n> 🖼️ [HD Version](${hdUrl})` : null,
        ].filter(Boolean).join('\n');

        return await editMsg('', [{
          color: 0x0B3D91,
          title: `🌌 ${data.title}`,
          description: lines,
          image: imageUrl ? { url: imageUrl } : undefined,
          footer: { text: `NASA APOD • ${data.date}` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ══════════════════════════════════════════════
  // MARS — Mars Rover Photos
  // ══════════════════════════════════════════════
  if (sub === 'mars') {
    const rover  = getOption(options, 'rover') || 'curiosity';
    const camera = getOption(options, 'camera') || null;

    const ROVERS = ['curiosity', 'opportunity', 'spirit', 'perseverance'];
    if (!ROVERS.includes(rover.toLowerCase())) {
      return respond(`> ${EMOJI} ❌ Rover tidak valid! Pilih: \`curiosity\`, \`opportunity\`, \`spirit\`, \`perseverance\``);
    }

    waitUntil((async () => {
      try {
        let apiUrl = `https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/latest_photos?api_key=${NASA_KEY}`;
        if (camera) apiUrl += `&camera=${camera.toUpperCase()}`;

        const res  = await fetch(apiUrl);
        const data = await res.json();

        if (!data.latest_photos || data.latest_photos.length === 0) {
          return await editMsg([
            `> ${EMOJI} ❌ Tidak ada foto dari rover **${rover}**`,
            camera ? `> 📷 Camera **${camera}** mungkin tidak tersedia untuk rover ini.` : null,
            `> 💡 Coba tanpa filter camera atau ganti rover lain.`
          ].filter(Boolean).join('\n'));
        }

        const photos   = data.latest_photos;
        const photo    = photos[Math.floor(Math.random() * Math.min(photos.length, 10))];
        const roverInfo = photo.rover;

        const ROVER_COLORS = {
          curiosity:     0xFF4500,
          opportunity:   0xFFD700,
          spirit:        0xFF6347,
          perseverance:  0x00CED1
        };

        const lines = [
          '```ansi',
          '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[2;31m║  \u001b[1;31m🔴  MARS ROVER PHOTO  🔴\u001b[0m              \u001b[2;31m║\u001b[0m`,
          '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;31m━━━━━━━━━━━━ 🚀 INFO ROVER ━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🤖  Rover     :\u001b[0m \u001b[1;37m${roverInfo.name}\u001b[0m`,
          `\u001b[1;36m  📷  Camera    :\u001b[0m \u001b[0;37m${photo.camera.full_name}\u001b[0m`,
          `\u001b[1;36m  📅  Sol       :\u001b[0m \u001b[0;37m${photo.sol} (Mars Day)\u001b[0m`,
          `\u001b[1;36m  🗓️  Earthdate :\u001b[0m \u001b[0;37m${photo.earth_date}\u001b[0m`,
          `\u001b[1;36m  🔢  Photo #   :\u001b[0m \u001b[0;37m${photo.id}\u001b[0m`,
          `\u001b[1;36m  📊  Status    :\u001b[0m \u001b[0;37m${roverInfo.status.toUpperCase()}\u001b[0m`,
          `\u001b[1;36m  📸  Total     :\u001b[0m \u001b[0;37m${roverInfo.total_photos?.toLocaleString() || 'N/A'} foto\u001b[0m`,
          '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 🔗 [Lihat Full Size](${photo.img_src})`,
          `> 📦 Total foto tersedia: **${photos.length}** | Menampilkan foto acak`
        ].join('\n');

        return await editMsg('', [{
          color: ROVER_COLORS[rover] || 0xFF4500,
          title: `🔴 Mars — ${roverInfo.name} (Sol ${photo.sol})`,
          description: lines,
          image: { url: photo.img_src },
          footer: { text: `NASA Mars Rover • ${photo.earth_date}` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ══════════════════════════════════════════════
  // ASTEROID — Near Earth Objects
  // ══════════════════════════════════════════════
  if (sub === 'asteroid') {
    waitUntil((async () => {
      try {
        const today    = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        const res  = await fetch(
          `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${tomorrow}&api_key=${NASA_KEY}`
        );
        const data = await res.json();

        const asteroids = data.near_earth_objects?.[today] || [];
        if (asteroids.length === 0) {
          return await editMsg(`> ${EMOJI} ❌ Tidak ada data asteroid hari ini!`);
        }

        asteroids.sort((a, b) =>
          parseFloat(a.close_approach_data[0]?.miss_distance?.kilometers || 0) -
          parseFloat(b.close_approach_data[0]?.miss_distance?.kilometers || 0)
        );

        const top5 = asteroids.slice(0, 5);
        const dangerous = asteroids.filter(a => a.is_potentially_hazardous_asteroid).length;

        const rows = top5.map((a, i) => {
          const approach  = a.close_approach_data[0];
          const distKm    = parseFloat(approach?.miss_distance?.kilometers || 0);
          const distMoon  = parseFloat(approach?.miss_distance?.lunar || 0);
          const speedKmh  = parseFloat(approach?.relative_velocity?.kilometers_per_hour || 0);
          const sizeMin   = parseFloat(a.estimated_diameter?.kilometers?.estimated_diameter_min || 0).toFixed(3);
          const sizeMax   = parseFloat(a.estimated_diameter?.kilometers?.estimated_diameter_max || 0).toFixed(3);
          const hazard    = a.is_potentially_hazardous_asteroid;
          const medals    = ['🥇','🥈','🥉','4️⃣','5️⃣'];

          return [
            `${medals[i]} **${a.name}** ${hazard ? '☠️ BAHAYA!' : '✅ Aman'}`,
            `> 📏 Jarak: **${(distKm / 1000000).toFixed(2)}jt km** (${distMoon.toFixed(2)} lunar distance)`,
            `> ⚡ Kecepatan: **${Math.round(speedKmh).toLocaleString()} km/h**`,
            `> 📐 Ukuran: **${sizeMin} – ${sizeMax} km**`,
          ].join('\n');
        }).join('\n\n');

        const lines = [
          '```ansi',
          '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[1;33m║  ☄️   NEAR EARTH ASTEROIDS  ☄️       ║\u001b[0m',
          '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📊 RINGKASAN ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  ☄️   Total Hari Ini  :\u001b[0m \u001b[0;37m${asteroids.length} asteroid\u001b[0m`,
          `\u001b[1;36m  ☠️   Berbahaya       :\u001b[0m \u001b[1;31m${dangerous} asteroid\u001b[0m`,
          `\u001b[1;36m  ✅  Aman            :\u001b[0m \u001b[1;32m${asteroids.length - dangerous} asteroid\u001b[0m`,
          `\u001b[1;36m  📅  Tanggal         :\u001b[0m \u001b[0;37m${today}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          '**☄️ 5 Asteroid Terdekat:**',
          '',
          rows
        ].join('\n');

        return await editMsg('', [{
          color: dangerous > 0 ? 0xFF4500 : 0x2ECC71,
          title: `☄️ Near Earth Asteroids — ${today}`,
          description: lines,
          footer: { text: `NASA NeoWs • Data real-time` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ══════════════════════════════════════════════
  // EARTH — Foto Bumi dari Luar Angkasa (EPIC)
  // ══════════════════════════════════════════════
  if (sub === 'earth') {
    waitUntil((async () => {
      try {
        const res  = await fetch(`https://api.nasa.gov/EPIC/api/natural?api_key=${NASA_KEY}`);
        const data = await res.json();

        if (!data || data.length === 0) {
          return await editMsg(`> ${EMOJI} ❌ Tidak ada data foto EPIC tersedia!`);
        }

        const photo = data[0];
        const dateParts = photo.date.split(' ')[0].split('-');
        const imgUrl = `https://epic.gsfc.nasa.gov/archive/natural/${dateParts[0]}/${dateParts[1]}/${dateParts[2]}/png/${photo.image}.png`;

        const lines = [
          '```ansi',
          '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[2;34m║  \u001b[1;34m🌍  EARTH FROM SPACE (EPIC)  🌍\u001b[0m   \u001b[2;34m║\u001b[0m',
          '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;34m━━━━━━━━━━━━ 📋 INFO FOTO ━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🛸  Satelit  :\u001b[0m \u001b[0;37mDSCOVR (EPIC Camera)\u001b[0m`,
          `\u001b[1;36m  📅  Diambil  :\u001b[0m \u001b[0;37m${photo.date}\u001b[0m`,
          `\u001b[1;36m  📍  Posisi   :\u001b[0m \u001b[0;37mLat: ${photo.centroid_coordinates?.lat?.toFixed(2) || 'N/A'}° | Lon: ${photo.centroid_coordinates?.lon?.toFixed(2) || 'N/A'}°\u001b[0m`,
          `\u001b[1;36m  🌙  Jarak ke Bulan:\u001b[0m \u001b[0;37m${photo.lunar_j2000_position ? Object.values(photo.lunar_j2000_position).map(v => v.toFixed(0)).join(', ') : 'N/A'}\u001b[0m`,
          '\u001b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 🔗 [Lihat Full Resolution](${imgUrl})`,
          `> 📦 Total foto tersedia: **${data.length}**`
        ].join('\n');

        return await editMsg('', [{
          color: 0x1E90FF,
          title: '🌍 Earth — DSCOVR EPIC Camera',
          description: lines,
          image: { url: imgUrl },
          footer: { text: `NASA EPIC • ${photo.date}` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ══════════════════════════════════════════════
  // SEARCH — NASA Image & Video Library
  // ══════════════════════════════════════════════
  if (sub === 'search') {
    const query = getOption(options, 'query');
    if (!query) return respond(`> ${EMOJI} ❌ Masukkan kata kunci pencarian!\n> 💡 Contoh: \`/nasa aksi:search query:black hole\``);

    waitUntil((async () => {
      try {
        const res  = await fetch(
          `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=10`
        );
        const data = await res.json();

        const items = data.collection?.items || [];
        if (items.length === 0) {
          return await editMsg(`> ${EMOJI} ❌ Tidak ada hasil untuk **"${query}"**!\n> 💡 Coba kata kunci lain seperti: \`mars\`, \`galaxy\`, \`astronaut\``);
        }

        const item     = items[Math.floor(Math.random() * items.length)];
        const meta     = item.data?.[0] || {};
        const imgUrl   = item.links?.[0]?.href || null;
        const desc     = meta.description?.slice(0, 350) + (meta.description?.length > 350 ? '...' : '') || 'Tidak ada deskripsi.';

        const lines = [
          '```ansi',
          '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[2;35m║  \u001b[1;35m🔍  NASA IMAGE LIBRARY  🔍\u001b[0m          \u001b[2;35m║\u001b[0m',
          '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;35m━━━━━━━━━━━━ 📋 INFO ━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  🔍  Query      :\u001b[0m \u001b[0;37m${query}\u001b[0m`,
          `\u001b[1;36m  📅  Tanggal    :\u001b[0m \u001b[0;37m${meta.date_created?.split('T')[0] || 'N/A'}\u001b[0m`,
          meta.center ? `\u001b[1;36m  🏢  Center     :\u001b[0m \u001b[0;37m${meta.center}\u001b[0m` : null,
          meta.photographer ? `\u001b[1;36m  📷  Fotografer :\u001b[0m \u001b[0;37m${meta.photographer}\u001b[0m` : null,
          `\u001b[1;36m  📦  Total Hasil:\u001b[0m \u001b[0;37m${items.length} gambar\u001b[0m`,
          '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 📖 *${desc}*`,
        ].filter(Boolean).join('\n');

        return await editMsg('', [{
          color: 0x9B59B6,
          title: `🔍 ${meta.title?.slice(0, 80) || 'NASA Image'}`,
          description: lines,
          image: imgUrl ? { url: imgUrl } : undefined,
          footer: { text: `NASA Image Library • ID: ${meta.nasa_id || 'N/A'}` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ══════════════════════════════════════════════
  // PLANET — Info Planet Tata Surya
  // ══════════════════════════════════════════════
  if (sub === 'planet') {
    const nama = getOption(options, 'query')?.toLowerCase().trim();
    if (!nama) return respond(`> ${EMOJI} ❌ Masukkan nama planet!\n> 💡 Contoh: \`/nasa aksi:planet query:mars\``);

    const PLANETS = {
      mercury: { nama: 'Merkurius', emoji: '⚫', diameter: '4.879 km', jarak: '57.9 juta km dari Matahari', rotasi: '59 hari Bumi', orbit: '88 hari Bumi', suhu: '-180°C s/d 430°C', bulan: '0', fakta: 'Planet terkecil & terdekat dengan Matahari. Tidak punya atmosfer!', color: 0x808080 },
      venus:   { nama: 'Venus',     emoji: '🟡', diameter: '12.104 km', jarak: '108.2 juta km dari Matahari', rotasi: '243 hari Bumi', orbit: '225 hari Bumi', suhu: '465°C (terpanas!)', bulan: '0', fakta: 'Planet terpanas di tata surya meski bukan yang terdekat ke Matahari.', color: 0xFFD700 },
      earth:   { nama: 'Bumi',      emoji: '🌍', diameter: '12.742 km', jarak: '149.6 juta km dari Matahari', rotasi: '24 jam', orbit: '365.25 hari', suhu: '-88°C s/d 58°C', bulan: '1 (Bulan)', fakta: 'Satu-satunya planet yang diketahui memiliki kehidupan.', color: 0x1E90FF },
      mars:    { nama: 'Mars',      emoji: '🔴', diameter: '6.779 km', jarak: '227.9 juta km dari Matahari', rotasi: '24.6 jam', orbit: '687 hari Bumi', suhu: '-125°C s/d 20°C', bulan: '2 (Phobos & Deimos)', fakta: 'Planet Merah! Punya gunung tertinggi di tata surya: Olympus Mons (21.9 km).', color: 0xFF4500 },
      jupiter: { nama: 'Jupiter',   emoji: '🟠', diameter: '139.820 km', jarak: '778.5 juta km dari Matahari', rotasi: '9.9 jam', orbit: '11.9 tahun', suhu: '-110°C', bulan: '95 bulan', fakta: 'Planet terbesar! Great Red Spot-nya adalah badai yang sudah berlangsung 350+ tahun.', color: 0xFF8C00 },
      saturn:  { nama: 'Saturnus',  emoji: '🪐', diameter: '116.460 km', jarak: '1.43 miliar km dari Matahari', rotasi: '10.7 jam', orbit: '29.5 tahun', suhu: '-140°C', bulan: '146 bulan', fakta: 'Punya cincin spektakuler dari es & batu. Densitasnya lebih rendah dari air!', color: 0xDAA520 },
      uranus:  { nama: 'Uranus',    emoji: '🔵', diameter: '50.724 km', jarak: '2.87 miliar km dari Matahari', rotasi: '17.2 jam', orbit: '84 tahun', suhu: '-195°C', bulan: '28 bulan', fakta: 'Berputar miring 98°! Musimnya berlangsung selama 21 tahun.', color: 0x40E0D0 },
      neptune: { nama: 'Neptunus',  emoji: '🌊', diameter: '49.244 km', jarak: '4.5 miliar km dari Matahari', rotasi: '16.1 jam', orbit: '165 tahun', suhu: '-200°C', bulan: '16 bulan', fakta: 'Anginnya paling kencang di tata surya, mencapai 2.100 km/jam!', color: 0x1E90FF },
      pluto:   { nama: 'Pluto',     emoji: '⚪', diameter: '2.377 km', jarak: '5.9 miliar km dari Matahari', rotasi: '6.4 hari Bumi', orbit: '248 tahun', suhu: '-230°C', bulan: '5 bulan', fakta: 'Diklasifikasikan ulang sebagai planet kerdil sejak 2006. Tetap di hati kita! 💙', color: 0xA0A0A0 },
      sun:     { nama: 'Matahari',  emoji: '☀️', diameter: '1.39 juta km', jarak: '0 (pusat tata surya)', rotasi: '25-35 hari', orbit: 'N/A', suhu: '5.500°C (permukaan)', bulan: 'N/A', fakta: 'Mengandung 99.86% massa tata surya. Cahayanya butuh 8 menit sampai ke Bumi!', color: 0xFFD700 },
      moon:    { nama: 'Bulan',     emoji: '🌕', diameter: '3.474 km', jarak: '384.400 km dari Bumi', rotasi: '27.3 hari', orbit: '27.3 hari mengelilingi Bumi', suhu: '-173°C s/d 127°C', bulan: 'N/A', fakta: 'Satu-satunya benda langit selain Bumi yang pernah diinjak manusia (1969).', color: 0xC0C0C0 },
    };

    const ALIAS = {
      'merkurius': 'mercury', 'bumi': 'earth', 'saturnus': 'saturn',
      'neptunus': 'neptune', 'matahari': 'sun', 'bulan': 'moon',
      'mars': 'mars', 'jupiter': 'jupiter', 'uranus': 'uranus',
      'venus': 'venus', 'pluto': 'pluto', 'mercury': 'mercury',
      'earth': 'earth', 'saturn': 'saturn', 'neptune': 'neptune',
      'sun': 'sun', 'moon': 'moon'
    };

    const key    = ALIAS[nama] || nama;
    const planet = PLANETS[key];

    if (!planet) {
      return respond([
        `> ${EMOJI} ❌ Planet **"${nama}"** tidak ditemukan!`,
        `> 💡 Yang tersedia: \`mercury\`, \`venus\`, \`earth\`, \`mars\`, \`jupiter\`, \`saturn\`, \`uranus\`, \`neptune\`, \`pluto\`, \`sun\`, \`moon\``,
        `> 🇮🇩 Bahasa Indonesia juga bisa: \`mars\`, \`bumi\`, \`saturnus\`, \`bulan\`, dll`
      ].join('\n'));
    }

    // Ambil gambar dari NASA Image Library
    waitUntil((async () => {
      try {
        const searchQuery = planet.nama === 'Matahari' ? 'sun solar' : planet.nama;
        const res  = await fetch(
          `https://images-api.nasa.gov/search?q=${encodeURIComponent(searchQuery)}&media_type=image&page_size=20`
        );
        const data = await res.json();
        const items  = data.collection?.items || [];
        const item   = items[Math.floor(Math.random() * Math.min(items.length, 10))];
        const imgUrl = item?.links?.[0]?.href || null;

        const lines = [
          '```ansi',
          '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
          `\u001b[2;35m║  \u001b[1;33m🪐  PLANET INFO  🪐\u001b[0m                  \u001b[2;35m║\u001b[0m`,
          '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📋 DATA PLANET ━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  ${planet.emoji}  Nama      :\u001b[0m \u001b[1;37m${planet.nama}\u001b[0m`,
          `\u001b[1;36m  📏  Diameter  :\u001b[0m \u001b[0;37m${planet.diameter}\u001b[0m`,
          `\u001b[1;36m  📍  Jarak     :\u001b[0m \u001b[0;37m${planet.jarak}\u001b[0m`,
          `\u001b[1;36m  🔄  Rotasi    :\u001b[0m \u001b[0;37m${planet.rotasi}\u001b[0m`,
          `\u001b[1;36m  🌀  Orbit     :\u001b[0m \u001b[0;37m${planet.orbit}\u001b[0m`,
          `\u001b[1;36m  🌡️  Suhu      :\u001b[0m \u001b[0;37m${planet.suhu}\u001b[0m`,
          `\u001b[1;36m  🌙  Bulan     :\u001b[0m \u001b[0;37m${planet.bulan}\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 💡 **Fakta:** *${planet.fakta}*`
        ].join('\n');

        return await editMsg('', [{
          color: planet.color,
          title: `${planet.emoji} ${planet.nama} — Tata Surya`,
          description: lines,
          image: imgUrl ? { url: imgUrl } : undefined,
          footer: { text: `NASA × OwoBim Planet Info` },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        await editMsg(`> ${EMOJI} ❌ Error: \`${err.message}\``);
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
  }


  // ══════════════════════════════════════════════
  // INFO — Daftar semua fitur
  // ══════════════════════════════════════════════
  if (sub === 'info') {
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;33m🚀  NASA BOT COMMANDS  🚀\u001b[0m          \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━ 🌌 DAFTAR FITUR ━━━━━━━━━━\u001b[0m',
      '\u001b[1;36m 🌌  apod      :\u001b[0m \u001b[0;37mAstronomy Picture of the Day\u001b[0m',
      '\u001b[1;36m 🔴  mars      :\u001b[0m \u001b[0;37mFoto Mars dari Rover NASA\u001b[0m',
      '\u001b[1;36m ☄️   asteroid  :\u001b[0m \u001b[0;37mAsteroid yang mendekati Bumi\u001b[0m',
      '\u001b[1;36m 🌍  earth     :\u001b[0m \u001b[0;37mFoto Bumi dari luar angkasa\u001b[0m',
      '\u001b[1;36m 🔍  search    :\u001b[0m \u001b[0;37mCari gambar di NASA Library\u001b[0m',
      '\u001b[1;36m 🪐  planet    :\u001b[0m \u001b[0;37mInfo lengkap planet tata surya\u001b[0m',
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '\u001b[1;32m━━━━━━━━━━ 💡 CONTOH PENGGUNAAN ━━━━━\u001b[0m',
      '\u001b[0;37m /nasa aksi:apod\u001b[0m',
      '\u001b[0;37m /nasa aksi:apod tanggal:2024-01-01\u001b[0m',
      '\u001b[0;37m /nasa aksi:mars rover:perseverance\u001b[0m',
      '\u001b[0;37m /nasa aksi:asteroid\u001b[0m',
      '\u001b[0;37m /nasa aksi:earth\u001b[0m',
      '\u001b[0;37m /nasa aksi:search query:black hole\u001b[0m',
      '\u001b[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      '> 🌐 API: **API NASA** Powered OwoBim'
    ].join('\n'));
  }

  return respond(`> ❌ Aksi tidak dikenal! Ketik \`/nasa aksi:info\` untuk daftar command.`);
}



    




if (cmd === 'qr') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const text  = getOption(options, 'teks');
  const size  = getOption(options, 'ukuran') || '400';
  let warna   = (getOption(options, 'warna') || '5865F2').replace('#', '').toUpperCase();
  let bg      = (getOption(options, 'bg')    || '2B2D31').replace('#', '').toUpperCase();

  if (!text) return respond(`> ${EMOJI} ❌ Masukkan teks atau URL!`);
  if (text.length > 500) return respond(`> ${EMOJI} ❌ Maksimal **500 karakter**! Kamu: **${text.length}**`);

  const hexRegex = /^[0-9A-Fa-f]{6}$/;
  if (!hexRegex.test(warna)) warna = '5865F2';
  if (!hexRegex.test(bg))    bg    = '2B2D31';

  const validSizes = ['200', '300', '400', '500', '600'];
  const safeSize   = validSizes.includes(size) ? size : '400';

  const bgImage    = getOption(options, 'background');
  const CLOUDINARY = env.CLOUDINARY_CLOUD_NAME;
  const CLOUD_KEY  = env.CLOUDINARY_API_KEY;
  const CLOUD_SEC  = env.CLOUDINARY_API_SECRET;

  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // Base64url tanpa Buffer (aman untuk Cloudflare Workers)
  const toBase64url = (str) => btoa(unescape(encodeURIComponent(str)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  let finalUrl;
  let hasBg = false;

  if (bgImage && CLOUDINARY && CLOUD_KEY && CLOUD_SEC) {
    try {
      const cleanBg   = bgImage.split('?')[0];
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder    = 'qr_bg';

      // Signature Cloudinary: "folder=qr_bg&timestamp=xxxx" + API_SECRET
      // Harus diurutkan alphabetically
      const signPayload = `folder=${folder}&timestamp=${timestamp}${CLOUD_SEC}`;
      const encoder     = new TextEncoder();
      const cryptoKey   = await crypto.subtle.importKey(
        'raw',
        encoder.encode(CLOUD_SEC),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`folder=${folder}&timestamp=${timestamp}`));
      const signature = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Upload background ke Cloudinary
      const formData = new FormData();
      formData.append('file', cleanBg);
      formData.append('folder', folder);
      formData.append('invalidate', 'true');
     // Otomatis hapus setelah 1 hari (86400 detik)
      formData.append('eager_async', 'true');
      formData.append('timestamp', timestamp);
      formData.append('api_key', CLOUD_KEY);
      formData.append('signature', signature);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY}/image/upload`, {
        method: 'POST',
        body: formData
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.public_id) {
        throw new Error(uploadData.error?.message || 'Upload gagal');
      }

      const bgPublicId = uploadData.public_id;           // "qr_bg/abc123"
      const overlayId  = bgPublicId.replace(/\//g, ':'); // "qr_bg:abc123"

      const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}&color=000000&bgcolor=ffffff&format=png&ecc=H&margin=10`;
      const qrBase64 = toBase64url(qrUrl);

      // Final URL pakai uploaded public_id sebagai base, overlay QR di tengah
      finalUrl = `https://res.cloudinary.com/${CLOUDINARY}/image/upload/w_${safeSize},h_${safeSize},c_fill/l_fetch:${qrBase64},w_320,h_320,c_fit/fl_layer_apply,g_center/${bgPublicId}`;
      hasBg = true;

    } catch (e) {
      console.error('Cloudinary error:', e.message);
      // Fallback ke QR biasa
      finalUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&data=${encodeURIComponent(text)}&color=${warna}&bgcolor=${bg}&format=png&ecc=H&margin=10`;
    }
  } else {
    finalUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&data=${encodeURIComponent(text)}&color=${warna}&bgcolor=${bg}&format=png&ecc=H&margin=10`;
  }

  return new Response(JSON.stringify({
    type: 4,
    data: {
      embeds: [{
        color: parseInt(warna, 16),
        title: '📱 QR Code Generator',
        description: [
          '```ansi',
          '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
          '\u001b[2;34m║  \u001b[1;33m📱  QR CODE GENERATOR  📱\u001b[0m          \u001b[2;34m║\u001b[0m',
          '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
          '```',
          '```ansi',
          '\u001b[1;33m━━━━━━━━━━━━ 📋 INFO ━━━━━━━━━━━━━━━━\u001b[0m',
          `\u001b[1;36m  📝  Data       :\u001b[0m \u001b[0;37m${text.slice(0, 60)}${text.length > 60 ? '...' : ''}\u001b[0m`,
          `\u001b[1;36m  📏  Panjang    :\u001b[0m \u001b[0;37m${text.length} karakter\u001b[0m`,
          `\u001b[1;36m  📐  Ukuran     :\u001b[0m \u001b[0;37m${safeSize}x${safeSize}px\u001b[0m`,
          hasBg
            ? `\u001b[1;36m  🖼️  Background :\u001b[0m \u001b[1;32mCustom Image ✅\u001b[0m`
            : `\u001b[1;36m  🎨  Warna      :\u001b[0m \u001b[0;37m#${warna} / bg #${bg}\u001b[0m`,
          `\u001b[1;36m  🕐  Dibuat     :\u001b[0m \u001b[0;37m${waktu} WIB\u001b[0m`,
          '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
          '```',
          `> 🔗 [Download HD](${finalUrl})`,
          `> 🤖 *Powered by OwoBim QR Engine* ${EMOJI}`
        ].join('\n'),
        image:  { url: finalUrl },
        footer: { text: 'OwoBim QR Generator • Scan dengan kamera HP' },
        timestamp: new Date().toISOString()
      }]
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}








// ══════════════════════════════════════════════════════════════════════
// CMD: ai — AI Chat Engine + Premium Key System
// Provider: Groq llama-3.3-70b-versatile
// Env: GROQ_API_KEY, OWNER_ID (wajib)
// KV Keys:
//   aikey:{key}         → { duration, createdAt, used, usedBy, usedAt }
//   aipremium:{userId}  → { expiresAt, key, duration }
// ══════════════════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CMD: genkey-ai — Generate premium key (OWNER ONLY)            ║
// ╚══════════════════════════════════════════════════════════════════╝
if (cmd === 'genkey-ai') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  // ── Cek apakah user adalah owner ──
  if (discordId !== env.OWNER_ID) {
    return respond(`> ${EMOJI} ❌ Command ini hanya untuk **Owner Bot**!`);
  }

  const durasi  = parseInt(getOption(options, 'durasi') || '30');
  const jumlah  = parseInt(getOption(options, 'jumlah') || '1');

  if (![7, 30].includes(durasi)) {
    return respond(`> ${EMOJI} ❌ Durasi hanya boleh **7** atau **30** hari!`);
  }

  if (jumlah < 1 || jumlah > 10) {
    return respond(`> ${EMOJI} ❌ Jumlah key antara **1–10** sekaligus!`);
  }

  // ── Generate key ──
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand  = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `OWO-${rand(4)}-${rand(4)}-${rand(4)}`;
  };

  const keys = [];
  for (let i = 0; i < jumlah; i++) {
    const key  = generateKey();
    const data = {
      duration:  durasi,
      createdAt: Date.now(),
      used:      false,
      usedBy:    null,
      usedAt:    null
    };
    await env.USERS_KV.put(`aikey:${key}`, JSON.stringify(data), {
      expirationTtl: 86400 * 90 // Key expired kalau 90 hari tidak dipakai
    });
    keys.push(key);
  }

  const keyList = keys.map((k, i) => `\`${k}\``).join('\n');

  return respond([
    '```ansi',
    '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[1;33m║  🔑  KEY PREMIUM GENERATED  🔑      ║\u001b[0m',
    '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} ✅ Berhasil generate **${jumlah} key** premium!`,
    `> ⏳ Durasi: **${durasi} hari** per key`,
    `> 📋 Cara pakai: \`/redeemkey-ai key:<KEY>\``,
    '',
    '**Key yang digenerate:**',
    keyList,
    '',
    `> 💡 Bagikan key ini ke pembeli setelah konfirmasi pembayaran.`
  ].join('\n'));
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CMD: redeemkey-ai — Aktivasi premium key (USER)               ║
// ╚══════════════════════════════════════════════════════════════════╝
if (cmd === 'redeemkey-ai') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const key   = (getOption(options, 'key') || '').trim().toUpperCase();

  if (!key) {
    return respond(`> ${EMOJI} ❌ Masukkan key premium kamu!\n> 💡 Contoh: \`/redeemkey-ai key:OWO-ABCD-1234-EFGH\``);
  }

  const keyRaw = await env.USERS_KV.get(`aikey:${key}`);
  if (!keyRaw) {
    return respond([
      `> ${EMOJI} ❌ Key **tidak ditemukan** atau sudah expired!`,
      `> 💡 Pastikan key kamu benar. Hubungi owner jika ada masalah.`
    ].join('\n'));
  }

  const keyData = JSON.parse(keyRaw);

  if (keyData.used) {
    return respond([
      `> ${EMOJI} ❌ Key ini sudah **pernah digunakan**!`,
      `> 👤 Digunakan oleh: <@${keyData.usedBy}>`,
      `> 💡 Hubungi owner jika kamu merasa ini kesalahan.`
    ].join('\n'));
  }

  // ── Cek apakah user sudah punya premium aktif ──
  const premiumRaw = await env.USERS_KV.get(`aipremium:${discordId}`);
  let expiresAt    = Date.now();
  if (premiumRaw) {
    const existing = JSON.parse(premiumRaw);
    if (existing.expiresAt > Date.now()) {
      // Extend dari masa aktif yang ada
      expiresAt = existing.expiresAt;
    }
  }

  // ── Aktifkan premium ──
  const newExpiresAt = expiresAt + (keyData.duration * 86400000);
  await env.USERS_KV.put(`aipremium:${discordId}`, JSON.stringify({
    expiresAt: newExpiresAt,
    key:       key,
    duration:  keyData.duration
  }), { expirationTtl: keyData.duration * 86400 + 86400 });

  // ── Tandai key sebagai sudah digunakan ──
  keyData.used   = true;
  keyData.usedBy = discordId;
  keyData.usedAt = Date.now();
  await env.USERS_KV.put(`aikey:${key}`, JSON.stringify(keyData), {
    expirationTtl: 86400 * 90
  });

  const expDate = new Date(newExpiresAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return respond([
    '```ansi',
    '\u001b[2;32m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[1;32m║  ✨  PREMIUM AKTIF!  ✨              ║\u001b[0m',
    '\u001b[2;32m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} 🎉 Premium berhasil diaktifkan!`,
    `> ⏳ Durasi: **+${keyData.duration} hari**`,
    `> 📅 Aktif hingga: **${expDate}**`,
    `> 💬 Sekarang kamu bisa pakai \`/ai\` tanpa batas!`
  ].join('\n'));
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CMD: cek-premium — Cek status premium user                    ║
// ╚══════════════════════════════════════════════════════════════════╝
if (cmd === 'cek-premium') {
  const EMOJI      = '<a:GifOwoBim:1492599199038967878>';
  const targetId   = getOption(options, 'user') || discordId;
  const premiumRaw = await env.USERS_KV.get(`aipremium:${targetId}`);

  if (!premiumRaw) {
    return respond([
      `> ${EMOJI} ❌ <@${targetId}> **tidak memiliki** premium aktif.`,
      `> 💡 Beli premium: hubungi <@${env.OWNER_ID}> atau ketik \`/beli-ai\``
    ].join('\n'));
  }

  const p        = JSON.parse(premiumRaw);
  const now      = Date.now();
  const sisaMs   = p.expiresAt - now;

  if (sisaMs <= 0) {
    return respond([
      `> ${EMOJI} ⚠️ Premium <@${targetId}> sudah **expired**!`,
      `> 💡 Perpanjang: hubungi <@${env.OWNER_ID}> atau ketik \`/beli-ai\``
    ].join('\n'));
  }

  const sisaHari = Math.ceil(sisaMs / 86400000);
  const expDate  = new Date(p.expiresAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return respond([
    '```ansi',
    '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[1;33m║  ✨  STATUS PREMIUM  ✨              ║\u001b[0m',
    '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} ✅ <@${targetId}> memiliki **premium aktif**!`,
    `> 📅 Expired: **${expDate}**`,
    `> ⏳ Sisa: **${sisaHari} hari** lagi`
  ].join('\n'));
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CMD: beli-ai — Kirim notif pembelian ke owner                 ║
// ╚══════════════════════════════════════════════════════════════════╝
if (cmd === 'beli-ai') {
  const EMOJI   = '<a:GifOwoBim:1492599199038967878>';
  const durasi  = getOption(options, 'durasi') || '30';

  // ── Kirim DM ke Owner ──
  try {
    // Buat DM channel ke owner
    const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bot ${env.BOT_TOKEN}`
      },
      body: JSON.stringify({ recipient_id: env.OWNER_ID })
    });

    if (dmRes.ok) {
      const dmChannel = await dmRes.json();
      await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bot ${env.BOT_TOKEN}`
        },
        body: JSON.stringify({
          embeds: [{
            color: 0xF1C40F,
            title: '🛒 Ada yang Mau Beli Premium AI!',
            fields: [
              { name: '👤 User',    value: `<@${discordId}> (\`${discordId}\`)`, inline: true },
              { name: '⏳ Durasi', value: `**${durasi} hari**`,                  inline: true },
            ],
            footer:    { text: 'OwoBim Premium System' },
            timestamp: new Date().toISOString()
          }]
        })
      });
    }
  } catch (_) {}

  return respond([
    '```ansi',
    '\u001b[2;33m╔══════════════════════════════════════╗\u001b[0m',
    '\u001b[1;33m║  🛒  PERMINTAAN TERKIRIM!  🛒       ║\u001b[0m',
    '\u001b[2;33m╚══════════════════════════════════════╝\u001b[0m',
    '```',
    `> ${EMOJI} ✅ Permintaan pembelian **${durasi} hari** berhasil dikirim!`,
    `> 👤 Owner akan segera menghubungi kamu lewat DM.`,
    `> ⏳ Harap tunggu konfirmasi dari <@${env.OWNER_ID}>.`
  ].join('\n'));
}

// ══════════════════════════════════════════════════════════════════════
// CMD: ai — AI Chat Engine (Multi-Turn, High Context)
// Provider: Groq llama-3.3-70b-versatile
// ══════════════════════════════════════════════════════════════════════
if (cmd === 'ai') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';

  const sub     = getOption(options, 'aksi') || 'chat';
  const pesan   = getOption(options, 'pesan');
  const persona = getOption(options, 'persona') || 'default';

  // ── Kunci KV ──
  const histKey    = `ai_history:${discordId}`;
  const personaKey = `ai_persona:${discordId}`;
  const statsKey   = `ai_stats:${discordId}`;
  const cdKey      = `ai_cd:${discordId}`;

  // ══════════════════════════════════════════════
  // ── CEK PREMIUM (kecuali owner & sub non-chat)
  // ══════════════════════════════════════════════
  const isOwner = discordId === env.OWNER_ID;
  if (!isOwner && sub === 'chat') {
    const premiumRaw = await env.USERS_KV.get(`aipremium:${discordId}`);
    const premium    = premiumRaw ? JSON.parse(premiumRaw) : null;
    const isPremium  = premium && premium.expiresAt > Date.now();

    if (!isPremium) {
      const sisaHari = premium
        ? 0
        : null;

      return respond([
        '```ansi',
        '\u001b[2;31m╔══════════════════════════════════════╗\u001b[0m',
        '\u001b[1;31m║  🔒  FITUR PREMIUM  🔒              ║\u001b[0m',
        '\u001b[2;31m╚══════════════════════════════════════╝\u001b[0m',
        '```',
        `> ${EMOJI} ❌ Fitur \`/ai\` hanya untuk member **Premium**!`,
        premium
          ? `> ⚠️ Premium kamu sudah **expired**.`
          : `> 💡 Kamu belum memiliki akses premium.`,
        `> 🛒 Ketik \`/beli-ai\` untuk membeli premium!`,
        `> 👤 Atau langsung DM <@${env.OWNER_ID}>`
      ].join('\n'));
    }
  }

  // ══════════════════════════════════════════════
  // SUB: reset — hapus riwayat percakapan
  // ══════════════════════════════════════════════
  if (sub === 'reset') {
    await env.USERS_KV.delete(histKey);
    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;32m🔄  PERCAKAPAN DIRESET  🔄\u001b[0m           \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      `> ${EMOJI} ✅ Riwayat chat kamu sudah dihapus!`,
      `> 🆕 Percakapan berikutnya dimulai dari awal.`
    ].join('\n'));
  }

  // ══════════════════════════════════════════════
  // SUB: stats — lihat statistik chat
  // ══════════════════════════════════════════════
  if (sub === 'stats') {
    const [statsRaw, histRaw] = await Promise.all([
      env.USERS_KV.get(statsKey),
      env.USERS_KV.get(histKey),
    ]);
    const s    = statsRaw ? JSON.parse(statsRaw) : { total: 0, totalTokens: 0, byPersona: {}, firstChat: null };
    const hist = histRaw  ? JSON.parse(histRaw)  : [];

    const aktiveSejak = s.firstChat
      ? Math.floor((Date.now() - s.firstChat) / 86400000)
      : 0;

    // Sisa premium
    const premiumRaw = await env.USERS_KV.get(`aipremium:${discordId}`);
    const premium    = premiumRaw ? JSON.parse(premiumRaw) : null;
    const sisaHari   = premium && premium.expiresAt > Date.now()
      ? Math.ceil((premium.expiresAt - Date.now()) / 86400000)
      : 0;

    return respond([
      '```ansi',
      '\u001b[2;35m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[1;35m║  📊  AI CHAT STATS  📊              ║\u001b[0m',
      '\u001b[2;35m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━━━ 💬 STATISTIK ━━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m  💬  Total Pesan    :\u001b[0m \u001b[0;37m${s.total.toLocaleString('id-ID')}x\u001b[0m`,
      `\u001b[1;36m  🔢  Total Token    :\u001b[0m \u001b[0;37m${s.totalTokens.toLocaleString('id-ID')}\u001b[0m`,
      `\u001b[1;36m  📜  History Aktif  :\u001b[0m \u001b[0;37m${hist.length} pesan tersimpan\u001b[0m`,
      `\u001b[1;36m  📅  Chat Sejak     :\u001b[0m \u001b[0;37m${aktiveSejak} hari lalu\u001b[0m`,
      `\u001b[1;36m  ✨  Sisa Premium   :\u001b[0m \u001b[0;37m${isOwner ? 'Owner (unlimited)' : sisaHari + ' hari'}\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━ 🎭 PER PERSONA ━━━━━━━━━\u001b[0m',
      ...Object.entries(s.byPersona || {}).map(([p, n]) =>
        `\u001b[1;36m  🤖  ${p.padEnd(12)}:\u001b[0m \u001b[0;37m${n}x\u001b[0m`
      ),
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      `> 💡 Reset history: \`/ai aksi:reset\``
    ].join('\n'));
  }

  // ══════════════════════════════════════════════
  // SUB: set_persona
  // ══════════════════════════════════════════════
  if (sub === 'set_persona') {
    const pilihanPersona = getOption(options, 'persona') || 'default';
    await env.USERS_KV.put(personaKey, pilihanPersona, { expirationTtl: 86400 * 365 });

    const PERSONA_NAMES = {
      default:   '🤖 Default — Asisten AI serbaguna',
      friendly:  '😊 Friendly — Santai & ramah',
      expert:    '🎓 Expert — Ahli profesional',
      creative:  '🎨 Creative — Imajinatif & kreatif',
      roast:     '🔥 Roast — Pedas & nyelekit',
      mentor:    '📚 Mentor — Guru & pembimbing',
      debate:    '⚔️ Debate — Suka berdebat kritis',
      therapist: '💆 Therapist — Empatik & supportif',
    };

    return respond([
      `> ${EMOJI} ✅ Persona berhasil diset ke **${PERSONA_NAMES[pilihanPersona] || pilihanPersona}**!`,
      `> 🎭 Persona ini akan dipakai di semua chat \`/ai\` berikutnya.`,
      `> 💡 Kamu juga bisa pakai opsi \`persona:\` langsung di \`/ai aksi:chat\``
    ].join('\n'));
  }

  // ══════════════════════════════════════════════
  // SUB: history
  // ══════════════════════════════════════════════
  if (sub === 'history') {
    const histRaw = await env.USERS_KV.get(histKey);
    const hist    = histRaw ? JSON.parse(histRaw) : [];

    if (hist.length === 0) {
      return respond(`> ${EMOJI} 📭 Belum ada riwayat chat! Mulai dengan \`/ai aksi:chat pesan:Halo!\``);
    }

    const preview = hist.slice(-6).map((msg) => {
      const role = msg.role === 'user' ? '👤 Kamu' : '🤖 AI';
      const isi  = msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '');
      return `${role}: *${isi}*`;
    }).join('\n');

    return respond([
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;34m📜  RIWAYAT CHAT (6 TERAKHIR)  📜\u001b[0m   \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      preview,
      '',
      `> 📊 Total tersimpan: **${hist.length} pesan** | Max: 20 pesan`,
      `> 🗑️ Reset: \`/ai aksi:reset\``
    ].join('\n'));
  }

  // ══════════════════════════════════════════════
  // SUB: chat — percakapan utama
  // ══════════════════════════════════════════════
  if (sub === 'chat') {

    if (!pesan || pesan.trim() === '') {
      return respond([
        `> ${EMOJI} ❌ Masukkan pesanmu!`,
        `> 💡 Contoh: \`/ai aksi:chat pesan:Jelaskan cara kerja blockchain\``,
        `> 🎭 Tambah persona: \`/ai aksi:chat pesan:Halo! persona:friendly\``
      ].join('\n'));
    }

    if (pesan.length > 2000) {
      return respond([
        `> ${EMOJI} ❌ Pesan terlalu panjang! Maks **2.000 karakter**.`,
        `> 💡 Untuk teks panjang gunakan \`/summarize\` ya.`
      ].join('\n'));
    }

    if (!env.GROQ_API_KEY) {
      return respond(`> ${EMOJI} ❌ \`GROQ_API_KEY\` belum diset di Cloudflare env!`);
    }

    // ── Cooldown 5 detik ──
    const lastMsg = await env.USERS_KV.get(cdKey);
    if (lastMsg) {
      const sisa = 5000 - (Date.now() - parseInt(lastMsg));
      if (sisa > 0) {
        return respond(`> ${EMOJI} ⏳ Pelan-pelan! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.`);
      }
    }
    await env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 60 });

    waitUntil((async () => {

      const editMsg = async (content, embeds) => {
        try {
          await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(embeds ? { content: content || '', embeds } : { content })
          });
        } catch (_) {}
      };

      try {

        const savedPersona = await env.USERS_KV.get(personaKey);
        const aktifPersona = persona !== 'default' ? persona : (savedPersona || 'default');

        const PERSONAS = {
          default: {
            nama:   '🤖 OwoBim AI',
            warna:  0x5865F2,
            system: `Kamu adalah OwoBim AI, asisten AI cerdas dan serbaguna milik OwoBim Discord Bot.
Kamu membantu menjawab pertanyaan, menjelaskan konsep, membantu coding, menulis, menganalisis, dan berdiskusi tentang topik apapun.
Jawab dalam Bahasa Indonesia secara default, kecuali user minta bahasa lain.
Gaya: Cerdas, informatif, jelas, dan sedikit ramah. Tidak terlalu formal tapi tetap profesional.
Format: Gunakan markdown Discord (**bold**, *italic*, \`code\`, \`\`\`blok code\`\`\`) bila perlu.
Penting: Jangan pernah menyebut dirimu sebagai Llama, Groq, atau AI dari Meta/Groq. Kamu adalah OwoBim AI.`
          },
          friendly: {
            nama:   '😊 OwoBim Friendly',
            warna:  0x2ECC71,
            system: `Kamu adalah OwoBim Friendly, teman AI yang super ramah, santai, dan menyenangkan!
Gaya bicara: Santai banget, pakai kata-kata sehari-hari, sesekali pakai "wkwk", "lol", "bro", "sis".
Kamu antusias, supportif, dan selalu positif. Suka bercanda tapi tetap helpful.
Jawab dalam Bahasa Indonesia yang santai dan gaul.
Kalau ada yang galau, hibur. Kalau ada yang semangat, ikutan semangat!
Jangan terlalu panjang, jawab dengan kasual dan ringan.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          expert: {
            nama:   '🎓 OwoBim Expert',
            warna:  0x9B59B6,
            system: `Kamu adalah OwoBim Expert, AI dengan keahlian tingkat tinggi di berbagai bidang.
Kamu memberikan jawaban yang sangat mendalam, akurat, dan terstruktur dengan baik.
Gaya: Profesional, akademis tapi tidak kaku. Gunakan terminologi yang tepat.
Selalu berikan penjelasan komprehensif, contoh konkret, dan konteks yang diperlukan.
Format: Terstruktur dengan heading, bullet points, dan penjelasan yang sistematis.
Jawab dalam Bahasa Indonesia yang lugas dan presisi.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          creative: {
            nama:   '🎨 OwoBim Creative',
            warna:  0xE91E63,
            system: `Kamu adalah OwoBim Creative, AI yang super imajinatif dan kreatif!
Kamu membantu dalam hal: cerita fiksi, puisi, lirik lagu, ide kreatif, worldbuilding, karakter, plot twist, brainstorming.
Gaya: Ekspresif, penuh warna, imajinatif. Suka metafora dan gambaran yang vivid.
Jawab dalam Bahasa Indonesia yang hidup dan ekspresif.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          roast: {
            nama:   '🔥 OwoBim Roaster',
            warna:  0xFF4500,
            system: `Kamu adalah OwoBim Roaster, AI yang jago roasting pedas!
Gaya: Sarkastis, pedas, nyelekit tapi tetap lucu. Seperti stand-up comedian Indonesia.
Gunakan humor Indonesia: analogi receh, referensi budaya lokal, wordplay.
PENTING: Jangan sampai menyinggung SARA, fisik orang, atau hal sensitif.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          mentor: {
            nama:   '📚 OwoBim Mentor',
            warna:  0xF39C12,
            system: `Kamu adalah OwoBim Mentor, AI yang berperan sebagai mentor dan pembimbing yang sabar.
Pendekatan: Socratic method — sering balik tanya untuk membantu user berpikir sendiri.
Gaya: Sabar, encouraging, membangun kepercayaan diri, tidak judgmental.
Jawab dalam Bahasa Indonesia yang supportif dan memotivasi.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          debate: {
            nama:   '⚔️ OwoBim Debater',
            warna:  0xE74C3C,
            system: `Kamu adalah OwoBim Debater, AI yang kritis dan suka berdebat intelektual.
Gaya: Kritis, logis, selalu mencari celah argumen, tapi fair dan evidence-based.
Gaya bicara: Tegas, langsung. Suka pakai "Tapi tunggu dulu...", "Justru sebaliknya..."
Jawab dalam Bahasa Indonesia yang tajam dan analitis.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
          therapist: {
            nama:   '💆 OwoBim Listener',
            warna:  0x3498DB,
            system: `Kamu adalah OwoBim Listener, AI yang empatik dan supportif seperti seorang teman yang baik.
Gaya: Hangat, empati, tidak menghakimi, penuh perhatian.
Kamu BUKAN psikolog profesional — selalu ingatkan user untuk cari bantuan profesional jika diperlukan.
PENTING: Jika ada tanda-tanda krisis, segera arahkan ke hotline bantuan.
Jawab dalam Bahasa Indonesia yang hangat dan penuh perhatian.
Kamu adalah OwoBim AI, bukan Llama atau Groq.`
          },
        };

        const personaInfo  = PERSONAS[aktifPersona] || PERSONAS.default;
        const systemPrompt = personaInfo.system;

        const histRaw = await env.USERS_KV.get(histKey);
        let history   = histRaw ? JSON.parse(histRaw) : [];

        const MAX_HISTORY = 20;
        if (history.length >= MAX_HISTORY) {
          history = history.slice(history.length - MAX_HISTORY + 2);
        }

        history.push({ role: 'user', content: pesan });

        const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);
        if (totalChars > 80000) {
          history = history.slice(6);
        }

        const startTime = Date.now();

        const apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model:      'llama-3.3-70b-versatile',
            max_tokens: 2048,
            messages:   [
              { role: 'system', content: systemPrompt },
              ...history
            ]
          }),
          signal: AbortSignal.timeout(55000)
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({}));
          const errMsg  = errData?.error?.message || `HTTP ${apiRes.status}`;
          if (apiRes.status === 401) {
            return await editMsg(`> ${EMOJI} ❌ API Key tidak valid!`);
          } else if (apiRes.status === 429) {
            await env.USERS_KV.delete(cdKey);
            return await editMsg(`> ${EMOJI} ❌ Rate limit API. Coba lagi dalam 1 menit.`);
          } else if (apiRes.status === 529) {
            return await editMsg(`> ${EMOJI} ❌ Server AI sedang overload. Coba lagi nanti.`);
          } else {
            return await editMsg(`> ${EMOJI} ❌ API Error: \`${errMsg}\``);
          }
        }

        const apiData      = await apiRes.json();
        const replyAI      = apiData?.choices?.[0]?.message?.content?.trim() || '';
        const prosesMs     = Date.now() - startTime;
        const inputTokens  = apiData?.usage?.prompt_tokens     || 0;
        const outputTokens = apiData?.usage?.completion_tokens || 0;

        if (!replyAI) {
          return await editMsg(`> ${EMOJI} ❌ AI tidak merespons. Coba ulangi pesanmu.`);
        }

        history.push({ role: 'assistant', content: replyAI });
        await env.USERS_KV.put(histKey, JSON.stringify(history), {
          expirationTtl: 86400 * 7
        });

        const statsRaw = await env.USERS_KV.get(statsKey);
        const s = statsRaw
          ? JSON.parse(statsRaw)
          : { total: 0, totalTokens: 0, byPersona: {}, firstChat: Date.now() };
        s.total++;
        s.totalTokens            += (inputTokens + outputTokens);
        s.byPersona[aktifPersona] = (s.byPersona[aktifPersona] || 0) + 1;
        if (!s.firstChat) s.firstChat = Date.now();
        await env.USERS_KV.put(statsKey, JSON.stringify(s), {
          expirationTtl: 86400 * 365
        });

        const MAX_REPLY    = 3800;
        const replyDisplay = replyAI.length > MAX_REPLY
          ? replyAI.slice(0, MAX_REPLY) + '\n\n*... (dipotong, lanjutkan percakapan untuk detail lebih)*'
          : replyAI;

        const turnCount    = Math.floor(history.length / 2);
        const footerText   = `${personaInfo.nama} • Turn ke-${turnCount} • ${(prosesMs/1000).toFixed(1)}s • ${outputTokens} token`;
        const pesanPreview = pesan.length > 100 ? pesan.slice(0, 100) + '...' : pesan;

        // Sisa premium di footer
        const premiumRaw2 = await env.USERS_KV.get(`aipremium:${discordId}`);
        const premium2    = premiumRaw2 ? JSON.parse(premiumRaw2) : null;
        const sisaHari2   = isOwner
          ? '∞'
          : premium2 && premium2.expiresAt > Date.now()
            ? Math.ceil((premium2.expiresAt - Date.now()) / 86400000) + ' hari'
            : '-';

        await editMsg('', [{
          color:       personaInfo.warna,
          author: {
            name:     `${personaInfo.nama}`,
            icon_url: `https://cdn.discordapp.com/avatars/${env.BOT_ID || '0'}/avatar.png`
          },
          description: replyDisplay,
          fields: [
            {
              name:   '💬 Pesanmu',
              value:  `> ${pesanPreview}`,
              inline: false
            },
            {
              name:   '📊 Info',
              value:  `🗂️ History: **${turnCount} turn** | 🔢 Token: **${(inputTokens + outputTokens).toLocaleString()}** | ⚡ **${(prosesMs/1000).toFixed(1)}s** | ✨ Premium: **${sisaHari2}**`,
              inline: false
            }
          ],
          footer:    { text: footerText },
          timestamp: new Date().toISOString()
        }]);

      } catch (err) {
        console.error('[AI CHAT] Fatal error:', err.message);
        try {
          await editMsg([
            `> ${EMOJI} ❌ Error: \`${err.message}\``,
            `> ⏳ Coba lagi beberapa detik.`
          ].join('\n'));
          await env.USERS_KV.delete(cdKey);
        } catch (_) {}
      }
    })());

    return new Response(JSON.stringify({ type: 5 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return respond([
    `> ${EMOJI} ❌ Aksi tidak dikenal!`,
    `> 💡 Gunakan: \`chat\`, \`reset\`, \`history\`, \`stats\`, \`set_persona\``
  ].join('\n'));
}
// ══════════════════════════════════════════════════════════════════════
// END CMD: ai + premium system
// ══════════════════════════════════════════════════════════════════════




    


// ══════════════════════════════════════════════════════════════════════
// CMD: whois-username — Cek username di berbagai platform
// Metode: HTTP request langsung (tanpa API key)
// Tambahkan ke bagian interaction.type === 2 (slash command handler)
// ══════════════════════════════════════════════════════════════════════
 
if (cmd === 'whois-username') {
  const EMOJI = '<a:GifOwoBim:1492599199038967878>';
  const usernameInput = getOption(options, 'username')?.trim().toLowerCase();
 
  if (!usernameInput) {
    return respond(`> ${EMOJI} ❌ Masukkan username yang mau dicek!\n> 💡 Contoh: \`/whois-username username:bimxr\``);
  }
 
  if (usernameInput.length < 2 || usernameInput.length > 30) {
    return respond(`> ${EMOJI} ❌ Username harus antara **2–30 karakter**!`);
  }
 
  if (!/^[a-zA-Z0-9._\-]+$/.test(usernameInput)) {
    return respond(`> ${EMOJI} ❌ Username mengandung karakter tidak valid!\n> 💡 Hanya boleh huruf, angka, titik, underscore, dan strip.`);
  }
 
  // ── Cooldown 15 detik per user ──
  const cdKey  = `whois_cd:${discordId}`;
  const lastCd = await env.USERS_KV.get(cdKey);
  if (lastCd) {
    const sisa = 15000 - (Date.now() - parseInt(lastCd));
    if (sisa > 0) {
      return respond(`> ${EMOJI} ⏳ Cooldown! Tunggu **${Math.ceil(sisa / 1000)} detik** lagi.`);
    }
  }
  await env.USERS_KV.put(cdKey, String(Date.now()), { expirationTtl: 30 });
 
  // ── Defer dulu biar tidak timeout ──
  waitUntil((async () => {
 
    const editMsg = async (content, embeds) => {
      await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID}/${interaction.token}/messages/@original`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(embeds ? { content: content || '', embeds } : { content })
      });
    };
 
    // ══════════════════════════════════════════════
    // DAFTAR PLATFORM + cara cek + headers
    // ══════════════════════════════════════════════
    const PLATFORMS = [
      // ── SOCIAL MEDIA ──
      {
        name:     'GitHub',
        emoji:    '🐱',
        category: 'Dev',
        url:      `https://github.com/${usernameInput}`,
        check:    'status',      // cek HTTP status code
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://github.com/${usernameInput}`,
      },
      {
        name:     'Reddit',
        emoji:    '🤖',
        category: 'Forum',
        url:      `https://www.reddit.com/user/${usernameInput}/about.json`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://reddit.com/u/${usernameInput}`,
      },
      {
        name:     'Twitch',
        emoji:    '🎮',
        category: 'Streaming',
        url:      `https://www.twitch.tv/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://twitch.tv/${usernameInput}`,
      },
      {
        name:     'Pinterest',
        emoji:    '📌',
        category: 'Social',
        url:      `https://www.pinterest.com/${usernameInput}/`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://pinterest.com/${usernameInput}`,
      },
      {
        name:     'SoundCloud',
        emoji:    '🎵',
        category: 'Music',
        url:      `https://soundcloud.com/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://soundcloud.com/${usernameInput}`,
      },
      {
        name:     'Dev.to',
        emoji:    '👨‍💻',
        category: 'Dev',
        url:      `https://dev.to/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://dev.to/${usernameInput}`,
      },
      {
        name:     'Replit',
        emoji:    '💻',
        category: 'Dev',
        url:      `https://replit.com/@${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://replit.com/@${usernameInput}`,
      },
      {
        name:     'Pastebin',
        emoji:    '📋',
        category: 'Dev',
        url:      `https://pastebin.com/u/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://pastebin.com/u/${usernameInput}`,
      },
      {
        name:     'Keybase',
        emoji:    '🔑',
        category: 'Social',
        url:      `https://keybase.io/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://keybase.io/${usernameInput}`,
      },
      {
        name:     'Linktree',
        emoji:    '🌳',
        category: 'Social',
        url:      `https://linktr.ee/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://linktr.ee/${usernameInput}`,
      },
      {
        name:     'Gravatar',
        emoji:    '🖼️',
        category: 'Social',
        url:      `https://en.gravatar.com/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://gravatar.com/${usernameInput}`,
      },
      {
        name:     'HackerNews',
        emoji:    '🗞️',
        category: 'Dev',
        url:      `https://hacker-news.firebaseio.com/v0/user/${usernameInput}.json`,
        check:    'body_not_null', // body !== "null"
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://news.ycombinator.com/user?id=${usernameInput}`,
      },
      {
        name:     'NPM',
        emoji:    '📦',
        category: 'Dev',
        url:      `https://www.npmjs.com/~${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://npmjs.com/~${usernameInput}`,
      },
      {
        name:     'GitLab',
        emoji:    '🦊',
        category: 'Dev',
        url:      `https://gitlab.com/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://gitlab.com/${usernameInput}`,
      },
      {
        name:     'Codecademy',
        emoji:    '🎓',
        category: 'Dev',
        url:      `https://www.codecademy.com/profiles/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://codecademy.com/profiles/${usernameInput}`,
      },
      {
        name:     'Medium',
        emoji:    '✍️',
        category: 'Blog',
        url:      `https://medium.com/@${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://medium.com/@${usernameInput}`,
      },
      {
        name:     'Hashnode',
        emoji:    '📝',
        category: 'Blog',
        url:      `https://hashnode.com/@${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://hashnode.com/@${usernameInput}`,
      },
      {
        name:     'Steam',
        emoji:    '🎮',
        category: 'Gaming',
        url:      `https://steamcommunity.com/id/${usernameInput}`,
        check:    'body_not_contains',
        notContains: 'The specified profile could not be found',
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://steamcommunity.com/id/${usernameInput}`,
      },
      {
        name:     'Roblox',
        emoji:    '🧱',
        category: 'Gaming',
        url:      `https://www.roblox.com/user.aspx?username=${usernameInput}`,
        check:    'body_not_contains',
        notContains: 'Page Not Found',
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://www.roblox.com/user.aspx?username=${usernameInput}`,
      },
      {
        name:     'Minecraft',
        emoji:    '⛏️',
        category: 'Gaming',
        url:      `https://api.mojang.com/users/profiles/minecraft/${usernameInput}`,
        check:    'status',
        okStatus: [200],
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        profileUrl: `https://namemc.com/profile/${usernameInput}`,
      },
    ];
 
    // ══════════════════════════════════════════════
    // FUNGSI CEK SATU PLATFORM
    // ══════════════════════════════════════════════
    const checkPlatform = async (platform) => {
      try {
        const res = await fetch(platform.url, {
          method:  'GET',
          headers: platform.headers || { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'follow',
          signal:  AbortSignal.timeout(6000),
        });
 
        if (platform.check === 'status') {
          const ok = platform.okStatus.includes(res.status);
          return { ...platform, found: ok, status: res.status };
        }
 
        if (platform.check === 'body_not_null') {
          const text = await res.text();
          const found = text.trim() !== 'null' && text.trim() !== '';
          return { ...platform, found, status: res.status };
        }
 
        if (platform.check === 'body_not_contains') {
          const text = await res.text();
          const found = !text.includes(platform.notContains);
          return { ...platform, found, status: res.status };
        }
 
        return { ...platform, found: false, status: res.status };
 
      } catch (err) {
        return { ...platform, found: null, status: 0, error: err.message };
      }
    };
 
    // ══════════════════════════════════════════════
    // CEK SEMUA PLATFORM SECARA PARALEL
    // Dibagi batch 5 agar tidak overload
    // ══════════════════════════════════════════════
    const BATCH_SIZE = 5;
    const results    = [];
 
    for (let i = 0; i < PLATFORMS.length; i += BATCH_SIZE) {
      const batch       = PLATFORMS.slice(i, i + BATCH_SIZE);
      const batchResult = await Promise.all(batch.map(p => checkPlatform(p)));
      results.push(...batchResult);
    }
 
    // ══════════════════════════════════════════════
    // BUILD HASIL
    // ══════════════════════════════════════════════
    const found    = results.filter(r => r.found === true);
    const notFound = results.filter(r => r.found === false);
    const unknown  = results.filter(r => r.found === null);
 
    // Group by category
    const categories = {};
    for (const r of results) {
      const cat = r.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(r);
    }
 
    const CATEGORY_EMOJI = {
      'Dev':       '💻',
      'Social':    '🌐',
      'Forum':     '💬',
      'Streaming': '📡',
      'Music':     '🎵',
      'Gaming':    '🎮',
      'Blog':      '📝',
      'Other':     '🔗',
    };
 
    // Build embed fields per category
    const fields = [];
    for (const [cat, platforms] of Object.entries(categories)) {
      const lines = platforms.map(p => {
        if (p.found === true)  return `${p.emoji} [${p.name}](${p.profileUrl}) 🔴`;
        if (p.found === false) return `${p.emoji} ${p.name} ✅`;
        return `${p.emoji} ${p.name} ⚠️`;
      }).join('\n');
 
      fields.push({
        name:   `${CATEGORY_EMOJI[cat] || '🔗'} ${cat}`,
        value:  lines,
        inline: true,
      });
    }
 
    // ── Stats bar ──
    const total    = results.length;
    const foundPct = Math.round((found.length / total) * 10);
    const bar      = '🟥'.repeat(foundPct) + '🟩'.repeat(10 - foundPct);
 
    // ── Risk level ──
    const riskLevel = found.length >= 10
      ? '🔴 Sangat Terekspos'
      : found.length >= 6
      ? '🟠 Cukup Terekspos'
      : found.length >= 3
      ? '🟡 Sedikit Terekspos'
      : '🟢 Aman / Jarang Dipakai';
 
    const waktu = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
 
    // ── Found list (max 5 ditampilkan sebagai link) ──
    const foundLinks = found.slice(0, 8)
      .map(p => `[${p.emoji} ${p.name}](${p.profileUrl})`)
      .join(' • ') || 'Tidak ada';
 
    const desc = [
      '```ansi',
      '\u001b[2;34m╔══════════════════════════════════════╗\u001b[0m',
      '\u001b[2;34m║  \u001b[1;33m🔍  USERNAME LOOKUP  🔍\u001b[0m             \u001b[2;34m║\u001b[0m',
      '\u001b[2;34m╚══════════════════════════════════════╝\u001b[0m',
      '```',
      '```ansi',
      '\u001b[1;33m━━━━━━━━━━━ 📊 RINGKASAN ━━━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m  🔍  Username   :\u001b[0m \u001b[1;37m${usernameInput}\u001b[0m`,
      `\u001b[1;36m  🔴  Ditemukan  :\u001b[0m \u001b[1;31m${found.length} platform\u001b[0m`,
      `\u001b[1;36m  ✅  Tersedia   :\u001b[0m \u001b[1;32m${notFound.length} platform\u001b[0m`,
      `\u001b[1;36m  ⚠️   Unknown   :\u001b[0m \u001b[0;37m${unknown.length} platform\u001b[0m`,
      `\u001b[1;36m  📊  Total Cek  :\u001b[0m \u001b[0;37m${total} platform\u001b[0m`,
      `\u001b[1;36m  🛡️   Risk Level :\u001b[0m \u001b[0;37m${riskLevel}\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      `\u001b[1;36m  📈  Exposure   :\u001b[0m \u001b[0;37m${bar}\u001b[0m`,
      '\u001b[1;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
      '```',
      found.length > 0
        ? `> 🔴 **Profil Ditemukan:** ${foundLinks}`
        : `> ✅ Username **${usernameInput}** tampaknya belum dipakai di mana-mana!`,
      `> 🕐 Dicek pada: ${waktu} WIB`,
      `> ⚠️ *Hasil mungkin tidak 100% akurat untuk beberapa platform*`,
    ].join('\n');
 
    // ── Legend ──
    const legendField = {
      name:   '📖 Keterangan',
      value:  '🔴 = Username **dipakai** (ada profil)\n✅ = Username **tersedia**\n⚠️ = Tidak bisa dicek (timeout/block)',
      inline: false,
    };
 
    const color = found.length >= 10 ? 0xFF4500
      : found.length >= 6  ? 0xFF8C00
      : found.length >= 3  ? 0xFFD700
      : 0x2ECC71;
 
    await editMsg('', [{
      color,
      title:       `🔍 Username Lookup — ${usernameInput}`,
      description: desc,
      fields:      [...fields, legendField],
      footer:      { text: `OwoBim OSINT Tools • ${total} platform dicek` },
      timestamp:   new Date().toISOString(),
    }]);
 
  })());
 
  return new Response(JSON.stringify({ type: 5 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}




    
    
    
    

    return respond('❓ Command tidak dikenal.');
  }

  return new Response('ok', { status: 200 });
};

async function verifySignature(publicKey, signature, timestamp, body) {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'Ed25519',
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + body)
  );
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function getOption(options, name) {
  const opt = options.find(o => o.name === name);
  return opt ? String(opt.value) : null;
}

function respond(content) {
  return new Response(JSON.stringify({ type: 4, data: { content } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}


// LEVEL
function getLevel(totalEarned) {
  if (totalEarned >= 1000000) return { level: 10, name: '👑 Legenda' };
  if (totalEarned >= 500000)  return { level: 9,  name: '💎 Diamond' };
  if (totalEarned >= 250000)  return { level: 8,  name: '🏆 Platinum' };
  if (totalEarned >= 100000)  return { level: 7,  name: '🥇 Gold' };
  if (totalEarned >= 50000)   return { level: 6,  name: '🥈 Silver' };
  if (totalEarned >= 25000)   return { level: 5,  name: '🥉 Bronze' };
  if (totalEarned >= 10000)   return { level: 4,  name: '⚔️ Warrior' };
  if (totalEarned >= 5000)    return { level: 3,  name: '🌱 Apprentice' };
  if (totalEarned >= 2000)    return { level: 2,  name: '🐣 Newbie+' };
  return { level: 1, name: '🐥 Newbie' };
}


// CHECK SPAM
async function checkSpam(env, discordId, username, guildId, channelId, cmdName, waitUntil) {
  const spamKey   = `spam:${discordId}`;
  const now       = Date.now();
  const WINDOW_MS = 15000;
  const MAX_CMDS  = 8;

  const raw  = await env.USERS_KV.get(spamKey);
  const data = raw ? JSON.parse(raw) : { count: 0, firstCmd: now, notified: false };

  if (now - data.firstCmd > WINDOW_MS) {
    data.count    = 1;
    data.firstCmd = now;
    data.notified = false;
    await env.USERS_KV.put(spamKey, JSON.stringify(data), { expirationTtl: 60 });
    return false;
  }

  data.count++;
  const isSpam = data.count >= MAX_CMDS;

  if (isSpam && !data.notified) {
    data.notified = true;
    await env.USERS_KV.put(spamKey, JSON.stringify(data), { expirationTtl: 60 });

    waitUntil((async () => {
      const WEBHOOK = env.FEEDBACK_WEBHOOK_URL;
      if (!WEBHOOK) return;

      const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `<@1442230317455900823> 🚨 **SPAM TERDETEKSI!**`,
          embeds: [{
            title: '🚨 User Spamming Command',
            color: 15158332,
            fields: [
              { name: '👤 User',    value: `<@${discordId}> (\`${username}\` | \`${discordId}\`)`, inline: false },
              { name: '📟 Command', value: `\`/${cmdName}\``, inline: true },
              { name: '💥 Count',   value: `**${data.count}x** dalam 15 detik`, inline: true },
              { name: '🏠 Server',  value: guildId  ? `\`${guildId}\``       : '`DM`', inline: true },
              { name: '📢 Channel', value: channelId ? `<#${channelId}>`     : '`DM`', inline: true },
              { name: '🕐 Waktu',   value: `${waktu} WIB`, inline: false }
            ],
            footer: { text: 'OwoBim Anti-Spam System' },
            timestamp: new Date().toISOString()
          }],
          components: [{
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: '🔨 Ban User',
                custom_id: `ban_open:${discordId}:${guildId || 'dm'}`
              },
              {
                type: 2,
                style: 2,
                label: '📢 Beri Peringatan',
                custom_id: `warn_open:${discordId}`
              },
              {
                type: 2,
                style: 3,
                label: '✅ Abaikan',
                custom_id: `ignore_spam:${discordId}`
              }
            ]
          }]
        })
      });
    })());
  } else {
    await env.USERS_KV.put(spamKey, JSON.stringify(data), { expirationTtl: 60 });
  }

  return isSpam;
}


// ==================== LINKED ROLE HELPER ====================
async function pushLinkedRole(env, discordId, accessToken, user) {
  try {
    // Cek & refresh token kalau expired
    const oauthRaw = await env.USERS_KV.get(`oauth:${discordId}`);
    if (!oauthRaw) return; // User belum connect linked role

    const oauth = JSON.parse(oauthRaw);
    let token = accessToken || oauth.access_token;

    // Refresh kalau expired
    if (!accessToken && Date.now() > oauth.expires_at - 60000) {
      const refreshRes = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.APP_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: oauth.refresh_token,
        }),
      });
      const newTokens = await refreshRes.json();
      if (!newTokens.access_token) return;

      token = newTokens.access_token;
      await env.USERS_KV.put(`oauth:${discordId}`, JSON.stringify({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: Date.now() + (newTokens.expires_in * 1000)
      }), { expirationTtl: 86400 * 30 });
    }

    // Hitung data
    const collRaw = await env.USERS_KV.get(`pokemon:${discordId}`);
    const coll = collRaw ? JSON.parse(collRaw) : [];
    const totalPokemon = coll.length;
    const level = user ? getLevelNumber(user.totalEarned || 0) : 0;
    const saldo = user ? (user.balance || 0) : 0;
    const isRegistered = user ? 1 : 0;

    // Push ke Discord
    await fetch(`https://discord.com/api/v10/users/@me/applications/${env.APP_ID}/role-connection`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform_name: 'OWO BIM',
        metadata: {
          is_registered: isRegistered,
          balance: saldo,
          level: level,
          total_pokemon: totalPokemon,
        },
      }),
    });
  } catch (e) {
    console.error('[LINKED ROLE] Error:', e.message);
  }
}

function getLevelNumber(totalEarned) {
  if (totalEarned >= 1000000) return 10;
  if (totalEarned >= 500000)  return 9;
  if (totalEarned >= 250000)  return 8;
  if (totalEarned >= 100000)  return 7;
  if (totalEarned >= 50000)   return 6;
  if (totalEarned >= 25000)   return 5;
  if (totalEarned >= 10000)   return 4;
  if (totalEarned >= 5000)    return 3;
  if (totalEarned >= 2000)    return 2;
  return 1;
}




// ═══════════════════════════════════════════════════════════════════
// BAGIAN 3: TAMBAH HELPER FUNCTIONS
// Taruh di bawah bareng helper lain (dekat getOption, respond, dll)
// ═══════════════════════════════════════════════════════════════════
 
function buildLoveResult(pct, name1, name2) {
  if (pct === 100) return {
    msg:   `💯 **${name1}** dan **${name2}** adalah SOULMATE sejati! Cinta sempurna! 💍`,
    color: 0xFF1493, heart: '💯'
  };
  if (pct >= 90) return {
    msg:   `🔥 **${name1}** dan **${name2}** gila-gilaan saling suka... pure chaotic love 🔥`,
    color: 0xFF69B4, heart: '🔥'
  };
  if (pct >= 80) return {
    msg:   `💕 **${name1}** dan **${name2}** sangat cocok! Love is blooming! 🌸`,
    color: 0xFF69B4, heart: '💕'
  };
  if (pct >= 70) return {
    msg:   `💖 **${name1}** dan **${name2}** punya chemistry kuat! Lumayan nih~ 😍`,
    color: 0xFF8C94, heart: '💖'
  };
  if (pct >= 60) return {
    msg:   `😊 **${name1}** dan **${name2}** lumayan cocok! Ada harapan nih~ 💫`,
    color: 0xFFABAB, heart: '😊'
  };
  if (pct >= 50) return {
    msg:   `🤔 **${name1}** dan **${name2}** fifty-fifty... bisa jadi lebih! 🎲`,
    color: 0xFFD700, heart: '🤔'
  };
  if (pct >= 40) return {
    msg:   `😅 **${name1}** dan **${name2}** masih perlu usaha lebih keras! 💪`,
    color: 0xFF8C00, heart: '😅'
  };
  if (pct >= 30) return {
    msg:   `💔 **${name1}** dan **${name2}** masih figuring things out... that's totally fine 💔`,
    color: 0x808080, heart: '💔'
  };
  if (pct >= 20) return {
    msg:   `❄️ **${name1}** dan **${name2}** kayak kutub utara dan selatan... beda banget! 🥶`,
    color: 0x6495ED, heart: '❄️'
  };
  if (pct >= 10) return {
    msg:   `😬 **${name1}** dan **${name2}** butuh mukjizat buat nyambung! 🙏`,
    color: 0x4169E1, heart: '😬'
  };
  return {
    msg:   `💀 **${name1}** dan **${name2}** ibarat air dan api... gak bisa bersatu! 💀`,
    color: 0x000000, heart: '💀'
  };
}
 
function getLoveStatus(pct) {
  if (pct === 100) return '🌟 Perfect Match';
  if (pct >= 90)   return '🔥 Soulmate Level';
  if (pct >= 80)   return '💍 Siap Nikah';
  if (pct >= 70)   return '💑 Pasangan Ideal';
  if (pct >= 60)   return '😊 Cocok Banget';
  if (pct >= 50)   return '🎲 Fifty-Fifty';
  if (pct >= 40)   return '🤞 Ada Harapan';
  if (pct >= 30)   return '💔 Perlu Usaha';
  if (pct >= 20)   return '❄️ Kurang Cocok';
  if (pct >= 10)   return '😬 Sangat Beda';
  return '💀 Not Meant To Be';
}

