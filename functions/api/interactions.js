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
  ];

  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  return respond(`🔥 **ROASTED!**\n\n${targetMention} ${roast}`);
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
