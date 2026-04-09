export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { username, password } = await request.json();
  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404, headers });
  }
  const user = JSON.parse(userStr);
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const inputHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (inputHash !== user.passwordHash) {
    return new Response(JSON.stringify({ success: false, message: "Password salah" }), { status: 401, headers });
  }
  return new Response(JSON.stringify({
    success: true,
    message: "Login berhasil",
    username,
    balance: user.balance
  }), { headers });
};
