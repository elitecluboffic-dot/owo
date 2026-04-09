// GANTI DENGAN HASH PASSWORD ADMIN KAMU
const ADMIN_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // contoh hash dari "admin123"

export const onRequestPost = async ({ request }) => {
  const { password } = await request.json();

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const inputHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (inputHash === ADMIN_HASH) {
    return new Response(JSON.stringify({ success: true, message: "Login admin berhasil" }));
  }
  return new Response(JSON.stringify({ success: false, message: "Password admin salah" }), { status: 401 });
};
