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
  const clickerId = interaction.member?.user?.id || interaction.user?.id;


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
  

  if (clickerId !== '1442230317455900823') {
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
      const helpText = `🌟 **Bantuan Command Bot OWO BIM**

**Ekonomi Utama:**
• \`/register password:xxx\` → Buat akun baru
• \`/wcash\` → Cek saldo cowoncy kamu
• \`/wcf jumlah:1000\` atau \`/wcf jumlah:all\` → Coinflip (50/50)
• \`/wsend target:@user jumlah:5000\` → Kirim cowoncy ke orang lain
• \`/daily\` → Klaim daily reward (15.000)
• \`/kerja\` → Kerja setiap 1 jam (25.000)

**Bank:**
• \`/bank\` → Cek saldo bank & bunga
• \`/deposit jumlah:10000\` atau \`/deposit jumlah:all\` → Masukkan uang ke bank
• \`/withdraw jumlah:5000\` atau \`/withdraw jumlah:all\` → Ambil uang dari bank

**Sosial & Fun:**
• \`/marry target:@user\` → Melamar seseorang
• \`/accept-marry\` → Terima lamaran
• \`/tolak-marry\` → Tolak lamaran
• \`/divorce\` → Cerai
• \`/partner\` → Cek status pernikahan
• \`/hug target:@user\` → Peluk seseorang
• \`/slap target:@user\` → Tampar seseorang
• \`/pat target:@user\` → Usap kepala (pat pat)
• \`/roast target:@user\` → Roast random super pedas
• \`/afk alasan:lagi belajar\` → Set AFK
• \`/unafk\` → Keluar dari AFK

**Lainnya:**
• \`/ping\` → Cek latency bot
• \`/stats\` → Statistik total pemain & cowoncy
• \`/leaderboard\` → Top 10 saldo tertinggi
• \`/level\` → Level leaderboard (berdasarkan total earned)
• \`/avatar user:@user\` → Tampilkan avatar user
• \`/infopemilikbot\` → Info pemilik bot

> **Tips:** Beberapa command support \`all\` untuk jumlah (contoh: /wcf jumlah:all)
Butuh bantuan lebih lanjut? Hubungi <@1442230317455900823> 💬`;

      return respond(helpText);
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
      return respond(`✅ Kamu sudah bekerja keras! +🪙 **25.000**\nSaldo: 🪙 **${user.balance.toLocaleString()}**`);
    }

    if (cmd === 'ping') {
      const latency = Date.now() - JSON.parse(body === '' ? '{}' : body).id ? 
        Date.now() - Number(BigInt(interaction.id) >> 22n) - 1420070400000 : 0;
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
  return respond(`✅ **${count} user** berhasil difix! Total earned sekarang sama dengan balance.`);
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

  // Ambil data semua server
  const servers = [];
  for (const key of keys) {
    const raw = await env.USERS_KV.get(key.name);
    if (raw) {
      const data = JSON.parse(raw);
      servers.push(data);
    }
  }

  // Sort by updatedAt terbaru
  servers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const medals = ['🥇','🥈','🥉'];
  const serverList = servers.map((data, i) => {
    const waktu = new Date(data.updatedAt).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const rank = medals[i] || `${i + 1}.`;
    return `${rank} \`${data.guildId}\`\n┗ 📢 <#${data.channelId}> • 🕐 ${waktu}`;
  });

  // Stats
  const newest = new Date(servers[0]?.updatedAt).toLocaleDateString('id-ID');
  const oldest = new Date(servers[servers.length - 1]?.updatedAt).toLocaleDateString('id-ID');

  return respond([
    '```ansi',
    '\u001b[2;34m╔══════════════════════════════════════════╗\u001b[0m',
    '\u001b[2;34m║  \u001b[1;33m🌐  OWO BIM — SERVER LIST  🌐\u001b[0m  \u001b[2;34m║\u001b[0m',
    '\u001b[2;34m╚══════════════════════════════════════════╝\u001b[0m',
    '```',
    `> 🌍 **Total Server:** \`${servers.length}\``,
    `> 🆕 **Terbaru:** ${newest} • 🕰️ **Terlama:** ${oldest}`,
    '',
    '```ansi',
    '\u001b[1;32m━━━━━━━━━━ DAFTAR SERVER ━━━━━━━━━━\u001b[0m',
    '```',
    serverList.join('\n\n'),
    '',
    `> 👑 *Hanya kamu yang bisa melihat ini* <@${discordId}>`
  ].join('\n'));
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

  // ═══════════════════════════════════════
  // MODE PvP — lawan user lain
  // ═══════════════════════════════════════
  if (lawanId) {

    // Cegah challenge diri sendiri
    if (lawanId === discordId) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Ga bisa lawan diri sendiri bro!', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Cek apakah user sudah punya challenge aktif
    const existingChallenge = await env.USERS_KV.get(`rps_active:${discordId}`);
    if (existingChallenge) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Kamu masih punya challenge yang belum selesai! Tunggu dulu atau challenge-nya expire.', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Simpan challenge ke KV (expire 5 menit)
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

  // ═══════════════════════════════════════
  // MODE vs BOT
  // ═══════════════════════════════════════
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

  const user = items[pilihanUser];
  const bot  = items[pilihanBot];

  let hasil, hasilEmoji, hasilColor, hasilAnsi;
  if (pilihanUser === pilihanBot) {
    hasil = 'SERI';   hasilEmoji = '🤝'; hasilColor = 0xF1C40F; hasilAnsi = '\u001b[1;33m';
  } else if (user.menang === pilihanBot) {
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
    `🏆 **${username}** menang! ${user.emoji} ${user.nama} ngalahin ${bot.emoji} ${bot.nama}!`,
    `🔥 GG! **${username}** jago banget! ${user.emoji} > ${bot.emoji}`,
    `💪 **${username}** gaskeun! ${user.emoji} KO ${bot.emoji}!`,
    `👑 **${username}** is UNSTOPPABLE! ${user.emoji} menghancurkan ${bot.emoji}!`
  ];
  const pesanKalah = [
    `💀 **${username}** kalah! ${bot.emoji} ${bot.nama} ngalahin ${user.emoji} ${user.nama}!`,
    `😭 Sial! Bot pake ${bot.emoji}, **${username}** pake ${user.emoji}...`,
    `💀 **${username}** dihajar bot! ${user.emoji} < ${bot.emoji}`,
    `🤖 Bot menang lagi! **${username}** harus latihan dulu nih!`
  ];
  const pesanSeri = [
    `🤝 Seri! Dua-duanya pake ${user.emoji} ${user.nama}!`,
    `😅 Draw! Sama-sama pake ${user.emoji}!`,
    `⚡ Seimbang! **${username}** dan bot sama-sama ${user.emoji}!`
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
          `${user.emoji} **${username}** \`${user.nama.toUpperCase()}\` **VS** \`${bot.nama.toUpperCase()}\` ${bot.emoji} **Bot**`,
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
}

// ═══════════════════════════════════════════════════════
// HANDLER BUTTON PvP (interaction.type === 3)
// ═══════════════════════════════════════════════════════
if (interaction.type === 3) {
  const customId = interaction.data.custom_id;

  if (customId.startsWith('rps_pvp:')) {
    const [, challengeId, pilihanLawan] = customId.split(':');
    const clickerId   = interaction.member.user.id;
    const clickerName = interaction.member.user.username;

    const items = {
      batu:    { emoji: '🪨', nama: 'Batu',    menang: 'gunting', kalah: 'kertas'  },
      kertas:  { emoji: '📄', nama: 'Kertas',  menang: 'batu',    kalah: 'gunting' },
      gunting: { emoji: '✂️', nama: 'Gunting', menang: 'kertas',  kalah: 'batu'    }
    };

    // ── Ambil data challenge ──
    const challengeRaw = await env.USERS_KV.get(`rps_challenge:${challengeId}`);
    if (!challengeRaw) {
      return new Response(JSON.stringify({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xFF4444,
            title: '⏰ Challenge Expired!',
            description: [
              '```ansi',
              '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              '\u001b[1;37m  Challenge ini sudah tidak valid!\u001b[0m',
              '\u001b[0;37m  Mungkin sudah expire atau selesai.\u001b[0m',
              '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              '```'
            ].join('\n'),
            footer: { text: '🎮 OwoBim RPS PvP System' }
          }]
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const challenge = JSON.parse(challengeRaw);

    // ── Challenger klik tombol sendiri ──
    if (clickerId === challenge.challengerId) {
      const elapsed   = Math.floor((Date.now() - challenge.createdAt) / 1000);
      const sisaDetik = Math.max(0, 300 - elapsed);

      // Waktu sudah habis
      if (sisaDetik === 0) {
        await Promise.all([
          env.USERS_KV.delete(`rps_challenge:${challengeId}`),
          env.USERS_KV.delete(`rps_active:${challenge.challengerId}`)
        ]);

        return new Response(JSON.stringify({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              color: 0xFF4444,
              title: '⏰ Challenge Expired!',
              description: [
                '```ansi',
                '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
                `\u001b[1;37m  ❌ Lawan kamu \u001b[1;33m<@${challenge.lawanId}>\u001b[0m`,
                `\u001b[1;37m     tidak memilih sampai batas waktu!\u001b[0m`,
                '',
                `\u001b[0;37m  Challenge hangus, stats tidak berubah.\u001b[0m`,
                `\u001b[0;37m  Coba tantang lagi kalau mau! ⚔️\u001b[0m`,
                '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
                '```'
              ].join('\n'),
              footer: { text: '🎮 OwoBim RPS PvP System' }
            }]
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // Masih ada waktu → kasih tau sisa waktu
      const menit = Math.floor(sisaDetik / 60);
      const detik = String(sisaDetik % 60).padStart(2, '0');

      return new Response(JSON.stringify({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0x5865F2,
            title: '⏳ Menunggu Lawan...',
            description: [
              '```ansi',
              '\u001b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              `\u001b[1;37m  👤 Lawan    : \u001b[1;33m<@${challenge.lawanId}>\u001b[0m`,
              `\u001b[1;37m  🔒 Pilihan  : \u001b[1;32mSudah dikunci!\u001b[0m`,
              `\u001b[1;37m  ⏰ Sisa     : \u001b[1;31m${menit}m ${detik}s\u001b[0m`,
              '\u001b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              '\u001b[0;37m  Lawan kamu belum memilih senjata!\u001b[0m',
              '\u001b[0;37m  Klik lagi nanti untuk cek statusnya.\u001b[0m',
              '```'
            ].join('\n'),
            footer: { text: '🎮 OwoBim RPS PvP System' }
          }]
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Orang random klik → tolak ──
    if (clickerId !== challenge.lawanId) {
      return new Response(JSON.stringify({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xFF4444,
            title: '❌ Bukan Challenge Kamu!',
            description: [
              '```ansi',
              '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              `\u001b[1;37m  Ini duel antara:\u001b[0m`,
              `\u001b[1;33m  ⚔️  ${challenge.challengerName} vs <@${challenge.lawanId}>\u001b[0m`,
              '',
              `\u001b[0;37m  Kamu tidak bisa ikut campur!\u001b[0m`,
              '\u001b[1;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
              '```'
            ].join('\n'),
            footer: { text: '🎮 OwoBim RPS PvP System' }
          }]
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Lawan valid → proses hasil ──
    await Promise.all([
      env.USERS_KV.delete(`rps_challenge:${challengeId}`),
      env.USERS_KV.delete(`rps_active:${challenge.challengerId}`)
    ]);

    const pC    = challenge.challengerPilihan;
    const pL    = pilihanLawan;
    const itemC = items[pC];
    const itemL = items[pL];

    let hasilC, hasilL, hasilEmoji, hasilColor;
    if (pC === pL) {
      hasilC = 'SERI';   hasilL = 'SERI';
      hasilEmoji = '🤝'; hasilColor = 0xF1C40F;
    } else if (itemC.menang === pL) {
      hasilC = 'MENANG'; hasilL = 'KALAH';
      hasilEmoji = '🏆'; hasilColor = 0x2ECC71;
    } else {
      hasilC = 'KALAH';  hasilL = 'MENANG';
      hasilEmoji = '🏆'; hasilColor = 0x2ECC71;
    }

    // ── Update stats kedua user ──
    const updateStats = async (userId, hasil) => {
      const raw = await env.USERS_KV.get(`rps:${userId}`);
      const s   = raw ? JSON.parse(raw) : {
        menang: 0, kalah: 0, seri: 0, total: 0,
        streak: 0, bestStreak: 0, history: []
      };
      if (!s.history) s.history = [];
      s.total++;
      if (hasil === 'MENANG') {
        s.menang++;
        s.streak = (s.streak > 0 ? s.streak : 0) + 1;
        if (s.streak > s.bestStreak) s.bestStreak = s.streak;
      } else if (hasil === 'KALAH') {
        s.kalah++;
        s.streak = (s.streak < 0 ? s.streak : 0) - 1;
      } else {
        s.seri++;
        s.streak = 0;
      }
      await env.USERS_KV.put(`rps:${userId}`, JSON.stringify(s), { expirationTtl: 86400 * 365 });
      return s;
    };

    const [statsC, statsL] = await Promise.all([
      updateStats(challenge.challengerId, hasilC),
      updateStats(challenge.lawanId, hasilL)
    ]);

    const wrC    = ((statsC.menang / statsC.total) * 100).toFixed(1);
    const wrL    = ((statsL.menang / statsL.total) * 100).toFixed(1);
    const streakC = statsC.streak > 0 ? `🔥 ${statsC.streak}x WS` : statsC.streak < 0 ? `❄️ ${Math.abs(statsC.streak)}x LS` : `➡️ Reset`;
    const streakL = statsL.streak > 0 ? `🔥 ${statsL.streak}x WS` : statsL.streak < 0 ? `❄️ ${Math.abs(statsL.streak)}x LS` : `➡️ Reset`;

    const winnerText = hasilC === 'MENANG'
      ? `👑 **${challenge.challengerName}** MENANG atas **${clickerName}**!`
      : hasilL === 'MENANG'
      ? `👑 **${clickerName}** MENANG atas **${challenge.challengerName}**!`
      : `🤝 SERI! Dua-duanya pilih ${itemC.emoji} ${itemC.nama}!`;

    return new Response(JSON.stringify({
      type: 7,
      data: {
        content: winnerText,
        embeds: [{
          color: hasilColor,
          title: `${hasilEmoji} RPS PvP — HASIL!`,
          description: [
            '```ansi',
            '\u001b[1;35m━━━━━━━━━━━ ⚔️  PvP RESULT ━━━━━━━━━━━\u001b[0m',
            `\u001b[1;33m  ${itemC.emoji} ${challenge.challengerName.padEnd(12)} VS  ${clickerName} ${itemL.emoji}\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            `\u001b[1;37m  Pilihan :\u001b[0m \u001b[1;32m${itemC.nama.padEnd(10)}\u001b[0m \u001b[1;32m${itemL.nama}\u001b[0m`,
            `\u001b[1;37m  Hasil   :\u001b[0m \u001b[1;33m${hasilC.padEnd(10)}\u001b[0m \u001b[1;33m${hasilL}\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '',
            `\u001b[1;36m  📊 ${challenge.challengerName}\u001b[0m`,
            `\u001b[0;37m     🏆 ${statsC.menang}W  💀 ${statsC.kalah}L  🤝 ${statsC.seri}D\u001b[0m`,
            `\u001b[0;37m     📈 WR: ${wrC}%  ⚡ ${streakC}\u001b[0m`,
            '',
            `\u001b[1;36m  📊 ${clickerName}\u001b[0m`,
            `\u001b[0;37m     🏆 ${statsL.menang}W  💀 ${statsL.kalah}L  🤝 ${statsL.seri}D\u001b[0m`,
            `\u001b[0;37m     📈 WR: ${wrL}%  ⚡ ${streakL}\u001b[0m`,
            '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
            '```'
          ].join('\n'),
          footer: { text: '🎮 OwoBim RPS PvP System' },
          timestamp: new Date().toISOString()
        }],
        components: []
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}





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

// ✅ Handler tombol Approve & Reject
if (type === 3) {
  const customId = body.data?.custom_id || '';

  if (customId.startsWith('quote_approve:') || customId.startsWith('quote_reject:')) {
    const colonIndex = customId.indexOf(':');
    const action = customId.slice(0, colonIndex);
    const quoteId = customId.slice(colonIndex + 1);
    const isApprove = action === 'quote_approve';

    // Ambil data quote dari KV
    const quoteRaw = await env.USERS_KV.get(`quote:${quoteId}`);
    if (!quoteRaw) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '❌ Quote tidak ditemukan atau sudah expired.', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const quoteData = JSON.parse(quoteRaw);
    quoteData.status = isApprove ? 'approved' : 'rejected';
    quoteData.reviewedAt = Date.now();
    quoteData.reviewedBy = body.member?.user?.id || body.user?.id || 'unknown';
    await env.USERS_KV.put(`quote:${quoteId}`, JSON.stringify(quoteData), { expirationTtl: 86400 * 7 });

    // Kalau approve, simpan ke list quotes approved
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

    // Edit pesan di channel (hapus tombol, update warna & judul)
    const messageId = body.message.id;
    const channelId = body.message.channel_id;
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
      },
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
        components: [] // hapus tombol
      })
    });

    // Kirim DM ke user yang submit
    try {
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
        },
        body: JSON.stringify({ recipient_id: quoteData.discordId })
      });
      const dmData = await dmRes.json();

      await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
        },
        body: JSON.stringify({
          embeds: [{
            color: isApprove ? 0x2ECC71 : 0xE74C3C,
            title: isApprove ? '🎉 Quote kamu DISETUJUI!' : '😔 Quote kamu DITOLAK',
            description: `> "${quoteData.teks}"`,
            fields: [
              { name: '🆔 Quote ID', value: `\`${quoteId}\``, inline: true },
              { name: '📍 Status', value: isApprove ? '**Approved** ✅' : '**Rejected** ❌', inline: true }
            ],
            footer: { text: isApprove ? 'Quote kamu sudah masuk ke database!' : 'Kamu bisa submit quote baru kapan saja.' }
          }]
        })
      });
    } catch (e) {
      console.error('Gagal kirim DM:', e.message);
    }

    // Response ephemeral ke yang klik tombol
    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: isApprove ? '✅ Quote berhasil di-approve!' : '❌ Quote berhasil di-reject!',
        flags: 64
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  }
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





if (cmd === 'ai') {
  const pertanyaan = getOption(options, 'pertanyaan');
  if (!pertanyaan) return respond('❌ Tulis pertanyaanmu dulu!');

  const userId = discordId;
  const aiCooldownKey = `ai_cd:${userId}`;
  const lastUsed = await env.USERS_KV.get(aiCooldownKey);

  // Cooldown 8 detik per user (bisa diubah)
  if (lastUsed) {
    const sisa = 8000 - (Date.now() - parseInt(lastUsed));
    if (sisa > 0) {
      const detik = Math.ceil(sisa / 1000);
      return respond(`⏳ Tunggu **${detik} detik** lagi sebelum pakai /ai lagi ya~`);
    }
  }

  // Simpan waktu terakhir pakai
  await env.USERS_KV.put(aiCooldownKey, String(Date.now()), { expirationTtl: 60 });

  // Defer response
  await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 })
  });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah Jarvis, asisten AI yang cerdas, ramah, sedikit humoris. Jawab singkat, padat, gunakan emoji secukupnya. Jawab dalam bahasa yang sama dengan user.'
          },
          { role: 'user', content: pertanyaan }
        ],
        max_tokens: 1024,
        temperature: 0.75
      })
    });

    if (!groqRes.ok) throw new Error(`Groq error ${groqRes.status}`);

    const groqData = await groqRes.json();
    let jawaban = groqData.choices?.[0]?.message?.content?.trim() 
      || '❌ Maaf, aku lagi bingung nih. Coba lagi ya!';

    const jawabanDisplay = jawaban.length > 3800 
      ? jawaban.slice(0, 3800) + '\n\n_...dipotong._' 
      : jawaban;

    const embed = {
      color: 0x5865F2,
      author: { name: '🤖 Jarvis AI' },
      description: jawabanDisplay,
      fields: [{
        name: '❓ Pertanyaan',
        value: `\`\`\`${pertanyaan.slice(0, 200)}${pertanyaan.length > 200 ? '...' : ''}\`\`\``,
        inline: false
      }],
      footer: { text: `Ditanya oleh ${username} • Powered by AI OwoBim` },
      timestamp: new Date().toISOString()
    };

    await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID || env.CLIENT_ID}/${interaction.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

  } catch (err) {
    console.error('AI Error:', err);
    await fetch(`https://discord.com/api/v10/webhooks/${env.APP_ID || env.CLIENT_ID}/${interaction.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '❌ Jarvis lagi error atau API Groq sedang sibuk. Coba lagi nanti ya!' })
    });
  }

  return new Response(null, { status: 202 });
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
