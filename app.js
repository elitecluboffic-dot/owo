// ============================================================
//  OwoCash Simulator — app.js
//  Semua fungsi global didefinisikan di sini (bukan module)
//  sehingga onclick di HTML bisa langsung memanggil fungsi ini.
// ============================================================

var currentUsername = null;

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
    hideLoginModal();
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    addMessage(true,
      'Login berhasil! Selamat datang, <b>' + currentUsername + '</b> 🎉<br>' +
      'Cowoncy kamu: 🪙 ' + result.balance.toLocaleString('id-ID')
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

  var result = await apiCall('get-players', {});
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
  var result = await apiCall('set-cash', { username: username, newBalance: newBalance });
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

// ── WCF & BALANCE ─────────────────────────────────────────────
async function quickWcf(amount) {
  if (!currentUsername) {
    addMessage(true, 'Kamu belum login! Silakan login dulu. 🔑');
    return;
  }
  addMessage(false, 'owo wcf ' + amount);
  var result = await apiCall('play-wcf', { username: currentUsername, amount: amount });
  var msg = (result && result.message) ? result.message : 'Terjadi kesalahan.';
  addMessage(true, msg.replace(/\n/g, '<br>'));
}

async function checkBalance() {
  if (!currentUsername) {
    addMessage(true, 'Kamu belum login! Silakan login dulu. 🔑');
    return;
  }
  addMessage(false, 'owo wcash');
  var result = await apiCall('get-players', {});
  if (result.success && result.players) {
    var me = result.players.find(function(p) { return p.username === currentUsername; });
    if (me) {
      addMessage(true, '💰 Cowoncy kamu: 🪙 ' + Number(me.balance).toLocaleString('id-ID'));
    } else {
      addMessage(true, 'Data tidak ditemukan. Coba login ulang.');
    }
  } else {
    addMessage(true, 'Gagal mengambil data. Coba lagi.');
  }
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
    var result = await apiCall('play-wcf', { username: currentUsername, amount: amount });
    var msg = (result && result.message) ? result.message : 'Terjadi kesalahan.';
    addMessage(true, msg.replace(/\n/g, '<br>'));

  } else if (parts[0] === 'owo' && parts[1] === 'wcash') {
    await checkBalance();

  } else {
    addMessage(true,
      'Command tidak dikenal. Coba:<br>' +
      '<code>owo wcf 5000</code> &nbsp;|&nbsp; <code>owo wcf all</code> &nbsp;|&nbsp; <code>owo wcash</code>'
    );
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
