import { sendMessage } from "./message";
import { room, db, players, PlayerAugmented } from "../index";

const CUMA_BAN_REASON = "Güzel kardeşim oyun cuma namazından daha kıymetli değil namazını kıl ve gel. burada olucağız.";
const COOL_OFF_MS = 7 * 24 * 60 * 60 * 1000; // 7 Gün (Temiz kalırsa ban seviyesi 1'e sıfırlanır)

// ==========================================
// YARDIMCI: OYUNCU BULUCU (Custom ID veya Haxball ID)
// ==========================================

/**
 * Oyuncunun başında yazan [45] gibi Custom ID veya Haxball ID üzerinden aktif oyuncuyu bulur.
 */
export const findOnlinePlayer = (idInput: string | number): PlayerAugmented | undefined => {
  const num = Number(idInput);
  if (isNaN(num)) return undefined;
  return players.find((p) => p.customId === num || p.id === num);
};

// ==========================================
// 1. SÜRELİ & MANUEL MUTE (SUSTURMA) SİSTEMİ
// ==========================================

export interface MuteInfo {
  until: number;
  reason: string;
}

export const mutedPlayers = new Map<string, MuteInfo>();
export const mutedAuths = new Set<string>(); // Geriye dönük uyumluluk için

/**
 * Oyuncuyu dakika cinsinden süreli susturur (Auth üzerinden)
 */
export const mutePlayer = (auth: string, durationMinutes: number = 15, reason: string = "Panel Tarafından Susturuldu"): boolean => {
  if (!auth) return false;
  const until = Date.now() + durationMinutes * 60 * 1000;
  mutedPlayers.set(auth, { until, reason });
  mutedAuths.add(auth);
  return true;
};

/**
 * Oyuncunun susturmasını kaldırır
 */
export const unmutePlayer = (auth: string): boolean => {
  if (!auth) return false;
  mutedAuths.delete(auth);
  return mutedPlayers.delete(auth);
};

/**
 * Mute durumunu tersine çevirir (Toggle)
 */
export const toggleMute = (auth: string): boolean => {
  if (mutedPlayers.has(auth) || mutedAuths.has(auth)) {
    unmutePlayer(auth);
    return false;
  } else {
    mutePlayer(auth, 15, "Susturuldu");
    return true;
  }
};

/**
 * Oyuncunun anlık mute durumunu ve kalan süresini kontrol eder
 */
export const getMuteStatus = (auth: string): { isMuted: boolean; remainingMinutes: number; reason?: string } => {
  if (mutedAuths.has(auth) && !mutedPlayers.has(auth)) {
    return { isMuted: true, remainingMinutes: 999, reason: "Susturuldu" };
  }

  const data = mutedPlayers.get(auth);
  if (!data) return { isMuted: false, remainingMinutes: 0 };

  if (Date.now() >= data.until) {
    unmutePlayer(auth);
    return { isMuted: false, remainingMinutes: 0 };
  }

  const remainingMinutes = Math.ceil((data.until - Date.now()) / (1000 * 60));
  return { isMuted: true, remainingMinutes, reason: data.reason };
};

// ==========================================
// 2. RASTGELE VAAZ VE NASİHAT SİSTEMİ
// ==========================================

const vaazMetinleri: string[] = [
  "Müslüman, elinden ve dilinden diğer insanların güvende olduğu kimsedir. (Hadis-i Şerif)",
  "Namaz, dinin direğidir. Onu dosdoğru kılan dinini ihya etmiş olur.",
  "Hiçbiriniz kendi nefsi için istediğini mümin kardeşi için istemedikçe gerçek manada iman etmiş olamaz. (Hadis-i Şerif)",
  "Şüphesiz Allah; adaleti, iyilik yapmayı ve yakınlara yardım etmeyi emreder. (Nahl, 90)",
  "Bizi aldatan bizden değildir. (Hadis-i Şerif)",
  "Güzel söz sadakadır. İnsanlara tebessüm etmek sadakadır.",
  "Sabır, ilk darbe anındakidir. Zorlukla beraber mutlaka bir kolaylık vardır.",
  "İki nimet vardır ki insanların çoğu onların kıymetini bilmezler: Sağlık ve boş vakit. (Hadis-i Şerif)",
  "Kalpler ancak Allah'ı anmakla huzur bulur. (Ra'd, 28)",
  "Gıybet yapmaktan kaçının; gıybet, ölmüş kardeşinin etini yemek gibidir.",
  "Komşusu açken tok yatan bizden değildir. (Hadis-i Şerif)",
  "Kibir, hakkı inkâr etmek ve insanları küçük görmektir. Hakiki mümin mütevazi olandır."
];

let lastIndex: number = -1;

function getRandomVaaz(): string {
  if (vaazMetinleri.length <= 1) return vaazMetinleri[0] || "";

  let randomIndex: number;
  do {
    randomIndex = Math.floor(Math.random() * vaazMetinleri.length);
  } while (randomIndex === lastIndex);

  lastIndex = randomIndex;
  return vaazMetinleri[randomIndex];
}

export const startVaazTimer = () => {
  const scheduleNextVaaz = () => {
    const randomSeconds = Math.floor(Math.random() * (360 - 120 + 1)) + 1200;
    setTimeout(() => {
      const vaaz = getRandomVaaz();
      sendMessage(`🕌 ${vaaz}`, null, 0x00FF7F, "bold", 1);
      scheduleNextVaaz();
    }, randomSeconds * 1000);
  };

  scheduleNextVaaz();
};

// ==========================================
// 3. KÜFÜR FİLTRESİ VE HİLE ENGELLEYİCİ
// ==========================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]/g, ""); 
}

const kufurRegexListesi: RegExp[] = [
  /amk/i,
  /aq/i,
  /amq/i,
  /sik/i,
  /yarrak/i,
  /orospu/i,
  /pic/i,
  /kahpe/i,
  /ibne/i,
  /got/i,
  /yarag/i,
  /yarak/i,
  /amcik/i
];

export function isProfanity(message: string): boolean {
  const cleanedMessage = normalizeText(message);
  for (const regex of kufurRegexListesi) {
    if (regex.test(cleanedMessage)) return true;
  }
  return false;
}

// ==========================================
// 4. OYUNCU BAN VE UNBAN MOTORU (DB KATLAMALI VE ÖZEL SÜRELİ)
// ==========================================

/**
 * Doğrudan Auth anahtarı ve isim üzerinden DB'ye kesin ban kaydı atar.
 */
export const banPlayerDirect = async (
  auth: string,
  name: string,
  durationMinutes?: number,
  reason: string = "Kural İhlali",
  haxballRoomId?: number
): Promise<boolean> => {
  if (!db || !auth) return false;

  const now = Date.now();
  const existingBan = await db.get("SELECT ban_level, last_ban_time, banned_until FROM player_bans WHERE auth = ?", [auth]);

  let currentLevel = 1;

  if (existingBan) {
    const timeSinceLastBanEnd = now - existingBan.banned_until;
    if (timeSinceLastBanEnd > COOL_OFF_MS) {
      currentLevel = 1;
    } else {
      currentLevel = (existingBan.ban_level || 1) + 1;
    }
  }

  let duration = durationMinutes;
  if (!duration || duration <= 0) {
    if (currentLevel === 1) duration = 60; // 1. İhlal: 1 Saat (60 dk)
    else if (currentLevel === 2) duration = 24 * 60; // 2. İhlal: 24 Saat (1440 dk)
    else duration = 24 * 24 * 60; // 3. İhlal+: 24 Gün
  }

  const bannedUntil = now + duration * 60 * 1000;

  await db.run(
    "INSERT OR REPLACE INTO player_bans (auth, name, reason, banned_until, ban_level, last_ban_time) VALUES (?, ?, ?, ?, ?, ?)",
    [auth, name, reason, bannedUntil, currentLevel, now]
  );

  // Eğer oyuncu şu an sahada aktifse odadan şutla
  if (haxballRoomId !== undefined) {
    room.kickPlayer(haxballRoomId, `🚫 ${duration} dk Banlandınız! (${currentLevel}. İhlal) | Sebep: ${reason}`, false);
  } else {
    const onlineP = room.getPlayerList().find((p) => p.auth === auth);
    if (onlineP) {
      room.kickPlayer(onlineP.id, `🚫 ${duration} dk Banlandınız! (${currentLevel}. İhlal) | Sebep: ${reason}`, false);
    }
  }

  return true;
};

/**
 * Hem PlayerObject hem de string parametre kabul eden esnek ban fonksiyonu.
 */
export const banPlayer = async (
  target: PlayerObject | string,
  reason: string = "Kural İhlali",
  customDurationMinutes?: number,
  playerName?: string
) => {
  const auth = typeof target === "string" ? target : target.auth;
  const name = typeof target === "string" ? (playerName || "Oyuncu") : target.name;
  const roomPlayerId = typeof target === "object" ? target.id : undefined;

  return await banPlayerDirect(auth, name, customDurationMinutes, reason, roomPlayerId);
};

/**
 * Hem Auth hem de Oyuncu Adına göre veritabanından banı temizler.
 */
export const unbanPlayerByAuthOrName = async (input: string): Promise<boolean> => {
  if (!db) return false;
  const res = await db.run("DELETE FROM player_bans WHERE auth = ? OR name LIKE ?", [input, `%${input}%`]);
  return res && res.changes > 0;
};

// ==========================================
// 5. CUMA BAN SİSTEMİ (ANKARA / ADMİN KORUMALI)
// ==========================================

async function getAnkaraDhuhrTime(): Promise<{ hour: number; minute: number }> {
  try {
    const response = await fetch("https://api.aladhan.com/v1/timingsByCity?city=Ankara&country=Turkey&method=13");
    const data = await response.json();
    const dhuhrStr = data.data.timings.Dhuhr;
    const [hour, minute] = dhuhrStr.split(":").map(Number);
    return { hour, minute };
  } catch (error) {
    console.log("Ezan vakti API hatası, varsayılan 13:00 alındı:", error);
    return { hour: 13, minute: 0 };
  }
}

async function setCumaBanInDb(untilTimestamp: number) {
  if (!db) return;
  await db.run("INSERT OR REPLACE INTO cuma_ban (id, banned_until) VALUES (1, ?)", [untilTimestamp]);
}

async function getCumaBanFromDb(): Promise<number | null> {
  if (!db) return null;
  const row = await db.get("SELECT banned_until FROM cuma_ban WHERE id = 1");
  return row ? row.banned_until : null;
}

export const startCumaCheckTimer = () => {
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() !== 5) return; // Cuma değilse es geç

    const ezanTime = await getAnkaraDhuhrTime();
    const ezanInMinutes = ezanTime.hour * 60 + ezanTime.minute;
    const targetInMinutes = ezanInMinutes - 20;

    const currentInMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentInMinutes >= targetInMinutes && currentInMinutes < ezanInMinutes + 40) {
      const activeBanUntil = await getCumaBanFromDb();
      
      if (!activeBanUntil || Date.now() > activeBanUntil) {
        const banEndTime = Date.now() + 60 * 60 * 1000;
        await setCumaBanInDb(banEndTime);

        const playersList = room.getPlayerList();
        playersList.forEach((p) => {
          if (!p.admin) {
            room.kickPlayer(p.id, CUMA_BAN_REASON, false);
          }
        });

        console.log("🕌 Cuma namazı banı aktif edildi (Adminler muaf tutuldu).");
      }
    }
  }, 60 * 1000);
};

export const checkBanOnJoin = async (player: PlayerObject): Promise<boolean> => {
  const now = Date.now();

  // 1. CUMA BAN KONTROLÜ (Adminler muaf)
  if (!player.admin) {
    const cumaBanUntil = await getCumaBanFromDb();
    if (cumaBanUntil && now < cumaBanUntil) {
      const remainingMinutes = Math.ceil((cumaBanUntil - now) / (1000 * 60));
      room.kickPlayer(
        player.id,
        `${CUMA_BAN_REASON} (Kalan Süre: ${remainingMinutes} dk)`,
        false
      );
      return true;
    }
  }

  // 2. KÜFÜR / MANUEL BAN KONTROLÜ (Adminler dahil herkes)
  if (db && player.auth) {
    const userBan = await db.get("SELECT reason, banned_until, ban_level FROM player_bans WHERE auth = ?", [player.auth]);
    if (userBan) {
      if (now < userBan.banned_until) {
        const remainingMs = userBan.banned_until - now;
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        
        let timeStr = `${remainingHours} Saat`;
        if (remainingHours > 48) {
          timeStr = `${Math.ceil(remainingHours / 24)} Gün`;
        } else if (remainingHours < 1) {
          timeStr = `${Math.ceil(remainingMs / (1000 * 60))} Dakika`;
        }

        room.kickPlayer(
          player.id,
          `🚫 Banlısınız! (${userBan.ban_level || 1}. İhlal) | Sebep: ${userBan.reason} | Kalan Süre: ${timeStr}`,
          false
        );
        return true;
      }
    }
  }

  return false;
};