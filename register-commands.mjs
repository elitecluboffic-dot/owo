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
},

  {
  name: 'shorten',
  description: 'Perpendek URL panjang menjadi link pendek 🔗',
  options: [{ name: 'url', description: 'URL yang mau diperpendek', type: 3, required: true }]
},


  {
  name: 'translate',
  description: '🌐 Terjemahkan teks ke 30+ bahasa secara instan!',
  options: [
    {
      name: 'teks',
      description: '📝 Teks yang mau diterjemahkan (maks. 500 karakter)',
      type: 3,
      required: true
    },
    {
      name: 'bahasa',
      description: '🌍 Kode bahasa tujuan — en | ja | ko | zh | ar | fr | de | id | dll',
      type: 3,
      required: true
    }
  ]
},

  {
  name: 'weather',
  description: '🌤️ Cek cuaca real-time kota mana aja di seluruh dunia!',
  options: [
    {
      name: 'kota',
      description: '📍 Nama kota yang mau dicek — Jakarta | Tokyo | London | dll',
      type: 3,
      required: true
    }
  ]
},



  {
  name: 'kurs',
  description: '💱 Cek kurs mata uang real-time ke 150+ negara!',
  options: [
    {
      name: 'dari',
      description: '💵 Mata uang asal — USD | IDR | JPY | EUR | dll',
      type: 3,
      required: true
    },
    {
      name: 'ke',
      description: '💴 Mata uang tujuan — IDR | USD | SGD | dll',
      type: 3,
      required: true
    },
    {
      name: 'jumlah',
      description: '🔢 Jumlah yang mau dikonversi (default: 1)',
      type: 3,
      required: false
    }
  ]
},


  {
  name: 'ip',
  description: '🌐 Lacak lokasi, jaringan & keamanan IP address secara real-time!',
  options: [
    {
      name: 'ip',
      description: '🔍 Masukkan IP address target — kosongkan untuk cek IP kamu sendiri',
      type: 3,
      required: false
    }
  ]
},


  {
  name: 'color',
  description: '🎨 Analisis warna dari kode HEX secara lengkap & detail!',
  options: [
    {
      name: 'hex',
      description: '🔷 Kode warna HEX — contoh: FF5733 atau #3498DB',
      type: 3,
      required: true
    }
  ]
},



  {
  name: 'feedback',
  description: '📬 Kirim feedback, saran, atau laporan ke owner bot!',
  options: [
    {
      name: 'tipe',
      description: '📋 Pilih tipe pesan',
      type: 3,
      required: true,
      choices: [
        { name: '💡 Saran / Ide Fitur', value: 'saran' },
        { name: '🐛 Bug Report', value: 'bug' },
        { name: '😡 Complaint / Keluhan', value: 'complaint' },
        { name: '🙏 Feedback Umum', value: 'feedback' },
        { name: '🚨 Report User', value: 'report' }
      ]
    },
    {
      name: 'pesan',
      description: '✏️ Isi pesan kamu (maks. 1000 karakter)',
      type: 3,
      required: true
    },
    {
      name: 'target',
      description: '👤 User yang mau direport (khusus tipe Report User)',
      type: 6,
      required: false
    },
    {
      name: 'bukti',
      description: '🔗 Link bukti/screenshot (opsional)',
      type: 3,
      required: false
    }
  ]
},


  {
  name: 'explode',
  description: '💥 Ledakkan seseorang dengan efek api & ledakan dahsyat!',
  options: [
    {
      name: 'target',
      description: '🎯 User yang mau diledakkan — pilih korbanmu!',
      type: 6,
      required: true
    }
  ]
},

  

  {
  name: 'makequote',
  description: '💬 Buat quote aesthetic dari ucapan seseorang!',
  options: [
    {
      name: 'teks',
      description: '✍️ Isi quote yang mau dibuat (maks. 200 karakter)',
      type: 3,
      required: true
    },
    {
      name: 'user',
      description: '👤 User yang jadi pengujar quote (default: diri sendiri)',
      type: 6,
      required: false
    },
    {
      name: 'warna',
      description: '🎨 Warna tema embed',
      type: 3,
      required: false,
      choices: [
        { name: '⬛ Default', value: 'default' },
        { name: '🔴 Merah',   value: 'merah'   },
        { name: '🔵 Biru',    value: 'biru'     },
        { name: '🟢 Hijau',   value: 'hijau'    },
        { name: '🟡 Kuning',  value: 'kuning'   },
        { name: '🟣 Ungu',    value: 'ungu'     },
        { name: '🩷 Pink',    value: 'pink'     },
        { name: '🟠 Orange',  value: 'orange'   },
        { name: '⚫ Hitam',   value: 'hitam'    }
      ]
    }
  ]
},



{
  name: 'rps',
  description: '✂️ Main Rock Paper Scissors lawan bot atau teman!',
  options: [
    {
      name: 'pilihan',
      description: '🎯 Pilih senjatamu!',
      type: 3,
      required: true,
      choices: [
        { name: '🪨 Batu',    value: 'batu'    },
        { name: '📄 Kertas',  value: 'kertas'  },
        { name: '✂️ Gunting', value: 'gunting' }
      ]
    },
    {
      name: 'lawan',
      description: '👤 Tag user untuk PvP — kosongkan untuk lawan bot',
      type: 6,
      required: false
    },
    {
      name: 'mode',
      description: '⚙️ Difficulty bot — hanya berlaku jika lawan bot',
      type: 3,
      required: false,
      choices: [
        { name: '😊 Easy   — Bot agak bego (70% kalah)',      value: 'easy'   },
        { name: '⚔️ Medium — Pure random 50/50 (default)',    value: 'medium' },
        { name: '🧠 Hard   — Bot analisa pola kamu!',         value: 'hard'   }
      ]
    }
  ]
},


  {
  "name": "quotesweb",
  "description": "Kirim quote ke website owo.kraxx.my.id",
  "options": [
    {
      "name": "teks",
      "description": "Isi quote yang mau dikirim",
      "type": 3,
      "required": true
    }
  ]
},



  {
  name: 'confess',
  description: '💌 Kirim pesan anonim rahasia ke seseorang!',
  options: [
    {
      name: 'target',
      description: '👤 User yang mau dikirimi confess',
      type: 6,
      required: true
    },
    {
      name: 'pesan',
      description: '💬 Isi confess kamu (maks. 500 karakter)',
      type: 3,
      required: true
    },
    {
      name: 'kategori',
      description: '🏷️ Kategori confess',
      type: 3,
      required: false,
      choices: [
        { name: '💕 Perasaan / Curhat', value: 'perasaan' },
        { name: '🤝 Persahabatan',      value: 'sahabat'  },
        { name: '🙏 Permintaan Maaf',   value: 'maaf'     },
        { name: '🔥 Gosip / Tea',       value: 'gosip'    },
        { name: '😂 Iseng / Random',    value: 'random'   },
        { name: '🎯 Serius / Penting',  value: 'serius'   }
      ]
    },
    {
      name: 'mood',
      description: '🎭 Mood kamu saat confess',
      type: 3,
      required: false,
      choices: [
        { name: '😊 Happy',   value: 'happy'   },
        { name: '😢 Sad',     value: 'sad'     },
        { name: '🥰 Lovey',   value: 'lovey'   },
        { name: '😳 Shy',     value: 'shy'     },
        { name: '😰 Nervous', value: 'nervous' },
        { name: '😡 Angry',   value: 'angry'   }
      ]
    }
  ]
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
