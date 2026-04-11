// ============================================================
//  OwoCash Simulator — app.js
// ============================================================

var currentUsername = null;
var currentBalance = null;
var adminHashCache = null;

// ── API helper ───────────────────────────────────────────────
async function apiCall(endpoint, body) {
  try {
    var res = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok && res.status !== 400 && res.status !== 401 && res.status !== 404 && res.status !== 409) {
      return { success: false, message: 'Server error: ' + res.status };
    }
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Koneksi gagal. Coba lagi.' };
  }
}

// ── Hash helper ──────────────────────────────────────────────
async function hashPassword(password) {
  var encoder = new TextEncoder();
  var data = encoder.encode(password);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(function(b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

// ── Chat message renderer ────────────────────────────────────
function addMessage(isOwO, text) {
  var chat = document.getElementById('chat');
  var time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  var div = document.createElement('div');
  div.className = 'msg-row' + (isOwO ? '' : ' user');

  if (isOwO) {
    div.innerHTML =
      '<div class="avatar">🐰</div>' +
      '<div class="owo-bubble">' +
        '<div class="meta">' +
          '<span class="owo-name">OwO</span>' +
          '<span class="owo-badge">APP</span>' +
          '<span class="owo-time">' + time + '</span>' +
        '</div>' +
        '<div class="owo-text">' + text + '</div>' +
      '</div>';
  } else {
    div.innerHTML =
      '<div class="user-bubble">' +
        '<div class="text">' + text + '</div>' +
        '<div class="time">' + time + '</div>' +
      '</div>';
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ── REGISTER ─────────────────────────────────────────────────
function showRegisterModal() {
  document.getElementById('register-modal').classList.remove('hidden');
}
function hideRegisterModal() {
  document.getElementById('register-modal').classList.add('hidden');
}
async function doRegister() {
  var username = document.getElementById('reg-username').value.trim();
  var password = document.getElementById('reg-password').value;
  if (!username || !password) { alert('Isi semua field!'); return; }
  var result = await apiCall('register', { username: username, password: password });
  alert(result.message || (result.success ? 'Berhasil!' : 'Gagal.'));
  if (result.success) {
    hideRegisterModal();
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
  }
}

// ── LOGIN ─────────────────────────────────────────────────────
function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}
function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}
async function doLogin() {
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  if (!username || !password) { alert('Isi semua field!'); return; }
  var result = await apiCall('login', { username: username, password: password });
  if (result.success) {
    currentUsername = result.username;
    currentBalance = result.balance;
    hideLoginModal();
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    addMessage(true,
      'Login berhasil! Selamat datang, <b>' + currentUsername + '</b> 🎉<br>' +
      'Cowoncy kamu: 🪙 ' + Number(result.balance).toLocaleString('id-ID')
    );
  } else {
    alert(result.message || 'Login gagal.');
  }
}

// ── ADMIN LOGIN ───────────────────────────────────────────────
function showAdminLoginModal() {
  document.getElementById('admin-login-modal').classList.remove('hidden');
}
function hideAdminLoginModal() {
  document.getElementById('admin-login-modal').classList.add('hidden');
}
async function doAdminLogin() {
  var password = document.getElementById('admin-password').value;
  if (!password) { alert('Masukkan password!'); return; }
  var result = await apiCall('admin-login', { password: password });
  if (result.success) {
    adminHashCache = await hashPassword(password);
    hideAdminLoginModal();
    document.getElementById('admin-password').value = '';
    showAdminDashboard();
  } else {
    alert(result.message || 'Password salah.');
  }
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────
async function showAdminDashboard() {
  document.getElementById('admin-dashboard').classList.remove('hidden');
  var list = document.getElementById('players-list');
  list.innerHTML = '<p style="color:#9ca3af;font-size:0.875rem;">Memuat data...</p>';

  var result = await apiCall('get-players', { adminHash: adminHashCache });
  list.innerHTML = '';

  if (!result.success || !result.players || !result.players.length) {
    list.innerHTML = '<p style="color:#9ca3af;font-size:0.875rem;">Belum ada pemain.</p>';
    return;
  }

  result.players.forEach(function(player) {
    var card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML =
      '<div class="player-info">' +
        '<div class="player-name">' + escapeHtml(player.username) + '</div>' +
        '<div class="player-balance">🪙 ' + Number(player.balance).toLocaleString('id-ID') + '</div>' +
      '</div>' +
      '<input type="number" placeholder="Set cowoncy" id="cash-' + player.username + '" class="cash-input">' +
      '<button class="set-btn" onclick="setCash(\'' + escapeHtml(player.username) + '\')">Set</button>';
    list.appendChild(card);
  });
}

function hideAdminDashboard() {
  document.getElementById('admin-dashboard').classList.add('hidden');
}

async function setCash(username) {
  var input = document.getElementById('cash-' + username);
  var newBalance = input ? input.value : '';
  if (!newBalance) { alert('Masukkan jumlah cowoncy!'); return; }
  var result = await apiCall('set-cash', {
    adminHash: adminHashCache,
    username: username,
    newBalance: newBalance
  });
  alert(result.message || (result.success ? 'Berhasil!' : 'Gagal.'));
  if (result.success) showAdminDashboard();
}

// ── WEBHOOK ───────────────────────────────────────────────────
function showWebhookSetting() {
  if (!currentUsername) { alert('Login dulu untuk setting webhook!'); return; }
  document.getElementById('webhook-modal').classList.remove('hidden');
}
function hideWebhookModal() {
  document.getElementById('webhook-modal').classList.add('hidden');
}
async function saveUserWebhook() {
  var url = document.getElementById('webhook-url-input').value.trim();
  if (!url || !url.includes('discord.com/api/webhooks')) {
    alert('Masukkan Webhook URL Discord yang valid!');
    return;
  }
  var result = await apiCall('save-webhook', { username: currentUsername, webhookUrl: url });
  alert(result.message || (result.success ? 'Webhook tersimpan!' : 'Gagal menyimpan webhook.'));
  if (result.success) {
    hideWebhookModal();
    document.getElementById('webhook-url-input').value = '';
  }
}

// ── WCF ───────────────────────────────────────────────────────
async function quickWcf(amount) {
  if (!currentUsername) {
    addMessage(true, 'Kamu belum login! Silakan login dulu. 🔑');
    return;
  }
  addMessage(false, 'owo wcf ' + amount);
  var result = await apiCall('play-wcf', { username: currentUsername, amount: amount });
  if (result && result.newBalance !== undefined) {
    currentBalance = result.newBalance;
  }
  var msg = (result && result.message) ? result.message : 'Terjadi kesalahan.';
  addMessage(true, msg.replace(/\n/g, '<br>'));
}

// ── WCASH ─────────────────────────────────────────────────────
async function checkBalance() {
  if (!currentUsername) {
    addMessage(true, 'Kamu belum login! Silakan login dulu. 🔑');
    return;
  }
  addMessage(false, 'owo wcash');
  var result = await apiCall('get-balance', { username: currentUsername });
  if (result && result.success) {
    currentBalance = result.balance;
    addMessage(true, '💰 Cowoncy kamu: 🪙 ' + Number(result.balance).toLocaleString('id-ID'));
  } else {
    addMessage(true, result.message || 'Gagal mengecek balance. Coba login ulang.');
  }
}

// ── WSEND ─────────────────────────────────────────────────────
async function sendCash(targetUsername, amount) {
  if (!currentUsername) {
    addMessage(true, 'Kamu belum login! Silakan login dulu. 🔑');
    return;
  }
  addMessage(false, 'owo wsend ' + targetUsername + ' ' + amount);
  var result = await apiCall('send-cash', {
    username: currentUsername,
    targetUsername: targetUsername,
    amount: amount === 'all' ? 'all' : parseInt(amount, 10)
  });
  if (result && result.newBalance !== undefined) {
    currentBalance = result.newBalance;
  }
  var msg = (result && result.message) ? result.message : 'Terjadi kesalahan.';
  addMessage(true, msg.replace(/\n/g, '<br>'));
}

// ── COMMAND INPUT ─────────────────────────────────────────────
async function sendCommand() {
  var input = document.getElementById('command-input');
  var cmd = input.value.trim();
  if (!cmd) return;
  input.value = '';
  addMessage(false, escapeHtml(cmd));

  var parts = cmd.toLowerCase().split(' ');

  if (parts[0] === 'owo' && parts[1] === 'wcf') {
    if (!currentUsername) { addMessage(true, 'Kamu belum login! 🔑'); return; }
    var amount = parts[2] === 'all' ? 'all' : parseInt(parts[2], 10);
    if (!amount && amount !== 0) { addMessage(true, 'Jumlah tidak valid.'); return; }
    await quickWcf(amount);

  } else if (parts[0] === 'owo' && parts[1] === 'wcash') {
    await checkBalance();

  } else if (parts[0] === 'owo' && parts[1] === 'wsend') {
    if (!currentUsername) { addMessage(true, 'Kamu belum login! 🔑'); return; }
    var target = parts[2];
    var wsendAmount = parts[3] === 'all' ? 'all' : parseInt(parts[3], 10);
    if (!target) {
      addMessage(true, 'Format: <code>owo wsend &lt;username&gt; &lt;jumlah&gt;</code><br>Contoh: <code>owo wsend budi 5000</code>');
      return;
    }
    if (!wsendAmount && wsendAmount !== 0) { addMessage(true, 'Jumlah tidak valid.'); return; }
    await sendCash(target, wsendAmount);

  } else {
    addMessage(true,
      'Command tidak dikenal. Coba:<br>' +
      '<code>owo wcf 5000</code> &nbsp;|&nbsp; <code>owo wcf all</code> &nbsp;|&nbsp; <code>owo wcash</code><br>' +
      '<code>owo wsend &lt;username&gt; &lt;jumlah&gt;</code>'
    );
  }
}

// ── GIVEAWAY ─────────────────────────────────────────────────
function showGiveawayModal() {
  document.getElementById('giveaway-modal').classList.remove('hidden');
}
function hideGiveawayModal() {
  document.getElementById('giveaway-modal').classList.add('hidden');
}
async function doCreateGiveaway() {
  var jumlah = parseInt(document.getElementById('giveaway-jumlah').value);
  var durasi = parseInt(document.getElementById('giveaway-durasi').value);
  if (!jumlah || !durasi) { alert('Isi semua field!'); return; }
  var result = await apiCall('create-giveaway', {
    adminHash: adminHashCache,
    jumlah: jumlah,
    durasi: durasi
  });
  alert(result.message || (result.success ? 'Giveaway dimulai!' : 'Gagal.'));
  if (result.success) {
    hideGiveawayModal();
    document.getElementById('giveaway-jumlah').value = '';
    document.getElementById('giveaway-durasi').value = '';
  }
}

async function doEndGiveaway() {
  if (!confirm('Akhiri giveaway dan pilih pemenang sekarang?')) return;
  var result = await apiCall('end-giveaway-admin', { adminHash: adminHashCache });
  alert(result.message || (result.success ? 'Giveaway selesai!' : 'Gagal.'));
}


// ── BROADCAST UPDATE ─────────────────────────────────────────
function showBroadcastModal() {
  document.getElementById('broadcast-modal').classList.remove('hidden');
  document.getElementById('broadcast-preview').style.display = 'none';
  document.getElementById('broadcast-status').style.display = 'none';
  document.getElementById('broadcast-btn').disabled = false;
  document.getElementById('broadcast-btn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim ke Semua Server';
}

function hideBroadcastModal() {
  document.getElementById('broadcast-modal').classList.add('hidden');
  document.getElementById('broadcast-version').value = '';
  document.getElementById('broadcast-pesan').value = '';
  document.getElementById('broadcast-preview').style.display = 'none';
  document.getElementById('broadcast-status').style.display = 'none';
}

function previewBroadcast() {
  var version = document.getElementById('broadcast-version').value.trim() || 'vX.X.X';
  var pesan   = document.getElementById('broadcast-pesan').value.trim();
  if (!pesan) { alert('Tulis pesan dulu!'); return; }
  var preview =
    '🚀 OWO BIM BOT TELAH DIUPDATE!\n' +
    'Versi Baru: ' + version + '\n\n' +
    pesan + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━\n' +
    '✅ Ketik /help untuk melihat command terbaru\n' +
    '❤️ Terima kasih telah menggunakan OWO BIM!';
  var el = document.getElementById('broadcast-preview');
  el.textContent = preview;
  el.style.display = 'block';
}

async function doBroadcast() {
  var version = document.getElementById('broadcast-version').value.trim() || 'vX.X.X';
  var pesan   = document.getElementById('broadcast-pesan').value.trim();
  if (!pesan) { alert('Tulis pesan dulu!'); return; }
  if (!confirm('Kirim broadcast ke semua server sekarang?')) return;

  var btn    = document.getElementById('broadcast-btn');
  var status = document.getElementById('broadcast-status');

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
  status.style.display    = 'block';
  status.style.background = '#1e1e35';
  status.style.color      = '#a78bfa';
  status.textContent      = '📡 Sedang broadcast ke semua server...';

  var result = await apiCall('post-update', {
    discordId: '1442230317455900823',
    version:   version,
    pesan:     pesan
  });

  if (result.success) {
    status.style.background = '#14532d';
    status.style.color      = '#86efac';
    status.textContent      = '✅ ' + (result.message || 'Broadcast berhasil!');
    btn.innerHTML = '✅ Terkirim!';
    setTimeout(hideBroadcastModal, 2000);
  } else {
    status.style.background = '#450a0a';
    status.style.color      = '#fca5a5';
    status.textContent      = '❌ ' + (result.message || 'Gagal broadcast.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim ke Semua Server';
  }
}

// ── UTILITY ───────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── INIT ──────────────────────────────────────────────────────
window.onload = function() {
  addMessage(true,
    'Selamat datang di <b>OwoCash Simulator</b>! 🐰<br>' +
    'Klik <b>Daftar</b> untuk membuat akun, lalu <b>Login</b> untuk mulai bermain.'
  );
};
