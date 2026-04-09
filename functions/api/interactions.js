export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };

  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body      = await request.text();

  // Kalau tidak ada signature → langsung tolak
  if (!signature || !timestamp) {
    return new Response('Missing headers', { status: 401 });
  }

  // Skip verifikasi dulu untuk debug
  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), { headers });
  }

  if (interaction.type === 2) {
    const cmd       = interaction.data.name;
    const options   = interaction.data.options || [];
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const username  = interaction.member?.user?.username || interaction.user?.username;

    const userKey = await env.USERS_KV.get(`discord:${discordId}`);

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

    return respond('❓ Command tidak dikenal.');
  }

  return new Response('ok', { status: 200 });
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
