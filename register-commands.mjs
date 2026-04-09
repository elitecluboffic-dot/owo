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
