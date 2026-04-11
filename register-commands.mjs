// register-commands.mjs
// Cara jalankan:
// TOKEN=xxx CLIENT_ID=yyy node register-commands.mjs
const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
if (!TOKEN || !CLIENT_ID) {
  console.error('❌ TOKEN dan CLIENT_ID harus diset!\nCara: TOKEN=xxx CLIENT_ID=yyy node register-commands.mjs');
  process.exit(1);
}
const commands = [
  {
    name: 'register',
    description: 'Buat akun OwoCash baru',
    options: [{ name: 'password', description: 'Password akun kamu', type: 3, required: true }]
  },
  {
    name: 'wcash',
    description: 'Cek saldo cowoncy kamu'
  },
  {
    name: 'wcf',
    description: 'Coinflip — taruhkan cowoncy kamu',
    options: [{ name: 'jumlah', description: 'Jumlah cowoncy yang ditaruhkan (angka atau "all")', type: 3, required: true }]
  },
  {
    name: 'wsend',
    description: 'Kirim cowoncy ke pemain lain',
    options: [
      { name: 'target', description: 'User Discord tujuan', type: 6, required: true },
      { name: 'jumlah', description: 'Jumlah cowoncy yang dikirim (angka atau "all")', type: 3, required: true }
    ]
  },
  {
    name: 'daily',
    description: 'Ambil bonus harian 🪙 15.000 (cooldown 24 jam)'
  },
  {
    name: 'kerja',
    description: 'Kerja dan dapat gaji 🪙 25.000 (cooldown 1 jam)'
  },
  {
    name: 'ping',
    description: 'Cek latency bot 🏓'
  },
  {
    name: 'stats',
    description: 'Lihat statistik server 📊'
  },
  {
    name: 'leaderboard',
    description: 'Ranking 10 pemain terkaya 🏆'
  },
  {
    name: 'bank',
    description: 'Cek saldo bank & bunga 10%/minggu 🏦'
  },
  {
    name: 'deposit',
    description: 'Simpan cowoncy ke bank 💰',
    options: [{ name: 'jumlah', description: 'Jumlah cowoncy (angka atau "all")', type: 3, required: true }]
  },
  {
    name: 'withdraw',
    description: 'Ambil cowoncy dari bank 💵',
    options: [{ name: 'jumlah', description: 'Jumlah cowoncy (angka atau "all")', type: 3, required: true }]
  },
  {
    name: 'join-giveaway',
    description: 'Ikut giveaway aktif 🎁'
  },
  {
  name: 'marry',
  description: 'Lamar user lain 💍',
  options: [{ name: 'target', description: 'User yang mau dilamar', type: 6, required: true }]
},
{
  name: 'accept-marry',
  description: 'Terima lamaran 💍'
},
{
  name: 'tolak-marry',
  description: 'Tolak lamaran 💔'
},
{
  name: 'divorce',
  description: 'Cerai dari pasangan 💔'
},
{
  name: 'partner',
  description: 'Lihat info pasangan kamu 👫'
},
  {
    name: 'roast',
    description: 'Roast seseorang dengan kata-kata pedas 🔥',
    options: [{ name: 'target', description: 'User yang mau diroast', type: 6, required: false }]
  },
  {
  name: 'afk',
  description: 'Set status AFK kamu 💤',
  options: [{ name: 'alasan', description: 'Alasan AFK (opsional)', type: 3, required: false }]
},
{
  name: 'unafk',
  description: 'Hapus status AFK kamu ✅'
},

  {
  name: 'infopemilikbot',
  description: ' Lihat info & fitur OWO BIM bot'
},

  
{
    name: 'avatar',
    description: 'Ambil foto profil user 🖼️',
    options: [
      {
        name: 'user',
        description: 'User yang mau diambil avatarnya',
        type: 6,
        required: false
      }
    ]
  },

  {
  name: 'level',
  description: 'Lihat leaderboard level semua user 🏅'
},

  {
  name: 'fix-level',
  description: 'Fix total earned semua user (admin only)'
},


  {
  name: 'hug',
  description: 'Peluk seseorang 🤗',
  options: [{ name: 'target', description: 'User yang mau dipeluk', type: 6, required: true }]
},
{
  name: 'slap',
  description: 'Tampar seseorang 👋',
  options: [{ name: 'target', description: 'User yang mau ditampar', type: 6, required: true }]
},
{
  name: 'pat',
  description: 'Pat seseorang ✋',
  options: [{ name: 'target', description: 'User yang mau di-pat', type: 6, required: true }]
},

{
    name: 'help',
    description: 'Menampilkan daftar semua command yang tersedia 📖'
  },


  {
  name: 'servers',
  description: 'Lihat semua server yang menggunakan bot (Owner only)',
},
  {
  name: 'server-stats',
  description: 'Lihat statistik server & channel teraktif',
}
  
  
];
console.log('⏳ Mendaftarkan slash commands...\n');
const res = await fetch(
  `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`,
  {
    method: 'PUT',
    headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  }
);
const data = await res.json();
if (res.ok) {
  console.log(`✅ ${data.length} command berhasil didaftarkan!\n`);
  data.forEach(c => console.log(`   /${c.name} — ${c.description}`));
  console.log('\n🎉 Selesai!');
} else {
  console.error('❌ Gagal:', JSON.stringify(data, null, 2));
}
