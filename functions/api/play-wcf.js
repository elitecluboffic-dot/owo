export const onRequestPost = async ({ request, env }) => {
  const { username, amount } = await request.json();

  const userStr = await env.USERS_KV.get(`user:${username}`);
  if (!userStr) {
    return new Response(JSON.stringify({ success: false, message: "User tidak ditemukan" }), { status: 404 });
  }

  let user = JSON.parse(userStr);
  let bet = amount === 'all' ? user.balance : parseInt(amount);

  if (!bet || bet <= 0 || bet > user.balance) {
    return new Response(JSON.stringify({ success: false, message: "Cowoncy tidak cukup atau tidak valid" }), { status: 400 });
  }

  user.balance -= bet;

  const win = Math.random() > 0.5;
  let message = "";

  if (win) {
    const winAmount = bet * 2;
    user.balance += winAmount;
    message = `SCAM spent 🪙 ${bet.toLocaleString()} and chose heads\nThe coin spins... 🪙 and you won 🪙 ${winAmount.toLocaleString()}!!`;
  } else {
    message = `SCAM spent 🪙 ${bet.toLocaleString()} and chose heads\nThe coin spins... 🪙 and you lost it all... :c`;
  }

  await env.USERS_KV.put(`user:${username}`, JSON.stringify(user));

  // Kirim notifikasi ke webhook user jika ada
  if (user.webhookUrl) {
    try {
      await fetch(user.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message })
      });
    } catch (e) {}
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message, 
    newBalance: user.balance 
  }));
};
