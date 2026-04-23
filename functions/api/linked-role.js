export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Step 1: Redirect ke Discord OAuth2
  if (!code) {
    const params = new URLSearchParams({
      client_id: env.APP_ID,
      redirect_uri: 'https://owo-78d.pages.dev/api/linked-role',
      response_type: 'code',
      scope: 'role_connections.write identify',
    });
    return Response.redirect(`https://discord.com/oauth2/authorize?${params}`);
  }

  // Step 2: Tukar code dengan token
  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://owo-78d.pages.dev/api/linked-role',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return new Response('❌ Gagal ambil token!', { status: 400 });
  }

  // Step 3: Ambil data user Discord
  const userRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userData = await userRes.json();
  const discordId = userData.id;

  // Step 4: Simpan token ke KV
  await env.USERS_KV.put(`oauth:${discordId}`, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000)
  }), { expirationTtl: 86400 * 30 });

  // Step 5: Push metadata awal
  const userStr = await env.USERS_KV.get(`user:${discordId}`);
  const user = userStr ? JSON.parse(userStr) : null;

  await pushLinkedRole(env, discordId, tokens.access_token, user);

  return new Response(`
    <html>
      <body style="font-family:sans-serif;text-align:center;padding:50px;background:#2b2d31;color:white">
        <h1>✅ Berhasil!</h1>
        <p>Akun Discord kamu sudah terhubung ke <b>OWO BIM</b>!</p>
        <p>Kembali ke Discord dan cek role kamu 🎉</p>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });
};
