import { sendMessage } from "./message";
import * as fs from "fs";
import { room, PlayerAugmented, version } from "../index";
import { addToGame, handlePlayerLeaveOrAFK, resetChooser ,DRAFT_LIMIT,changeIsRanked,changeDuringDraft} from "./chooser";
import { adminPass, game } from "../index";
import { findOnlinePlayer, banPlayerDirect, unbanPlayerByAuthOrName, mutePlayer, unmutePlayer } from "./vaaz";
import { teamSize } from "./settings";
import config from "../config";
// Mevcut import satırını bul ve sonuna lockedDraftPlayers'i ekle:
import { releaseDraftLock, setDraftMapStatus, startLockingPhase, isDizilisPhase, setDizilisPhase, lockedDraftPlayers,checkAndTriggerReady,executeRealMatchStart,clearAllDraftLockTimers } from "./draft/draftLock";
import { startChatDraft, resetDraft, redCap, blueCap } from "./draft/draftManager";
import { changeTactic, setFormationPositions,applyDynamicPhysics,activeTactics, updatePlayerPositionName } from "./match/formation";
import { players } from "../index";
import { db } from "..";
// --- VOTEKICK (OYLAMA) HAFIZASI ---
interface VoteData {
  targetCustomId: number;
  targetRealId: number;
  targetName: string;
  voters: Set<number>;
  timer: NodeJS.Timeout;
}
const activeVotes = new Map<number, VoteData>();

const cmdBan = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece adminler kullanabilir!", p);
    return;
  }

  if (args.length < 2) {
    sendMessage("👉 Kullanım: !ban <ID/CustomID> <Süre (dk)> <Sebep> (Örn: !ban 45 60 Küfür)", p);
    return;
  }

  const targetId = args[0];
  const duration = parseInt(args[1]);
  const reason = args.slice(2).join(" ") || "Admin Tarafından Banlandı";

  if (isNaN(duration) || duration <= 0) {
    sendMessage("❌ Geçersiz süre! Süreyi dakika cinsinden sayı olarak girin.", p);
    return;
  }

  const targetPlayer = findOnlinePlayer(targetId);
  if (!targetPlayer) {
    sendMessage(`❌ [${targetId}] ID'sine sahip oyuncu bulunamadı!`, p);
    return;
  }

  if (room.getPlayer(targetPlayer.id).admin) {
    sendMessage("❌ Adminleri banlayamazsınız!", p);
    return;
  }

  await banPlayerDirect(targetPlayer.auth, targetPlayer.name, duration, reason, targetPlayer.id);
  sendMessage(`✅ [${targetPlayer.customId || targetPlayer.id}] ${targetPlayer.name} ${duration} dakika banlandı!`);
};

// 🚨 OYUN İÇİ BAN KALDIRMA KOMUTU: !bankaldır AuthOrName (Örn: !bankaldır 45 veya !bankaldır Name)
const cmdUnban = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece adminler kullanabilir!", p);
    return;
  }

  if (args.length < 1) {
    sendMessage("👉 Kullanım: !bankaldır <AuthKey_veya_OyuncuAdı>", p);
    return;
  }

  const targetInput = args.join(" ");
  const success = await unbanPlayerByAuthOrName(targetInput);

  if (success) {
    sendMessage(`✅ "${targetInput}" için ban kaydı veritabanından silindi!`, p);
  } else {
    sendMessage(`❌ "${targetInput}" adıyla eşleşen aktif bir ban bulunamadı.`, p);
  }
};

// 🚨 OYUN İÇİ MUTE KOMUTU: !mute ID Sure Sebep (Örn: !mute 45 15 Rahatsızlık)
const cmdMute = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece adminler kullanabilir!", p);
    return;
  }

  if (args.length < 2) {
    sendMessage("👉 Kullanım: !mute <ID/CustomID> <Süre (dk)> <Sebep> (Örn: !mute 45 15 Rahatsızlık)", p);
    return;
  }

  const targetId = args[0];
  const duration = parseInt(args[1]);
  const reason = args.slice(2).join(" ") || "Sohbet İhlali";

  if (isNaN(duration) || duration <= 0) {
    sendMessage("❌ Geçersiz süre! Süreyi dakika cinsinden sayı olarak girin.", p);
    return;
  }

  const targetPlayer = findOnlinePlayer(targetId);
  if (!targetPlayer) {
    sendMessage(`❌ [${targetId}] ID'sine sahip oyuncu bulunamadı!`, p);
    return;
  }

  mutePlayer(targetPlayer.auth, duration, reason);
  sendMessage(`🤫 [${targetPlayer.customId || targetPlayer.id}] ${targetPlayer.name} ${duration} dakika susturuldu!`);
};

// 🚨 OYUN İÇİ MUTE KALDIRMA KOMUTU: !mutekaldır ID (Örn: !mutekaldır 45)
const cmdUnmute = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece adminler kullanabilir!", p);
    return;
  }

  if (args.length < 1) {
    sendMessage("👉 Kullanım: !mutekaldır <ID/CustomID>", p);
    return;
  }

  const targetId = args[0];
  const targetPlayer = findOnlinePlayer(targetId);

  if (!targetPlayer) {
    sendMessage(`❌ [${targetId}] ID'sine sahip aktif oyuncu bulunamadı!`, p);
    return;
  }

  const removed = unmutePlayer(targetPlayer.auth);
  if (removed) {
    sendMessage(`🔊 [${targetPlayer.customId || targetPlayer.id}] ${targetPlayer.name} adlı oyuncunun susturması kaldırıldı.`);
  } else {
    sendMessage(`❌ [${targetPlayer.name}] zaten susturulmamış.`, p);
  }
};
const voteKick = (p: PlayerAugmented, args: string[]) => {
  // 🚨 Sadece !vote yazılırsa listeyi ID'leri ile dök
  if (args.length < 1) {
    let msgs = `📋 Oylayabileceğin Oyuncular:\n`;
    players.forEach(pp => {
      if (pp.id !== p.id) {
        msgs += `[${pp.customId || pp.id}] ${pp.name}\n`;
      }
    });
    sendMessage(msgs, p);
    sendMessage("👉 Kullanım: !vote <oyuncu_id> (Örn: !vote 45)", p);
    return;
  }

  // 🚨 DÜZELTME: Trim ile boşlukları silip kesin sayıya çeviriyoruz!
  const targetCustomId = Number(args[0].trim());
  if (isNaN(targetCustomId)) {
    sendMessage("❌ Geçersiz ID formatı!", p);
    return;
  }

  // 🚨 DÜZELTME: Hem esnek eşitlik (==) hem de normal ID koruması!
  const targetPlayer = players.find(pp => pp.customId == targetCustomId || pp.id == targetCustomId);
  if (!targetPlayer) {
    sendMessage(`❌ [${targetCustomId}] ID'sine sahip bir oyuncu bulunamadı!`, p);
    return;
  }

  if (targetPlayer.id === p.id) {
    sendMessage("❌ Kendine oy veremezsin akıllı bıdık!", p);
    return;
  }

  if (room.getPlayer(targetPlayer.id).admin) {
    sendMessage("❌ Adminler için atılma oylaması başlatılamaz!", p);
    return;
  }

  let voteRecord = activeVotes.get(targetCustomId);

  // Eğer bu kişi için daha önce bir oylama başlatılmadıysa, YENİ başlat
  if (!voteRecord) {
    const timer = setTimeout(() => {
      activeVotes.delete(targetCustomId);
      sendMessage(`⏱️ ${targetPlayer.name} için başlatılan oylama süresi (5dk) dolduğu için iptal edildi.`);
    }, 5 * 60 * 1000); // 5 dakika

    voteRecord = {
      targetCustomId,
      targetRealId: targetPlayer.id,
      targetName: targetPlayer.name,
      voters: new Set(),
      timer
    };
    activeVotes.set(targetCustomId, voteRecord);
    
    sendMessage("=================================");
    sendMessage(`📢 ATILMA OYLAMASI BAŞLADI: ${targetPlayer.name}`);
    sendMessage(`👉 Desteklemek için chate: !vote ${targetCustomId} yazın. (Süre: 5dk)`);
    sendMessage("=================================");
  }

  // Oyuncu daha önce oy verdiyse engelle
  if (voteRecord.voters.has(p.id)) {
    sendMessage("❌ Sen zaten bu oyuncu için oy kullandın!", p);
    return;
  }

  // Oyu sisteme kaydet
  voteRecord.voters.add(p.id);

  // %60 barajını hesapla
  const currentPlayersCount = room.getPlayerList().length;
  const requiredVotes = Math.ceil(currentPlayersCount * 0.6);
  const currentVotes = voteRecord.voters.size;

  if (currentVotes >= requiredVotes) {
    // Baraj aşıldı! Oyuncuyu şutla ve hafızayı temizle
    clearTimeout(voteRecord.timer);
    activeVotes.delete(targetCustomId);
    
    room.kickPlayer(targetPlayer.id, "Demokratik oylama sonucu odadan atıldın (Votekick).", false);
    sendMessage(`✅ Oylama başarılı! ${targetPlayer.name} odadan atıldı. (${currentVotes}/${requiredVotes} oy)`);
  } else {
    // Baraj henüz aşılmadıysa sadece bilgi ver
    sendMessage(`🗳️ ${p.name}, [${targetCustomId}] için oy verdi! (Atılması için gereken oy: ${currentVotes}/${requiredVotes})`);
  }
};
// ----------------------------------
const resetElo = async (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece adminler kullanabilir!", p);
    return;
  }
  
  try {
    // Veritabanındaki tüm oyuncuların ELO'sunu 12 yapar
    await db.run(`UPDATE players SET elo = 12`);
    sendMessage("✅ SİSTEM BİLDİRİMİ: Veritabanındaki tüm oyuncuların ELO puanı 12 olarak sıfırlandı!", p);
  } catch (err) {
    sendMessage("❌ Veritabanı temizlenirken hata oluştu!", p);
    console.log(err);
  }
};
const setReady = (p: PlayerAugmented) => {
  checkAndTriggerReady(p);
};

export const isCommand = (msg: string) => msg.trim().startsWith("!");
export const handleCommand = (p: PlayerAugmented, msg: string) => {
  let commandText = msg.trim().slice(1);
  let commandName = commandText.split(" ")[0];
  let commandArgs = commandText.split(" ").slice(1);
  if (commands[commandName]) {
    commands[commandName](p, commandArgs);
  } else {
    sendMessage("Geçersiz Komut.", p);
  }
};

type commandFunc = (p: PlayerAugmented, args: Array<string>) => void;
// --- OTOMATİK DRAFT BAŞLATMA TETİKLEYİCİSİ (Manuel komutla birebir aynı) ---
// --- OTOMATİK DRAFT BAŞLATMA TETİKLEYİCİSİ (Manuel komutla birebir aynı) ---
export const triggerAutoDraft = () => {
  // 1. Önce şalterleri çekiyoruz ki koruma sistemleri arkadan iş yapmasın
  setDraftMapStatus(true);
  setDizilisPhase(false);
  lockedDraftPlayers.clear();

  try {
    // 2. OYUNU DURDUR (Böylece takımları değiştirirken eski maç bug'a girmez)
    room.stopGame(); 

    // 3. ŞİMDİ HERKESİ TEMİZCE İZLEYİCİYE (0) AL
    room.getPlayerList().forEach(p => {
      room.setPlayerTeam(p.id, 0);
    });
    
    resetDraft();
    resetChooser();
    changeDuringDraft(false);

    if (game) {
      game.eventCounter += 1;
      game.inPlay = false;
      game.boostCount = 0;
      game.ballRotation = { x: 0, y: 0, power: 0 };
    }

    // 4. ŞİMDİ YENİ MAPİ YÜKLE VE OYUNU BAŞLAT
    const mapData = fs.readFileSync("./maps/11v11-Draft.hbs", {
      encoding: "utf8",
      flag: "r",
    });
    room.setCustomStadium(mapData);
    sendMessage(`🔥 Oda ${DRAFT_LIMIT} kişiye ulaştı! Otomatik Draft ve Kaptan Seçimi Başlıyor!`);

    room.startGame(); 
    
    setTimeout(() => {
      startChatDraft(); 
    }, 1000); 

  } catch (err) {
    console.log("Auto Draft Map Error:", err);
  }
};
// --- YENİ EKLENEN FONKSİYONLAR ÜSTTE TANIMLANMALI ---
// Sadece takımındaki oyuncuların ID'lerini görmek için komut
const showIds = (p: PlayerAugmented) => {
  const myTeamPlayers = players.filter(pp => pp.team === p.team);
  if (myTeamPlayers.length === 0) {
    sendMessage("❌ Takımında henüz oyuncu yok.", p);
    return;
  }
  let msgs = `📋 Takımındaki Oyuncular ve ID'leri:\n`;
  myTeamPlayers.forEach(pp => {
    // Burada artık forma numarasının yanında Türkçe mevki ismini de yazdırıyoruz!
    msgs += `${pp.name} (Forma: ${pp.jerseyNumber || "Yok"} | Mevki: ${pp.p_position || "Yok"})\n`;
  });
  sendMessage(msgs, p);
};

// Asıl mevki değişim ve takas motoru
// Asıl mevki değişim ve takas motoru
const mevkiDegis = (p: PlayerAugmented, args: string[]) => {
  // 1. Yetki kontrolü (Admin veya Kendi Takımının Kaptanı)
  const isRedCaptain = redCap && p.id === redCap.id;
  const isBlueCaptain = blueCap && p.id === blueCap.id;
  const isAdmin = room.getPlayer(p.id).admin;

  if (!isAdmin && !isRedCaptain && !isBlueCaptain) {
    sendMessage("❌ Mevki değişimini sadece Takım Kaptanları veya Adminler yapabilir!", p);
    return;
  }

  // YENİ ÖZELLİK: Maç esnasında bu komutu sadece Adminler kullanabilir. Kaptanlar sadece diziliş mapinde.
  if (!isDizilisPhase && !isAdmin) {
    sendMessage("❌ Maç esnasında mevki değişimini sadece Adminler yapabilir!", p);
    return;
  }

  // 3. Doğru format kontrolü
  if (args.length < 2) {
    sendMessage("Kullanım: !mevkidegis <oyuncu_id> <yeni_mevki_no> (Örn: !mevkidegis 4512 5)", p);
    return;
  }

  const targetCustomId = parseInt(args[0]);
  const newJersey = parseInt(args[1]);

  if (isNaN(targetCustomId) || isNaN(newJersey) || newJersey < 1 || newJersey > 11) {
    sendMessage("❌ Geçersiz format! Mevki numarası 1 ile 11 arasında olmalı.", p);
    return;
  }

  // 4. Hedef oyuncuyu 4 haneli ID'sinden bul
  const targetPlayer = players.find(pp => pp.customId === targetCustomId);
  if (!targetPlayer) {
    sendMessage(`❌ [${targetCustomId}] ID'sine sahip bir oyuncu bulunamadı!`, p);
    return;
  }

  // 5. Hedef oyuncu şu an takımda mı?
  if (targetPlayer.team !== 1 && targetPlayer.team !== 2) {
    sendMessage("❌ Hedef oyuncu şu an yedek kulübesinde (izleyicide)!", p);
    return;
  }

  // 6. Admin değilse sadece KENDİ takımındaki adamlara hükmedebilir
  if (!isAdmin && targetPlayer.team !== p.team) {
    sendMessage("❌ Kaptanlar sadece kendi takımlarındaki oyuncuların mevkisine karışabilir!", p);
    return;
  }

  // 7. HEDEF MEVKİDE BAŞKASI VAR MI KONTROLÜ (TAKAS MANTIĞI)
  const swapPlayer = players.find(pp => pp.team === targetPlayer.team && pp.jerseyNumber === newJersey);
  const oldJersey = targetPlayer.jerseyNumber;

  if (swapPlayer) {
    // A. O mevki doluysa iki oyuncuyu yer değiştir
    swapPlayer.jerseyNumber = oldJersey;
    targetPlayer.jerseyNumber = newJersey;
    
    room.setPlayerAvatar(swapPlayer.id, swapPlayer.jerseyNumber ? swapPlayer.jerseyNumber.toString() : "");
    room.setPlayerAvatar(targetPlayer.id, newJersey.toString());
    
    sendMessage(`🔄 TAKAS: [${targetCustomId}] ${targetPlayer.name} ile [${swapPlayer.customId}] ${swapPlayer.name} mevkilerini değiştirdi!`);
  } else {
    // B. O mevki boşsa direkt oraya çek
    targetPlayer.jerseyNumber = newJersey;
    room.setPlayerAvatar(targetPlayer.id, newJersey.toString());
    sendMessage(`✅ [${targetCustomId}] ${targetPlayer.name} adlı oyuncu ${newJersey} numaralı mevkiye çekildi!`);
  }

  // 8. OYUNUN İÇİNDE MİYİZ, DİZİLİŞTE Mİ KONTROLÜ
  if (isDizilisPhase) {
    // Diziliş aşamasındaysak fiziksel olarak adamları yeni mevkilerine çivile
    setFormationPositions(false);
  } else {
    // Maç içindeysek `setFormationPositions` fonksiyonunu ÇAĞIRMIYORUZ! 
    // Böylece adam atak yapıyorsa olduğu yerde oynamaya devam ediyor.
    // Senin yazdığın "enforcePhysicsLock" arka planda zaten yeni formayı görüp adamın fiziklerini anında güncelleyecek.
  }
};
const setForma = (p: PlayerAugmented, args: string[]) => {
  const isRedCaptain = redCap && p.id === redCap.id;
  const isBlueCaptain = blueCap && p.id === blueCap.id;
  const isAdmin = room.getPlayer(p.id).admin;

  if (!isAdmin && !isRedCaptain && !isBlueCaptain) {
    sendMessage("❌ Kardeşim sen kaptan mısın? Sadece Adminler ve Kaptanlar formayı değiştirebilir!", p, 0xFF0000);
    return;
  }

  if (p.team !== 1 && p.team !== 2) {
    sendMessage("❌ Forma ayarlamak için kırmızı veya mavi takımda olmalısın!", p, 0xFF0000);
    return;
  }

  if (args.length < 3) {
    sendMessage("❌ Hatalı kullanım!", p, 0xFF0000);
    sendMessage("👉 Örnek: !forma 90 FFFFFF FF0000 000000", p, 0xFFD700);
    return;
  }

  try {
    const angle = parseInt(args[0]);
    if (isNaN(angle)) throw new Error("Açı sayı olmalıdır.");

    const cleanColor = (c: string) => {
      let cleaned = c.replace(/^(#|0x|0X)/i, "").replace(/,/g, ""); 
      const parsed = parseInt(cleaned, 16);
      if (isNaN(parsed)) throw new Error("Geçersiz renk kodu");
      return parsed;
    };

    const textColor = cleanColor(args[1]);
    const colors = args.slice(2, 5).map(c => cleanColor(c));

    room.setTeamColors(p.team, angle, textColor, colors);
    
    sendMessage("✅ Takım forması başarıyla güncellendi, jilet gibi oldunuz!", undefined, 0x00FF00, "bold", 2);
  } catch (err) {
    sendMessage("❌ Forma kodu hatalı! Lütfen sayı ve renk kodlarını doğru girin.", p, 0xFF0000);
  }
};

export const executeMapSwitch = (mapName: "rs5" | "11v11-Draft", initiatorName: string = "Panel") => {
  try {
    // 1. OYUNU DURDUR VE ARKA PLAN ZAMANLAYICILARINI TEMİZLE
    room.stopGame();
    clearAllDraftLockTimers();
    resetDraft();
    resetChooser();

    setDizilisPhase(false);
    lockedDraftPlayers.clear();
    changeDuringDraft(false);

    let mapPath = "";
    if (mapName === "11v11-Draft") {
      mapPath = "./maps/11v11-Draft.hbs";
      setDraftMapStatus(true);
      
      // Herkesi izleyiciye çek
      room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
    } else {
      mapPath = "./maps/rs5.hbs";
      setDraftMapStatus(false);

      // Takımları dengeli dağıt
      let i = 0;
      room.getPlayerList().forEach(p => {
        room.setPlayerTeam(p.id, i % 2 === 0 ? 1 : 2);
        i++;
      });
    }

    // 2. HARİTAYI YÜKLE
    const mapData = fs.readFileSync(mapPath, "utf8");
    room.setCustomStadium(mapData);
    sendMessage(`🚀 Harita Değiştirildi [${mapName}] - Maç Başlatılıyor... (${initiatorName})`);

    // 3. MAÇI OTOMATİK BAŞLAT
    room.startGame();

    // 4. HARİTAYA ÖZEL ETKİNLİKLERİ TETİKLE
    setTimeout(() => {
      if (mapName === "11v11-Draft") {
        startChatDraft();
      } else {
        setFormationPositions(true);
      }
    }, 1000);

  } catch (err) {
    console.log("Map Switch Error:", err);
  }
};

const changeMap = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu yalnızca adminler kullanabilir", p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !map <harita_adı> (Mevcutlar: 11v11-Draft, rs5)", p);
    return;
  }

  const mapName = args[0];
  
  if (mapName === "11v11-Draft" || mapName === "rs5") {
    executeMapSwitch(mapName, p.name);
  } else {
    sendMessage(`❌ Geçersiz Harita! Kullanılabilir: rs5, 11v11-Draft`, p);
  }
};

const adminLogin = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Usage: !admin your_admin_pass", p);
    return;
  }
  if (args[0] === adminPass) {
    room.setPlayerAdmin(p.id, true);
    sendMessage("Login successful.", p);
  } else {
    sendMessage("Wrong password.", p);
  }
};


const rs = (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu yanlızca adminler kullana bilir!", p);
    return;
  }
  
  // 🚨 GÜVENLİK TEMİZLİĞİ
  setDraftMapStatus(false);
  setDizilisPhase(false);
  lockedDraftPlayers.clear();
  changeDuringDraft(false);
  
  room.stopGame();
  const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
    encoding: "utf8",
    flag: "r",
  });
  room.setCustomStadium(rsStadium);
  sendMessage(`${p.name} Harita Değişti.`);
};

const setAfk = (p: PlayerAugmented) => {
  p.afk = true;
  room.setPlayerTeam(p.id, 0);
  sendMessage("Şimdi AFK'sın", p);
  handlePlayerLeaveOrAFK();
};

const setBack = (p: PlayerAugmented) => {
  if (!p.afk) {
    sendMessage("Zaten Oyundasın.", p);
    return;
  }
  p.afk = false;
  addToGame(room, room.getPlayer(p.id));
  sendMessage("Geri Döndün.", p);
};

const showDiscord = (p: PlayerAugmented) => {
  sendMessage(`İletişim: Hemüz yok`);
};

const bb = (p: PlayerAugmented) => {
  room.kickPlayer(
    p.id,
    "!bb Odadan Çıkmak İstedi :)",
    false,
  );
};

const script = (p: PlayerAugmented) => {
  sendMessage("Açık Kaynak Kod. Full Script URL: Çok Yakında Geliyor...", p);
};

const showVersion = (p: PlayerAugmented) => {
  sendMessage(`v${version}. Full Script URL: Henüz Hazır Değil...`, p);
};

const setTactic = (p: PlayerAugmented, args: string[]) => {
  // 1. GÜVENLİK KİLİDİ: Sadece diziliş haritasındaysa çalışır!
  if (!isDizilisPhase) {
    sendMessage("❌ Diziliş komutu sadece maç öncesi Taktik Haritasında kullanılabilir!", p);
    return;
  }

  const isCaptainOrAdmin = room.getPlayer(p.id).admin || (redCap && p.id === redCap.id) || (blueCap && p.id === blueCap.id); 
  if (!isCaptainOrAdmin) {
    sendMessage("❌ Diziliş komutunu sadece Kaptanlar veya Adminler kullanabilir!", p);
    return;
  }

  if (args.length < 1) {
    sendMessage("Kullanım: !dizilis 4-4-2", p);
    return;
  }

  const tacticName = args[0];
  changeTactic(p.team as 1 | 2, tacticName, p, false);
};

const startRealMatch = (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Maçı başlatma yetkisi sadece adminlerdedir.", p);
    return;
  }
  executeRealMatchStart();
};

const showHelp = (p: PlayerAugmented) => {
  sendMessage("=========================================", p);
  sendMessage("🔹 KOMUTLAR:", p);
  sendMessage("!afk, !back, !discord, !bb, !id, !vote, !help", p);
  
  // 🚨 EĞER KOMUTU YAZAN ADMİNSE ADMİN MENÜSÜNÜ DE GÖSTER 🚨
  if (room.getPlayer(p.id).admin) {
    sendMessage(" ", p);
    sendMessage("🔴 ADMİN KOMUTLARI:", p);
    sendMessage("!rs, !map, !basla, !resetelo, !forma", p);
  }
  sendMessage("=========================================", p);
};

// --- TÜM KOMUTLARIN TANIMLANDIĞI YER ---
const commands: { [key: string]: commandFunc } = {
  afk: (p) => setAfk(p),
  back: (p) => setBack(p),
  discord: (p) => showDiscord(p),
  dc: (p) => showDiscord(p),
  bb: (p) => bb(p),
  help: (p) => showHelp(p),
  admin: (p, args) => adminLogin(p, args),
  rs: (p) => rs(p),
  script: (p) => script(p),
  version: (p) => showVersion(p),
  map: (p, args) => changeMap(p, args), 

  değiş: (p) => releaseDraftLock(p),
  degis: (p) => releaseDraftLock(p),

  diziliş: (p, args) => setTactic(p, args),
  dizilis: (p, args) => setTactic(p, args),

  basla: (p) => startRealMatch(p),
  başla: (p) => startRealMatch(p),

  hazır: (p) => setReady(p),
  hazir: (p) => setReady(p),

  id: (p) => showIds(p),

  mevkideğiş: (p, args) => mevkiDegis(p, args),
  mevkidegis: (p, args) => mevkiDegis(p, args),

  resetelo: (p) => resetElo(p),
  vote: (p, args) => voteKick(p, args),
  forma: (p, args) => setForma(p, args),

  // 🚨 YENİ EKLENEN BAN VE MUTE KOMUTLARI 🚨
  ban: (p, args) => cmdBan(p, args),
  bankaldır: (p, args) => cmdUnban(p, args),
  bankaldir: (p, args) => cmdUnban(p, args),

  mute: (p, args) => cmdMute(p, args),
  mutekaldır: (p, args) => cmdUnmute(p, args),
  mutekaldir: (p, args) => cmdUnmute(p, args),
};