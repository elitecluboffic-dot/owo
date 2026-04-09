export const onRequestPost = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json' };
  const { username, targetUsername, amount } = await request.json();

  if (!username || !targetUsername || !amount) {
    return new Response(JSON.stringify({ success: false, message: "Parameter tidak lengkap" }), { status: 400, headers });
  }

  if (username.toLowerCase() === targetUsername.toLowerCase()) {
    return new Response(JSON.stringify({ success: false, message: "Tidak bisa kirim ke diri sendiri!" }), { status: 400, headers });
  }

  const senderStr = await env.USERS_KV.get(`user:${username}`);
  const receiverStr = await env.USERS_KV.get(`user:${targetUsername}`);

  if (!senderStr) {
    return new Response(JSON.stringify({ success: false, message: "User pengirim tidak ditemukan" }), { status: 404, headers });
  }
  if (!receiverStr) {
    return new Response(JSON.stringify({ success: false, message: `User **${targetUsername}** tidak ditemukan` }), { status: 404, headers });
  }

  let sender = JSON.parse(senderStr);
  let receiver = JSON.parse(receiverStr);

  const sendAmount = amount === 'all' ? sender.balance : parseInt(amount);

  if (!sendAmount || sendAmount <= 0) {
    return new Response(JSON.stringify({ success: false, message: "Jumlah tidak valid" }), { status: 400, headers });
  }
  if (sendAmount > sender.balance) {
    return new Response(JSON.stringify({ success: false, message: `Cowoncy tidak cukup! Kamu punya 🪙 ${sender.balance.toLocaleString()}` }), { status: 400, headers });
  }

  sender.balance -= sendAmount;
  receiver.balance += sendAmount;

  await env.USERS_KV.put(`user:${username}`, JSON.stringify(sender));
  await env.USERS_KV.put(`user:${targetUsername}`, JSON.stringify(receiver));

  const msgSender = `📤 Kamu mengirim 🪙 **${sendAmount.toLocaleString()}** ke **${targetUsername}**\nSisa cowoncy kamu: 🪙 **${sender.balance.toLocaleString()}**`;
  const msgReceiver = `📥 **${username}** mengirimkan 🪙 **${sendAmount.toLocaleString()}** ke kamu!\nCowoncy kamu sekarang: 🪙 **${receiver.balance.toLocaleString()}**`;

  // Webhook pengirim
  if (sender.webhookUrl) {
    try {
      await fetch(sender.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msgSender })
      });
    } catch (e) {}
  }

  // Webhook penerima
  if (receiver.webhookUrl) {
    try {
      await fetch(receiver.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msgReceiver })
      });
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    success: true,
    message: `✅ Berhasil kirim 🪙 **${sendAmount.toLocaleString()}** ke **${targetUsername}**!<br>Sisa cowoncy kamu: 🪙 ${sender.balance.toLocaleString()}`,
    newBalance: sender.balance
  }), { headers });
};
