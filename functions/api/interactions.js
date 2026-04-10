export const onRequestPost = async ({ request, env }) => {
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

  if (interaction.type === 2) {
    const cmd       = interaction.data.name;
    const options   = interaction.data.options || [];
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const username  = interaction.member?.user?.username || interaction.user?.username;
    const userKey   = await env.USERS_KV.get(`discord:${discordId}`);

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
  const targetName = targetId ? `user dengan ID ${targetId}` : username;

  if (!env.GEMINI_API_KEY) return respond('⚠️ GEMINI_API_KEY belum diset di Cloudflare!');

  try {
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Buat 1 kalimat roast lucu dalam bahasa Indonesia gaul untuk ${targetName}. Gaya: santai, receh, gak kasar, boleh pakai analogi teknologi/internet/game. Langsung tulis roastnya saja tanpa penjelasan tambahan, tanpa tanda kutip.`
          }]
        }]
      })
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json();
      return respond(`⚠️ Gemini Error: ${errData.error?.message || 'Unknown error'}`);
    }

    const aiData = await aiRes.json();
    const roastText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Gak ada kata-kata yang cukup buat roast kamu 😂';
    return respond(`🔥 **ROASTED!**\n\n${targetMention} ${roastText}`);
  } catch (e) {
    return respond(`⚠️ Error: ${e.message}`);
  }
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
