import express from "express";
import { room, players, db, toAug } from "../index";
import { banPlayer, mutePlayer, unmutePlayer, getMuteStatus,findOnlinePlayer,banPlayerDirect } from "./vaaz";
import { executeMapSwitch } from "./command";
import { executeRealMatchStart } from "./draft/draftLock";
import { changeTactic } from "./match/formation";
import { sendMessage } from "./message";

const app = express();
app.use(express.json());

// 🔑 Panel Giriş Şifresi
const PANEL_PASSWORD = "admin123";

// Güvenlik Doğrulaması
const authMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers["x-panel-auth"];
  if (authHeader === PANEL_PASSWORD) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Yetkisiz Erişim! Şifre Hatalı." });
  }
};

// ==========================================
// API UÇLARI (REST API)
// ==========================================

// 1. Canlı Oyun & Oyuncu Durumu
app.get("/api/status", authMiddleware, async (req, res) => {
  try {
    const onlineList = room.getPlayerList().map((p) => {
      let aug;
      try { aug = toAug(p); } catch (e) {}
      const muteInfo = getMuteStatus(p.auth);
      return {
        id: p.id,
        name: p.name,
        auth: p.auth,
        team: p.team,
        admin: p.admin,
        customId: aug?.customId ?? "Yok",
        elo: aug?.elo ?? 1200,
        jerseyNumber: aug?.jerseyNumber ?? "-",
        position: aug?.p_position ?? "Tanımsız",
        isMuted: muteInfo.isMuted,
        muteRemaining: muteInfo.remainingMinutes,
      };
    });

    const scores = room.getScores();

    res.json({
      success: true,
      players: onlineList,
      scores: scores ? { red: scores.red, blue: scores.blue, time: scores.time, timeLimit: scores.timeLimit } : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Banlı Oyuncular Listesi
app.get("/api/bans", authMiddleware, async (req, res) => {
  try {
    const bans = await db.all("SELECT * FROM player_bans ORDER BY banned_until DESC");
    const cumaBan = await db.get("SELECT banned_until FROM cuma_ban WHERE id = 1");

    res.json({
      success: true,
      bans: bans.map((b: any) => ({
        ...b,
        remainingMinutes: Math.max(0, Math.ceil((b.banned_until - Date.now()) / (1000 * 60))),
        isExpired: Date.now() > b.banned_until,
      })),
      cumaBan: cumaBan ? {
        bannedUntil: cumaBan.banned_until,
        remainingMinutes: Math.max(0, Math.ceil((cumaBan.banned_until - Date.now()) / (1000 * 60))),
        isActive: Date.now() < cumaBan.banned_until,
      } : null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Ban Kaldırma (Unban)
app.post("/api/unban", authMiddleware, async (req, res) => {
  const { auth } = req.body;
  if (!auth) return res.status(400).json({ success: false, message: "Auth anahtarı eksik." });

  try {
    await db.run("DELETE FROM player_bans WHERE auth = ?", [auth]);
    res.json({ success: true, message: "Oyuncunun banı başarıyla kaldırıldı." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Manuel Ban Atma (Süreli & Sebepli)
app.post("/api/ban", authMiddleware, async (req, res) => {
    const { playerId, auth, reason, durationMinutes } = req.body;
    let targetAuth = auth;
    let targetName = "Oyuncu";
    let targetHaxId: number | undefined;
  
    if (playerId) {
      const p = findOnlinePlayer(playerId);
      if (p) {
        targetAuth = p.auth;
        targetName = p.name;
        targetHaxId = p.id;
      }
    }
  
    if (!targetAuth) return res.status(400).json({ success: false, message: "Oyuncu bulunamadı." });
  
    const duration = durationMinutes ? parseInt(durationMinutes) : 60;
    await banPlayerDirect(targetAuth, targetName, duration, reason || "Panel Banı", targetHaxId);
    res.json({ success: true, message: "Oyuncu başarıyla banlandı." });
  });

// 5. Oyuncuyu Süreli Sustur (Mute)
app.post("/api/mute", authMiddleware, (req, res) => {
    const { playerId, auth, durationMinutes, reason } = req.body;
    let targetAuth = auth;
  
    if (playerId) {
      const p = findOnlinePlayer(playerId);
      if (p) targetAuth = p.auth;
    }
  
    if (!targetAuth) return res.status(400).json({ success: false, message: "Oyuncu bulunamadı." });
  
    const duration = durationMinutes ? parseInt(durationMinutes) : 15;
    mutePlayer(targetAuth, duration, reason || "Panel Mute");
    res.json({ success: true, message: "Oyuncu susturuldu." });
  });

// 6. Susturmayı Kaldır (Unmute)
app.post("/api/unmute", authMiddleware, (req, res) => {
    const { auth } = req.body;
    if (!auth) return res.status(400).json({ success: false, message: "Auth gerekli." });
  
    unmutePlayer(auth);
    res.json({ success: true, message: "Susturma kaldırıldı." });
  });

// 7. Oyuncuyu Oyundan At (Kick)
app.post("/api/kick", authMiddleware, (req, res) => {
  const { playerId, reason } = req.body;
  const p = room.getPlayer(playerId);
  if (!p) return res.status(404).json({ success: false, message: "Oyuncu bulunamadı." });

  room.kickPlayer(playerId, reason || "Panel üzerinden atıldınız.", false);
  res.json({ success: true, message: `${p.name} odadan atıldı.` });
});

// 8. Oyuncunun Takımını / Adminliğini Değiştir
app.post("/api/player-update", authMiddleware, (req, res) => {
  const { playerId, team, admin } = req.body;
  if (team !== undefined) room.setPlayerTeam(playerId, team);
  if (admin !== undefined) room.setPlayerAdmin(playerId, admin);
  res.json({ success: true, message: "Oyuncu güncellendi." });
});

// 9. Genel Komutlar ve Harita Yönetimi
app.post("/api/command", authMiddleware, async (req, res) => {
  const { action, payload } = req.body;

  try {
    switch (action) {
      case "changeMap": {
        // Otomatik Temizleme & Başlatma Yapan Ana Fonksiyona Yönlendirir
        executeMapSwitch(payload, "Panel");
        break;
      }
      case "startMatch":
        executeRealMatchStart();
        break;
      case "resetElo":
        await db.run("UPDATE players SET elo = 12");
        sendMessage("👑 Panel Yönetimi: Tüm oyuncuların ELO puanı 12 yapıldı!");
        break;
      case "setTactic":
        changeTactic(payload.team, payload.tacticName, players[0], false);
        break;
      case "broadcast":
        sendMessage(`📢 [PANEL DUYURUSU]: ${payload}`, null, 0xFFD700, "bold", 2);
        break;

      default:
        return res.status(400).json({ success: false, message: "Geçersiz eylem." });
    }
    res.json({ success: true, message: "Eylem başarıyla gerçekleştirildi." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// WEB ARAYÜZÜ (HTML & TAILWIND CSS DAHİLİ)
// ==========================================
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Haxball Sunucu Yönetim Paneli</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-gray-900 text-gray-100 font-sans min-h-screen">

  <!-- Şifre Modal -->
  <div id="loginModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 w-96 text-center">
      <h2 class="text-2xl font-bold mb-4 text-emerald-400"><i class="fa-solid fa-shield-halved mr-2"></i>Yönetici Girişi</h2>
      <input type="password" id="passInput" placeholder="Panel Şifresi" class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg mb-4 text-white text-center text-lg focus:outline-none focus:border-emerald-500">
      <button onclick="login()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition">Giriş Yap</button>
    </div>
  </div>

  <div class="container mx-auto p-4 max-w-7xl">
    <!-- Header -->
    <header class="flex justify-between items-center bg-gray-800 p-4 rounded-xl border border-gray-700 mb-6 shadow-lg">
      <div class="flex items-center space-x-3">
        <i class="fa-solid fa-gamepad text-3xl text-emerald-400"></i>
        <h1 class="text-xl font-bold tracking-wide">HAXBALL KONTROL MERKEZİ</h1>
      </div>
      <div class="flex items-center space-x-3">
        <button onclick="fetchData()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"><i class="fa-solid fa-rotate mr-2"></i>Yenile</button>
      </div>
    </header>

    <!-- Hızlı Duyuru Barı -->
    <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-6 flex gap-3 shadow-md">
      <input type="text" id="broadcastInput" placeholder="Odaya canlı duyuru mesajı gönder..." class="flex-1 bg-gray-700 border border-gray-600 px-4 py-2 rounded-lg text-white focus:outline-none focus:border-emerald-500">
      <button onclick="sendBroadcast()" class="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-bold text-white transition"><i class="fa-solid fa-paper-plane mr-2"></i>Yayınla</button>
    </div>

    <!-- Harita Seçme & Otomatik Başlatma Alanı -->
    <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-6 shadow-xl">
      <h3 class="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
        <i class="fa-solid fa-map"></i> Harita Seç ve Otomatik Başlat
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onclick="execCmd('changeMap', 'rs5')" class="bg-blue-600 hover:bg-blue-500 p-5 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-lg">
          <i class="fa-solid fa-football text-2xl"></i> RS5 Haritasını Aç & Başlat
        </button>
        <button onclick="execCmd('changeMap', '11v11-Draft')" class="bg-purple-600 hover:bg-purple-500 p-5 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-lg">
          <i class="fa-solid fa-users-viewfinder text-2xl"></i> 11v11 Draft Aç & Başlat
        </button>
      </div>
    </div>

    <!-- Tab Başlıkları -->
    <div class="flex space-x-4 mb-6 border-b border-gray-700 pb-2">
      <button onclick="switchTab('online')" id="tab-online" class="tab-btn text-emerald-400 border-b-2 border-emerald-400 font-bold pb-2 px-4 text-lg"><i class="fa-solid fa-users mr-2"></i>Canlı Oyuncular</button>
      <button onclick="switchTab('bans')" id="tab-bans" class="tab-btn text-gray-400 font-bold pb-2 px-4 text-lg"><i class="fa-solid fa-ban mr-2"></i>Ban Listesi & Cezalar</button>
      <button onclick="switchTab('commands')" id="tab-commands" class="tab-btn text-gray-400 font-bold pb-2 px-4 text-lg"><i class="fa-solid fa-sliders mr-2"></i>Diğer Sunucu İşlemleri</button>
    </div>

    <!-- TAB 1: CANLI OYUNCULAR -->
    <div id="content-online" class="tab-content">
      <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
        <table class="w-full text-left">
          <thead class="bg-gray-700/50 text-gray-400 text-sm uppercase">
            <tr>
              <th class="p-4">ID</th>
              <th class="p-4">Oyuncu Adı</th>
              <th class="p-4">Takım</th>
              <th class="p-4">XP (ELO)</th>
              <th class="p-4">Mevki / Forma</th>
              <th class="p-4">Susturulma (Mute)</th>
              <th class="p-4 text-right">Eylemler</th>
            </tr>
          </thead>
          <tbody id="playerTableBody" class="divide-y divide-gray-700 text-sm">
            <!-- JS ile dolacak -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: BAN LİSTESİ -->
    <div id="content-bans" class="tab-content hidden">
      <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
        <table class="w-full text-left">
          <thead class="bg-gray-700/50 text-gray-400 text-sm uppercase">
            <tr>
              <th class="p-4">Oyuncu Adı</th>
              <th class="p-4">Auth Key</th>
              <th class="p-4">Sebep</th>
              <th class="p-4">Ban Seviyesi</th>
              <th class="p-4">Kalan Süre</th>
              <th class="p-4 text-right">Ban İşlemi</th>
            </tr>
          </thead>
          <tbody id="banTableBody" class="divide-y divide-gray-700 text-sm">
            <!-- JS ile dolacak -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: DİĞER İŞLEMLER -->
    <div id="content-commands" class="tab-content hidden grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <!-- Hızlı Sunucu Eylemleri -->
      <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
        <h3 class="text-lg font-bold text-emerald-400 mb-4"><i class="fa-solid fa-bolt mr-2"></i>Hızlı Sunucu Eylemleri</h3>
        <div class="flex gap-3">
          <button onclick="execCmd('startMatch', null)" class="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-lg font-bold flex-1"><i class="fa-solid fa-play mr-2"></i>Maçı Yeniden Başlat</button>
          <button onclick="execCmd('resetElo', null)" class="bg-rose-600 hover:bg-rose-500 text-white p-3 rounded-lg font-bold flex-1"><i class="fa-solid fa-trash mr-2"></i>Tüm ELO'ları Sıfırla (12)</button>
        </div>
      </div>

      <!-- Taktik Ayarla -->
      <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
        <h3 class="text-lg font-bold text-emerald-400 mb-4"><i class="fa-solid fa-chess mr-2"></i>Taktik Belirle</h3>
        <div class="flex gap-2">
          <select id="tacticTeam" class="bg-gray-700 p-2 rounded-lg text-white">
            <option value="1">Kırmızı Takım</option>
            <option value="2">Mavi Takım</option>
          </select>
          <input type="text" id="tacticInput" placeholder="Örn: 4-4-2" class="bg-gray-700 p-2 rounded-lg text-white flex-1 border border-gray-600">
          <button onclick="setTactic()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-bold">Uygula</button>
        </div>
      </div>

    </div>

  </div>

  <script>
    let AUTH_KEY = "";

    function login() {
      AUTH_KEY = document.getElementById("passInput").value;
      fetchData();
    }

    async function apiCall(url, method = "GET", body = null) {
      const opts = {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-panel-auth": AUTH_KEY
        }
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);
      const data = await res.json();
      
      if (!data.success && res.status === 401) {
        alert(data.message);
        document.getElementById("loginModal").classList.remove("hidden");
        return null;
      }
      
      return data;
    }

    async function fetchData() {
      const status = await apiCall("/api/status");
      if (status && status.success) {
        document.getElementById("loginModal").classList.add("hidden");
        renderPlayers(status.players);
      }

      const bans = await apiCall("/api/bans");
      if (bans && bans.success) {
        renderBans(bans.bans);
      }
    }

    function renderPlayers(players) {
      const tbody = document.getElementById("playerTableBody");
      tbody.innerHTML = "";

      players.forEach(p => {
        const teamMap = { 0: '<span class="text-gray-400">İzleyici</span>', 1: '<span class="text-red-400 font-bold">Kırmızı</span>', 2: '<span class="text-blue-400 font-bold">Mavi</span>' };
        
        tbody.innerHTML += \`
          <tr class="hover:bg-gray-700/30">
            <td class="p-4 font-mono">[\${p.customId}]</td>
            <td class="p-4 font-bold flex items-center gap-2">
              \${p.name} \${p.admin ? '<i class="fa-solid fa-crown text-amber-400"></i>' : ''}
            </td>
            <td class="p-4">\${teamMap[p.team]}</td>
            <td class="p-4 font-semibold text-emerald-400">\${p.elo} XP</td>
            <td class="p-4">\${p.position} (#\${p.jerseyNumber})</td>
            <td class="p-4">
              \${p.isMuted ? '<span class="bg-rose-900/50 text-rose-300 px-2 py-1 rounded text-xs font-bold">Susturuldu (' + p.muteRemaining + ' dk)</span>' : '<span class="bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded text-xs font-bold">Açık</span>'}
            </td>
            <td class="p-4 text-right space-x-2">
              \${p.isMuted ? 
                \`<button onclick="unmutePlayer('\${p.auth}')" class="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-xs font-bold">Mute Kaldır</button>\` : 
                \`<button onclick="mutePlayer('\${p.auth}')" class="bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded text-xs font-bold">Sustur (Mute)</button>\`}
              <button onclick="kickPlayer(\${p.id})" class="bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded text-xs font-bold">Kick</button>
              <button onclick="banPlayer(\${p.id})" class="bg-rose-600 hover:bg-rose-500 px-3 py-1 rounded text-xs font-bold">Ban At</button>
            </td>
          </tr>
        \`;
      });
    }

    function renderBans(bans) {
      const tbody = document.getElementById("banTableBody");
      tbody.innerHTML = "";

      bans.forEach(b => {
        let timeStr = b.remainingMinutes + " Dakika";
        if (b.remainingMinutes > 120) {
          timeStr = Math.ceil(b.remainingMinutes / 60) + " Saat";
        }
        if (b.remainingMinutes > 2880) {
          timeStr = Math.ceil(b.remainingMinutes / 1440) + " Gün";
        }

        tbody.innerHTML += \`
          <tr class="hover:bg-gray-700/30">
            <td class="p-4 font-bold text-rose-400">\${b.name}</td>
            <td class="p-4 font-mono text-xs text-gray-400">\${b.auth}</td>
            <td class="p-4">\${b.reason}</td>
            <td class="p-4 font-bold text-amber-400">\${b.ban_level || 1}. Seviye</td>
            <td class="p-4 font-bold">\${b.isExpired ? '<span class="text-gray-500">Süresi Doldu</span>' : timeStr}</td>
            <td class="p-4 text-right">
              <button onclick="unbanPlayer('\${b.auth}')" class="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-xs font-bold"><i class="fa-solid fa-unlock mr-1"></i>Ban Kaldır (Unban)</button>
            </td>
          </tr>
        \`;
      });
    }

    async function mutePlayer(auth) {
      const minutes = prompt("Susturma Süresi (Dakika cinsinden):", "15");
      if (minutes) {
        const reason = prompt("Susturma Sebebi:", "Sohbet İhlali");
        await apiCall("/api/mute", "POST", { auth, durationMinutes: parseInt(minutes), reason });
        fetchData();
      }
    }

    async function unmutePlayer(auth) {
      await apiCall("/api/unmute", "POST", { auth });
      fetchData();
    }

    async function banPlayer(playerId) {
      const minutes = prompt("Ban Süresi (Dakika cinsinden, Örn: 60 = 1 saat, 1440 = 1 gün):", "60");
      if (minutes) {
        const reason = prompt("Ban Sebebi:", "Kural İhlali");
        await apiCall("/api/ban", "POST", { playerId, durationMinutes: parseInt(minutes), reason });
        fetchData();
      }
    }

    async function unbanPlayer(auth) {
      if (confirm("Bu oyuncunun banını kaldırmak istediğinize emin misiniz?")) {
        await apiCall("/api/unban", "POST", { auth });
        fetchData();
      }
    }

    async function kickPlayer(playerId) {
      const reason = prompt("Kick sebebi:");
      if (reason !== null) {
        await apiCall("/api/kick", "POST", { playerId, reason });
        fetchData();
      }
    }

    async function sendBroadcast() {
      const input = document.getElementById("broadcastInput");
      if (input.value.trim() !== "") {
        await apiCall("/api/command", "POST", { action: "broadcast", payload: input.value });
        input.value = "";
        alert("Duyuru gönderildi.");
      }
    }

    async function execCmd(action, payload) {
      await apiCall("/api/command", "POST", { action, payload });
      fetchData();
    }

    async function setTactic() {
      const team = parseInt(document.getElementById("tacticTeam").value);
      const tacticName = document.getElementById("tacticInput").value;
      if (tacticName) {
        await apiCall("/api/command", "POST", { action: "setTactic", payload: { team, tacticName } });
        alert("Taktik uygulandı.");
      }
    }

    function switchTab(tab) {
      document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
      document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("text-emerald-400", "border-b-2", "border-emerald-400"));
      
      document.getElementById("content-" + tab).classList.remove("hidden");
      document.getElementById("tab-" + tab).classList.add("text-emerald-400", "border-b-2", "border-emerald-400");
    }

    // 5 saniyede bir otomatik verileri yenile
    setInterval(() => {
      if (AUTH_KEY) fetchData();
    }, 5000);
  </script>
</body>
</html>
  `);
});

export const startPanel = (port: number = 3000) => {
  app.listen(port, () => {
    console.log(`🚀 WEB YÖNETİM PANELİ BAŞLATILDI: http://localhost:${port}`);
  });
};