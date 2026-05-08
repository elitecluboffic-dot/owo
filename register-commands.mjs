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
},


  {
  "name": "slots",
  "description": "🎰 Main slot machine! Menangkan jackpot besar!",
  "options": [
    {
      "name": "jumlah",
      "description": "Jumlah taruhan (min 100, max 500000, atau 'all')",
      "type": 3,
      "required": true
    }
  ]
},

  


  {
  name: 'spawn',
  description: '⚡ Munculkan Pokémon liar di channel ini!'
},
{
  name: 'catch',
  description: '🎯 Tangkap Pokémon yang sedang muncul!',
  options: [
    {
      name: 'nama',
      description: 'Nama Pokémon yang mau ditangkap',
      type: 3,
      required: true
    }
  ]
},
{
  name: 'pokedex',
  description: '📖 Lihat koleksi Pokémon kamu atau orang lain!',
  options: [
    {
      name: 'user',
      description: 'Lihat koleksi user lain (kosongkan untuk diri sendiri)',
      type: 6,
      required: false
    },
    {
      name: 'page',
      description: 'Halaman koleksi (default: 1)',
      type: 4,
      required: false
    }
  ]
},



  {
  name: 'gacha',
  description: '🎰 Beli Pokémon random pakai coins!',
  options: [
    {
      name: 'tier',
      description: 'Pilih tier gacha',
      type: 3,
      required: true,
      choices: [
        { name: '⚪ Basic — 25.000 coins (Common & Uncommon)',        value: 'basic'     },
        { name: '🟡 Premium — 75.000 coins (Uncommon, Rare, Epic)',   value: 'premium'   },
        { name: '🔴 Legendary — 200.000 coins (Rare, Epic, Legend)',  value: 'legendary' }
      ]
    }
  ]
},
  {
  name: 'pokemon',
  description: '🔍 Lihat detail & gambar Pokémon di koleksimu!',
  options: [
    {
      name: 'nama',
      description: 'Nama Pokémon yang mau dilihat',
      type: 3,
      required: true
    }
  ]
},



{
  "name": "saham",
  "description": "Sistem saham virtual",
  "options": [
    {
      "name": "aksi",
      "type": 3,
      "required": true,
      "description": "Pilih aksi",
      "choices": [
        {"name": "cek", "value": "cek"},
        {"name": "beli", "value": "beli"},
        {"name": "jual", "value": "jual"},
        {"name": "portofolio", "value": "portofolio"},
        {"name": "history", "value": "history"},
        {"name": "top", "value": "top"},
        {"name": "info", "value": "info"}
      ]
    },
    {
      "name": "ticker",
      "type": 3,
      "required": false,
      "description": "Kode saham (contoh: AAPL, TSLA)"
    },
    {
      "name": "jumlah",
      "type": 3,
      "required": false,
      "description": "Jumlah lot (atau 'all' untuk jual semua)"
    }
  ]
},


  


{
  "name": "crypto",
  "description": "Sistem crypto virtual OwoBim",
  "options": [
    {
      "type": 1,
      "name": "cek",
      "description": "Cek harga coin secara real-time",
      "options": [
        {
          "name": "coin",
          "type": 3,
          "required": true,
          "description": "Kode coin (contoh: BTC, ETH, SOL)",
          "autocomplete": true
        }
      ]
    },
    {
      "type": 1,
      "name": "beli",
      "description": "Beli coin crypto dengan cowoncy",
      "options": [
        {
          "name": "coin",
          "type": 3,
          "required": true,
          "description": "Kode coin yang ingin dibeli",
          "autocomplete": true
        },
        {
          "name": "jumlah",
          "type": 3,
          "required": true,
          "description": "Jumlah unit yang ingin dibeli (contoh: 0.5, 10, 100)"
        }
      ]
    },
    {
      "type": 1,
      "name": "jual",
      "description": "Jual coin crypto dari portofolio kamu",
      "options": [
        {
          "name": "coin",
          "type": 3,
          "required": true,
          "description": "Kode coin yang ingin dijual",
          "autocomplete": true
        },
        {
          "name": "jumlah",
          "type": 3,
          "required": false,
          "description": "Jumlah unit (kosongkan = jual semua / ketik 'all')"
        }
      ]
    },
    {
      "type": 1,
      "name": "portofolio",
      "description": "Lihat portofolio crypto kamu"
    },
    {
      "type": 1,
      "name": "history",
      "description": "Lihat 15 riwayat transaksi crypto terakhir"
    },
    {
      "type": 1,
      "name": "info",
      "description": "Lihat daftar semua coin yang tersedia"
    }
  ]
},


  

{
  name: 'search',
  description: '🔍 Cari informasi di Google secara real-time!',
  options: [
    {
      name: 'query',
      description: '🔍 Kata kunci yang mau dicari',
      type: 3,
      required: true
    },
    {
      name: 'tipe',
      description: '📂 Tipe pencarian',
      type: 3,
      required: false,
      choices: [
        { name: '🌐 Web',     value: 'web'   },
        { name: '🖼️ Gambar', value: 'image' },
        { name: '📰 Berita', value: 'news'  }
      ]
    }
  ]
},



  



{
  name: 'fishing',
  description: '🎣 Mancing ikan dengan berbagai rarity!',
  options: [
    {
      name: 'bait',
      description: '🪱 Pilih umpan (opsional)',
      type: 3,
      required: false,
      choices: [
        { name: '🪱 Cacing (gratis)',           value: 'worm'           },
        { name: '🦐 Udang — 2.000',             value: 'shrimp'         },
        { name: '🦑 Cumi — 5.000',              value: 'squid'          },
        { name: '🐠 Ikan Emas — 15.000',        value: 'goldfish'       },
        { name: '⚡ Legendary Lure — 50.000',   value: 'legendary_lure' }
      ]
    },
    {
      name: 'location',
      description: '📍 Pilih lokasi mancing',
      type: 3,
      required: false,
      choices: [
        { name: '🌊 Laut (default)',             value: 'ocean' },
        { name: '🏞️ Sungai (-5% rare)',          value: 'river' },
        { name: '🌑 Laut Dalam (+20% rare)',      value: 'deep'  }
      ]
    }
  ]
},

{
  name: 'fish-inventory',
  description: '🎒 Lihat kantong ikan kamu'
},

{
  name: 'fish-sell',
  description: '🔨 Lelang & jual ikan',
  options: [
    {
      name: 'aksi',
      description: 'Pilih aksi',
      type: 3,
      required: true,
      choices: [
        { name: '🔨 start — Mulai lelang',         value: 'start'   },
        { name: '💰 bid — Pasang penawaran',        value: 'bid'     },
        { name: '🏷️ sell — Jual 1 ikan langsung',  value: 'sell'    },
        { name: '💵 sellall — Jual semua langsung', value: 'sellall' },
        { name: '🎁 claim — Ambil hasil lelang',    value: 'claim'   },
        { name: '📋 list — Lihat lelang aktif',     value: 'list'    }
      ]
    },
    { name: 'id',         description: 'ID ikan (FISH-xxx) atau Auction ID (AUC-xxx)', type: 3, required: false },
    { name: 'harga_awal', description: 'Harga awal lelang',                            type: 4, required: false },
    { name: 'durasi',     description: 'Durasi lelang (1-24 jam)',                     type: 4, required: false },
    { name: 'jumlah',     description: 'Jumlah bid',                                   type: 4, required: false },
    {
      name: 'rarity',
      description: 'Filter rarity untuk sellall',
      type: 3,
      required: false,
      choices: [
        { name: '⚪ Common',     value: 'common'    },
        { name: '🟢 Uncommon',  value: 'uncommon'  },
        { name: '🔵 Rare',      value: 'rare'      },
        { name: '🟣 Epic',      value: 'epic'      },
        { name: '🟡 Legendary', value: 'legendary' },
        { name: '🌌 Mythic',    value: 'mythic'    },
        { name: '🌀 Semua',     value: 'all'       }
      ]
    }
  ]
},

{
  name: 'fish-shop',
  description: '🏪 Beli rod & bait untuk mancing',
  options: [
    {
      name: 'aksi',
      description: 'Pilih aksi',
      type: 3,
      required: true,
      choices: [
        { name: '🛒 browse — Lihat toko', value: 'browse' },
        { name: '💳 buy — Beli item',     value: 'buy'    }
      ]
    },
    {
      name: 'rod',
      description: 'Pilih rod yang mau dibeli',
      type: 3,
      required: false,
      choices: [
        { name: '⚙️ Iron Rod — 15.000',     value: 'iron'    },
        { name: '✨ Gold Rod — 50.000',     value: 'gold'    },
        { name: '💎 Diamond Rod — 150.000', value: 'diamond' },
        { name: '🌌 Mythic Rod — 500.000',  value: 'mythic'  }
      ]
    },
    {
      name: 'bait',
      description: 'Pilih bait yang mau dibeli',
      type: 3,
      required: false,
      choices: [
        { name: '🪱 Cacing — 500',            value: 'worm'           },
        { name: '🦐 Udang — 2.000',           value: 'shrimp'         },
        { name: '🦑 Cumi — 5.000',            value: 'squid'          },
        { name: '🐠 Ikan Emas — 15.000',      value: 'goldfish'       },
        { name: '⚡ Legendary Lure — 50.000', value: 'legendary_lure' }
      ]
    },
    { name: 'jumlah', description: 'Jumlah bait yang mau dibeli (1-99)', type: 4, required: false }
  ]
},

{
  name: 'aquarium',
  description: '🐠 Kelola koleksi aquarium ikan kamu',
  options: [
    {
      name: 'aksi',
      description: 'Pilih aksi',
      type: 3,
      required: true,
      choices: [
        { name: '👁️ view — Lihat aquarium',           value: 'view'   },
        { name: '🔍 info — Detail & gambar 1 ikan',    value: 'info'   },
        { name: '➕ add — Pindahkan ikan ke aquarium',  value: 'add'    },
        { name: '➖ remove — Keluarkan dari aquarium',  value: 'remove' }
      ]
    },
    { name: 'id',   description: 'ID ikan (FISH-xxx)',      type: 3, required: false },
    { name: 'user', description: 'Lihat aquarium user lain', type: 6, required: false }
  ]
},

{
  name: 'fish-leaderboard',
  description: '🏆 Ranking top fisher server',
  options: [
    {
      name: 'filter',
      description: 'Filter leaderboard',
      type: 3,
      required: false,
      choices: [
        { name: '🎣 Jumlah Tangkapan', value: 'catch'     },
        { name: '💰 Total Nilai',      value: 'value'     },
        { name: '🟡 Legendary Catch',  value: 'legendary' }
      ]
    }
  ]
},

{
  name: 'fish-stats',
  description: '📊 Lihat statistik mancing kamu atau user lain',
  options: [
    { name: 'user', description: 'Lihat stats user lain', type: 6, required: false }
  ]
},



  {
    name: 'buycowoncy',
    description: '🪙 Beli cowoncy via DM bot!'
  },
  {
    name: 'addcowoncy',
    description: 'Tambah cowoncy ke user — Owner only',
    options: [
      { name: 'target',  description: 'User target',              type: 6, required: true  },
      { name: 'jumlah',  description: 'Jumlah cowoncy',           type: 4, required: true  },
      { name: 'orderid', description: 'Order ID (opsional)',      type: 3, required: false }
    ]
  },




  {
  name: 'love',
  description: '💕 Cek persentase love antara dua orang!',
  options: [
    {
      name: 'target',
      description: 'User yang mau dicek love-nya',
      type: 6, // USER
      required: true
    },
    {
      name: 'mode',
      description: 'Mode kalkulasi',
      type: 3, // STRING
      required: false,
      choices: [
        { name: '🔢 Konsisten (selalu sama)', value: 'fixed' },
        { name: '🎲 Random (acak tiap cek)', value: 'random' }
      ]
    }
  ]
},





  {
  name: 'download',
  description: '⬇️ Download video TikTok / Instagram Reels / YouTube Shorts tanpa watermark',
  options: [{
    name: 'url',
    description: 'URL video yang mau didownload',
    type: 3, // STRING
    required: true
  }]
},




{
  name: 'email-otp',
  description: '📧 Generate email sementara untuk menerima OTP otomatis'
},
{
  name: 'verify-otp',
  description: '🔑 Verifikasi kode OTP yang ditangkap otomatis oleh sistem',
  options: [
    {
      name: 'kode',
      description: 'Masukkan 6 digit kode OTP yang lo terima',
      type: 3, // STRING
      required: true
    }
  ]
},




  {
  "name": "imagine",
  "description": "Generate gambar dengan AI",
  "options": [
    { "name": "prompt", "description": "Deskripsi gambar yang mau dibuat", "type": 3, "required": true },
    { "name": "ratio", "description": "Rasio gambar", "type": 3, "required": false,
      "choices": [
        {"name": "1:1 (Square)", "value": "1:1"},
        {"name": "16:9 (Landscape)", "value": "16:9"},
        {"name": "9:16 (Portrait)", "value": "9:16"},
        {"name": "4:3", "value": "4:3"},
        {"name": "3:4", "value": "3:4"}
      ]
    },
    { "name": "negative", "description": "Hal yang tidak mau muncul di gambar", "type": 3, "required": false }
  ]
},


  

{
  "name": "nasa",
  "description": "🚀 NASA — Eksplorasi luar angkasa!",
  "options": [
    {
      "name": "aksi",
      "description": "Pilih fitur NASA",
      "type": 3,
      "required": true,
      "choices": [
        { "name": "🌌 APOD — Foto Astronomi Hari Ini", "value": "apod" },
        { "name": "🔴 Mars — Foto Rover Mars", "value": "mars" },
        { "name": "☄️ Asteroid — Near Earth Objects", "value": "asteroid" },
        { "name": "🌍 Earth — Foto Bumi dari Luar Angkasa", "value": "earth" },
        { "name": "🔍 Search — NASA Image Library", "value": "search" },
        { "name": "🪐 Planet — Info Planet Tata Surya", "value": "planet" },
        { "name": "ℹ️ Info — Daftar Command", "value": "info" }
      ]
    },
    {
      "name": "query",
      "description": "Kata kunci pencarian / nama planet (untuk aksi search & planet)",
      "type": 3,
      "required": false
    },
    {
      "name": "tanggal",
      "description": "Tanggal APOD format YYYY-MM-DD (contoh: 2024-01-15)",
      "type": 3,
      "required": false
    },
    {
      "name": "rover",
      "description": "Pilih rover Mars",
      "type": 3,
      "required": false,
      "choices": [
        { "name": "🤖 Curiosity", "value": "curiosity" },
        { "name": "🔭 Perseverance", "value": "perseverance" },
        { "name": "🏺 Opportunity", "value": "opportunity" },
        { "name": "👻 Spirit", "value": "spirit" }
      ]
    },
    {
      "name": "camera",
      "description": "Filter camera rover (FHAZ, RHAZ, MAST, CHEMCAM, dll)",
      "type": 3,
      "required": false
    }
  ]
},





{
  name: 'qr',
  description: '📱 Generate QR Code dari teks atau URL!',
  options: [
    {
      name: 'teks',
      description: '📝 Teks atau URL yang mau dijadikan QR Code',
      type: 3,
      required: true
    },
    {
      name: 'warna',
      description: '🎨 Warna QR Code dalam HEX (contoh: FF0000) — default: 5865F2',
      type: 3,
      required: false
    },
    {
      name: 'bg',
      description: '🖼️ Warna background dalam HEX (contoh: FFFFFF) — default: 2B2D31',
      type: 3,
      required: false
    },
    {
      name: 'ukuran',
      description: '📐 Ukuran gambar QR Code (px)',
      type: 3,
      required: false,
      choices: [
        { name: '200x200', value: '200' },
        { name: '300x300', value: '300' },
        { name: '400x400 (default)', value: '400' },
        { name: '500x500', value: '500' },
        { name: '600x600', value: '600' }
      ]
    },
    {
      name: 'background',
      description: '🖼️ URL gambar background custom (pakai Cloudinary overlay)',
      type: 3,
      required: false
    }
  ]
},


  




  {
  "name": "ai",
  "description": "🤖 Chat dengan AI OwoBim — multi-turn dengan memory percakapan",
  "options": [
    {
      "name": "aksi",
      "description": "Pilih aksi yang ingin dilakukan",
      "type": 3,
      "required": true,
      "choices": [
        { "name": "💬 Chat  — Ngobrol dengan AI",            "value": "chat"       },
        { "name": "🔄 Reset — Hapus riwayat percakapan",     "value": "reset"      },
        { "name": "📜 History — Lihat riwayat chat",         "value": "history"    },
        { "name": "📊 Stats  — Statistik penggunaan AI",     "value": "stats"      },
        { "name": "🎭 Set Persona — Ubah persona permanen",  "value": "set_persona"}
      ]
    },
    {
      "name": "pesan",
      "description": "Pesanmu untuk AI (wajib untuk aksi chat)",
      "type": 3,
      "required": false
    },
    {
      "name": "persona",
      "description": "Pilih kepribadian AI",
      "type": 3,
      "required": false,
      "choices": [
        { "name": "🤖 Default   — Serbaguna & cerdas",       "value": "default"   },
        { "name": "😊 Friendly  — Santai & gaul",            "value": "friendly"  },
        { "name": "🎓 Expert    — Mendalam & profesional",   "value": "expert"    },
        { "name": "🎨 Creative  — Imajinatif & ekspresif",   "value": "creative"  },
        { "name": "🔥 Roast     — Pedas & nyelekit",         "value": "roast"     },
        { "name": "📚 Mentor    — Sabar & membimbing",       "value": "mentor"    },
        { "name": "⚔️ Debater   — Kritis & analitis",        "value": "debate"    },
        { "name": "💆 Therapist — Empatik & supportif",      "value": "therapist" }
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
