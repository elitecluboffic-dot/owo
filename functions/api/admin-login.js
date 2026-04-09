export const onRequestPost = async ({ request, env }) => {
  const { password } = await request.json();
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const inputHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (inputHash === env.ADMIN_HASH) {
    return new Response(JSON.stringify({ success: true, message: "Login admin berhasil" }));
  }

  return new Response(JSON.stringify({ success: false, message: "Password admin salah" }), { status: 401 });
};
