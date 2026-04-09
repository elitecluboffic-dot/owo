export const onRequestPost = async ({ request, env }) => {
  const { username, password } = await request.json();

  if (!username || !password || username.length < 3) {
    return new Response(JSON.stringify({ success: false, message: "Username minimal 3 karakter" }), { status: 400 });
  }

  const existing = await env.USERS_KV.get(`user:${username}`);
  if (existing) {
    return new Response(JSON.stringify({ success: false, message: "Username sudah digunakan" }), { status: 409 });
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const userData = { 
    balance: 10000, 
    passwordHash: hash, 
    webhookUrl: null,
    createdAt: Date.now() 
  };

  await env.USERS_KV.put(`user:${username}`, JSON.stringify(userData));

  return new Response(JSON.stringify({ success: true, message: "Registrasi berhasil!" }));
};
