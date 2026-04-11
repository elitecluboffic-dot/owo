export const onRequestPost = async ({ request, env }) => {
  try {
    const { version, pesan, discordId } = await request.json();

    if (discordId !== '1442230317455900823') {
      return new Response(JSON.stringify({
        success: false,
        message: '❌ Akses Ditolak! Hanya pemilik bot yang boleh.'
      }), { status: 403 });
    }

    if (!pesan || pesan.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        message: '❌ Pesan update tidak boleh kosong.'
      }), { status: 400 });
    }

    const updateVersion = version || 'vX.X.X';
    const announcement =
`🚀 **OWO BIM BOT TELAH DIUPDATE!**
**Versi Baru:** \`${updateVersion}\`

${pesan}

━━━━━━━━━━━━━━━━━━━━━━
✅ Ketik \`/help\` untuk melihat command terbaru
❤️ Terima kasih telah menggunakan **OWO BIM**!`;

    // Simpan riwayat update
    await env.USERS_KV.put(`update:${Date.now()}`, JSON.stringify({
      version: updateVersion,
      message: pesan,
      timestamp: Date.now(),
      announcedBy: discordId
    }));

    // Broadcast ke semua guild
    const { keys } = await env.USERS_KV.list({ prefix: 'guild:' });

    let successCount = 0;
    let failCount = 0;

    for (const key of keys) {
      try {
        const raw = await env.USERS_KV.get(key.name);
        if (!raw) continue;
        const { channelId } = JSON.parse(raw);
        if (!channelId) continue;

        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${env.TOKEN}`, // ✅ pakai env.TOKEN
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: announcement })
        });

        if (res.ok) {
          successCount++;
        } else {
          failCount++;
          // Hapus guild jika bot sudah di-kick
          if (res.status === 403 || res.status === 404) {
            await env.USERS_KV.delete(key.name);
          }
        }
      } catch (e) {
        failCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `✅ Diumumkan ke ${successCount} server! (${failCount} gagal)`,
      announcement,
      version: updateVersion
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: '❌ Terjadi kesalahan.'
    }), { status: 500 });
  }
};
