// register-commands.mjs
// Jalankan SEKALI dari terminal untuk mendaftarkan slash commands ke Discord
// Cara: node register-commands.mjs

const TOKEN     = 'MTQ5MTg3MDI3NDgzMDk5MTQ5MA.GI4ErF.mYCuTX6dfmN1HaIDsCoTZ0kmq4dx57mU6UGu6Y';      // ← ganti dengan Bot Token dari tab Bot
const CLIENT_ID = '1491870274830991490'; // ← ganti dengan Application ID dari General Information

const commands = [
  {
    name: 'register',
    description: 'Buat akun OwoCash baru',
    options: [
      {
        name: 'password',
        description: 'Password akun kamu',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'wcash',
    description: 'Cek saldo cowoncy kamu'
  },
  {
    name: 'wcf',
    description: 'Coinflip — taruhkan cowoncy kamu',
    options: [
      {
        name: 'jumlah',
        description: 'Jumlah cowoncy yang ditaruhkan (angka atau "all")',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'wsend',
    description: 'Kirim cowoncy ke pemain lain',
    options: [
      {
        name: 'target',
        description: 'User Discord tujuan',
        type: 6,
        required: true
      },
      {
        name: 'jumlah',
        description: 'Jumlah cowoncy yang dikirim (angka atau "all")',
        type: 3,
        required: true
      }
    ]
  }
];

console.log('⏳ Mendaftarkan slash commands...\n');

const res = await fetch(
  `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  }
);

const data = await res.json();

if (res.ok) {
  console.log(`✅ ${data.length} command berhasil didaftarkan!\n`);
  data.forEach(c => console.log(`   /${c.name} — ${c.description}`));
  console.log('\n🎉 Selesai! Slash commands sudah aktif di Discord.');
} else {
  console.error('❌ Gagal mendaftarkan commands:');
  console.error(JSON.stringify(data, null, 2));
  console.error('\nPastikan TOKEN dan CLIENT_ID sudah benar.');
}
