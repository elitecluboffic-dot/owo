// functions/api/interactions.js
export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };

  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body      = await request.text();

  const isValid = await verifyDiscordRequest(env.DISCORD_PUBLIC_KEY, signature, timestamp, body);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const interaction = JSON.parse(body);

  // PING
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), { headers });
  }

  // Slash Commands
  if (interaction.type === 2) {
    const cmd       = interaction.data.name;
    const options   = interaction.data.options || [];
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const username  = interaction.member?.user?.username || interaction.user?.username;

    const userKey = await env.USERS_KV.get(`discord:${discordId}`);

    // /register
    if (cmd === 'register') {
      if (userKey) {
        return respond('❌ Kamu sudah punya akun! Gunakan `/wcash` untuk cek balance.');
      }
      const password = getOption(options, 'password');
      const encoder  = new TextEncoder();
      const hashBuf  = await crypto.subtle.digest('SHA-256', encoder.encode(password));
      const hash     = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const userData = {
        balance: 10000,
        passwordHash: hash,
        webhookUrl: null,
        discordId,
        discordUsername: username,
        createdAt: Date.now()
      };
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(userData));
      await env.USERS_KV.put(`discord:${discordId}`, discordId);
      return respond(`✅ Akun berhasil dibuat! Selamat datang **${username}** 🎉\nCowoncy awal kamu: 🪙 **10.000**`);
    }

    if (!userKey) {
      return respond('❌ Kamu belum punya akun! Gunakan `/register password:xxx` dulu.');
    }

    const userStr = await env.USERS_KV.get(`user:${discordId}`);
    if (!userStr) return respond('❌ Data akun tidak ditemukan. Coba `/register` ulang.');
    let user = JSON.parse(userStr);

    // /wcash
    if (cmd === 'wcash') {
      return respond(`💰 **${username}**, cowoncy kamu saat ini:\n🪙 **${user.balance.toLocaleString()}**`);
    }

    // /wcf
    if (cmd === 'wcf') {
      const amountRaw = getOption(options, 'jumlah');
      let bet = amountRaw === 'all' ? user.balance : parseInt(amountRaw);
      if (!bet || bet <= 0) return respond('❌ Jumlah tidak valid.');
      if (bet > user.balance) return respond(`❌ Cowoncy tidak cukup! Kamu punya 🪙 **${user.balance.toLocaleString()}**`);

      user.balance -= bet;
      const win = Math.random() > 0.5;
      let msg;
      if (win) {
        const winAmount = bet * 2;
        user.balance += winAmount;
        msg = `**${username}** memasang 🪙 ${bet.toLocaleString()} dan memilih heads\nKoin berputar... 🪙 dan kamu **MENANG** 🪙 ${winAmount.toLocaleString()}!!\nSisa cowoncy: 🪙 **${user.balance.toLocaleString()}**`;
      } else {
        msg = `**${username}** memasang 🪙 ${bet.toLocaleString()} dan memilih heads\nKoin berputar... 🪙 dan kamu **KALAH** :c\nSisa cowoncy: 🪙 **${user.balance.toLocaleString()}**`;
      }
      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      return respond(msg);
    }

    // /wsend
    if (cmd === 'wsend') {
      const targetId  = getOption(options, 'target');
      const amountRaw = getOption(options, 'jumlah');

      if (!targetId || targetId === discordId) {
        return respond('❌ Target tidak valid atau tidak bisa kirim ke diri sendiri!');
      }

      const targetStr = await env.USERS_KV.get(`user:${targetId}`);
      if (!targetStr) return respond('❌ User target belum punya akun di OwoCash!');
      let target = JSON.parse(targetStr);

      let amount = amountRaw === 'all' ? user.balance : parseInt(amountRaw);
      if (!amount || amount <= 0) return respond('❌ Jumlah tidak valid.');
      if (amount > user.balance) return respond(`❌ Cowoncy tidak cukup! Kamu punya 🪙 **${user.balance.toLocaleString()}**`);

      user.balance   -= amount;
      target.balance += amount;

      await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(user));
      await env.USERS_KV.put(`user:${targetId}`, JSON.stringify(target));

      return respond(
        `✅ Berhasil transfer!\n` +
        `📤 **${username}** → <@${targetId}> : 🪙 **${amount.toLocaleString()}**\n` +
        `Sisa cowoncy kamu: 🪙 **${user.balance.toLocaleString()}**`
      );
    }

    return respond('❓ Command tidak dikenal.');
  }

  return new Response('Unknown interaction type', { status: 400 });
};

function getOption(options, name) {
  const opt = options.find(o => o.name === name);
  return opt ? String(opt.value) : null;
}

function respond(content) {
  return new Response(JSON.stringify({ type: 4, data: { content } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ── Fix: gunakan Ed25519 algorithm yang benar untuk Cloudflare Workers ──
async function verifyDiscordRequest(publicKey, signature, timestamp, body) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToUint8Array(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch (e) {
    return false;
  }
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}
