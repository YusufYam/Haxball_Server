import { room, PlayerAugmented, toAug } from "../../index";
import { sendMessage } from "../message";
import * as fs from "fs";
import { draftPhase,redCap, blueCap } from "./draftManager";
import { setFormationPositions,activeTactics,resetTactics,updatePlayerPositionName } from "../match/formation";
import { changeDuringDraft,changeIsRanked ,POSITION_LOCK_TIME, FORMATION_SETUP_TIME} from "../chooser";

export let isDraftMapActive = false; 
export let isDizilisPhase = false;
export const setDizilisPhase = (status: boolean) => {
  isDizilisPhase = status;
};
// Kaptanların hazır durumlarını tutan hafıza
export const captainReadyStatus = {
  red: false,
  blue: false,
};

let dizilisInterval: NodeJS.Timeout | null = null;
export const executeRealMatchStart = () => {
  if (dizilisInterval) clearInterval(dizilisInterval);
  
  try {
    room.stopGame();
    
    setDizilisPhase(false); 
    changeDuringDraft(false);
    
    // Eğer chooser'da changeIsRanked kullanıyorsan buraya ekleyebilirsin
    // changeIsRanked(true);

    const rsStadium = fs.readFileSync("./maps/rs5.hbs", { encoding: "utf8", flag: "r" });
    room.setCustomStadium(rsStadium);
    
    // Tribünde kalanları sahaya dağıtma operasyonu
    const specs = room.getPlayerList().filter(player => player.team === 0);
    specs.forEach(spec => {
      const redCount = room.getPlayerList().filter(player => player.team === 1).length;
      const blueCount = room.getPlayerList().filter(player => player.team === 2).length;
      
      if (redCount > blueCount) {
        room.setPlayerTeam(spec.id, 2);
      } else {
        room.setPlayerTeam(spec.id, 1);
      }
    });

    sendMessage("🔥 HERKES YERİNİ ALDI! MAÇ BAŞLIYOR, İYİ OYUNLAR!");
    room.startGame();
    
    setTimeout(() => {
      setFormationPositions(true); 
    }, 100);

  } catch (err) {
    console.log("Match Start Error:", err);
  }
};
export const changeToDizilisAndStart = () => {
  try {
    room.stopGame();
    const dizilisStadium = fs.readFileSync("./maps/dizilis.hbs", { encoding: "utf8", flag: "r" });
    room.setCustomStadium(dizilisStadium);
    
    setDraftMapStatus(false);
    isCountdownActive = false;
    isDizilisPhase = true;
    lockedDraftPlayers.clear(); 
    
    // Hazır statülerini sıfırla
    resetTactics();
    captainReadyStatus.red = false;
    captainReadyStatus.blue = false;
    
    room.startGame(); 

    setTimeout(() => {
      if (isDizilisPhase) { 
        setFormationPositions(false);
      }
    }, 100);

    // 1. TEK SEFERLİK BİLGİLENDİRME (Chat'i kirletmeyen yapı)
    // 1. KİŞİYE ÖZEL BİLGİLENDİRME (Kaptana komut, oyuncuya bilgi)
    setTimeout(() => {
      if (isDizilisPhase) {
        const rName = redCap ? redCap.name : "Kırmızı Kaptan";
        const bName = blueCap ? blueCap.name : "Mavi Kaptan";

        // Odadaki tüm oyuncuları tarıyoruz
        room.getPlayerList().forEach(p => {
          const isRed = redCap && p.id === redCap.id;
          const isBlue = blueCap && p.id === blueCap.id;

          if (isRed) {
            // SADECE KIRMIZI KAPTANA GİDEN MESAJ (Açık Kırmızı Renk)
            sendMessage("=========================================", p, 0xFFFFFF, "bold", 0);
            sendMessage(`🔴 Sayın ${rName}, aşağıdaki komutlar ile taktik ayarla:`, p, 0xFF5555, "bold", 1);
            sendMessage("⚽ !diziliş 4-4-2 (Defans-OrtaSaha-Forvet) ile formasyonu uygula.", p, 0x00FFFF, "bold", 0);
            sendMessage("🔄 !mevkideğiş 9563 9 (OyuncuID MevkiNo) ile oyuncu yerini değiştir.", p, 0x00FF00, "bold", 0);
            sendMessage("⚡ !hazır ile hazır verip oyunun erkan başlamasını sağla.", p, 0xFF8C00, "bold", 0);
          } 
          else if (isBlue) {
            // SADECE MAVİ KAPTANA GİDEN MESAJ (Açık Mavi Renk)
            sendMessage("=========================================", p, 0xFFFFFF, "bold", 0);
            sendMessage(`🔵 Sayın ${bName}, aşağıdaki komutlar ile taktik ayarla:`, p, 0x00BFFF, "bold", 1);
            sendMessage("⚽ !diziliş 4-4-2 (Defans-OrtaSaha-Forvet) ile formasyonu uygula.", p, 0x00FFFF, "bold", 0);
            sendMessage("🔄 !mevkideğiş 9563 9 (OyuncuID MevkiNo) ile oyuncu yerini değiştir.", p, 0x00FF00, "bold", 0);
            sendMessage("⚡ !hazır ile hazır verip oyunun erkan başlamasını sağla.", p, 0xFF8C00, "bold", 0);
          } 
          else {
            // DİĞER TÜM OYUNCULARA VE İZLEYİCİLERE GİDEN MESAJ (Gri Renk)
            sendMessage("=========================================", p, 0xFFFFFF, "bold", 0);
            sendMessage(`⏳ Kaptanlar aşağıdaki komutlar ile taktik ayarlayabilirler.`, p, 0xAAAAAA, "bold", 1);
            sendMessage(`⏳ Taktik için ${FORMATION_SETUP_TIME} saniyeleri var!`, p, 0xFFD700, "bold", 0);
            sendMessage("⚽ !diziliş 4-4-2 (Defans-OrtaSaha-Forvet) ile formasyonu uygula bilirler.", p, 0x00FFFF, "bold", 0);
            sendMessage("🔄 !mevkideğiş 9563 9 (OyuncuID MevkiNo) ile oyuncu yerini değiştire bilirler.", p, 0x00FF00, "bold", 0);
            sendMessage("⚡ !hazır ile hazır verip oyunun erkan başlamasını sağlaya bilirler.", p, 0xFF8C00, "bold", 0);
          }
        });
      }
    }, 1000);

    // 2. OTOMATİK BAŞLATMA GERİ SAYIMI (Akıllı Sayaç)
    if (dizilisInterval) clearInterval(dizilisInterval);
    
    let dizilisTimeLeft = FORMATION_SETUP_TIME;
    const halfTime = Math.floor(FORMATION_SETUP_TIME / 2); // Sürenin tam yarısı

    dizilisInterval = setInterval(() => {
      // Eğer bir şekilde diziliş evresi bittiyse sayacı boşa döndürme, durdur
      if (!isDizilisPhase) {
        clearInterval(dizilisInterval!);
        return;
      }

      dizilisTimeLeft--;

      // Süre yarıya geldiğinde uyarı at (Örn: 30 ise 15'te atar)
      if (dizilisTimeLeft === halfTime) {
        sendMessage(`⏳ Oyuna Son ${halfTime} saniye! Erken başkamak için Kaptanlar !hazır yazmalıdır.`, undefined, 0xFFD700, "bold", 1);
      } 
      // Son 5 saniye kala tek tek say (5... 4... 3...)
      else if (dizilisTimeLeft <= 5 && dizilisTimeLeft > 0) {
        sendMessage(`⏳ ${dizilisTimeLeft}...`, undefined, 0xFF8C00, "bold", 2);
      } 
      // Süre tamamen bittiğinde
      else if (dizilisTimeLeft <= 0) {
        clearInterval(dizilisInterval!);
        sendMessage(`⏰ Taktik süresi doldu, maç başlatılıyor!`, undefined, 0x00FF00, "bold", 2);
        executeRealMatchStart();
      }
    }, 1000); // Her 1 saniyede bir çalışır

  } catch (err) {
     sendMessage("❌ dizilis.hbs haritası yüklenirken hata oluştu!");
     console.log("Map Load Error:", err);
  }
};


// Kaptanlar !ready yazdığında kontrol eden fonksiyon
export const checkAndTriggerReady = (p: PlayerAugmented) => {
  if (!isDizilisPhase) {
    sendMessage("❌ Bu komut sadece diziliş aşamasında kullanılabilir!", p);
    return;
  }

  const isRedCaptain = redCap && p.id === redCap.id;
  const isBlueCaptain = blueCap && p.id === blueCap.id;

  if (!isRedCaptain && !isBlueCaptain && !room.getPlayer(p.id).admin) {
    sendMessage("❌ Bu komutu sadece Takım Kaptanları veya Adminler kullanabilir!", p);
    return;
  }

  if (isRedCaptain) {
    captainReadyStatus.red = true;
    sendMessage("🔴 Kırmızı Takım Kaptanı hazır olduğunu bildirdi!");
  } else if (isBlueCaptain) {
    captainReadyStatus.blue = true;
    sendMessage("🔵 Mavi Takım Kaptanı hazır olduğunu bildirdi!");
  // İlgili satırları bul ve böyle değiştir:

} else if (room.getPlayer(p.id).admin) {
  // Admin direkt basarsa direkt başlatır
  if (dizilisInterval) clearInterval(dizilisInterval); // BURASI DEĞİŞTİ
  sendMessage("👑 Admin maçı erkenden başlattı!");
  executeRealMatchStart();
  return;
}

// İki kaptan da hazır verdiyse sayaçta 15 saniyeyi beklemeden maçı patlat!
if (captainReadyStatus.red && captainReadyStatus.blue) {
  if (dizilisInterval) clearInterval(dizilisInterval); // BURASI DEĞİŞTİ
  sendMessage("🔥 Her iki kaptan da hazır! Maç başlatılıyor...");
  executeRealMatchStart();
}
};
export const setDraftMapStatus = (status: boolean) => {
  isDraftMapActive = status;
};

export const lockedDraftPlayers = new Map<number, { x: number; y: number }>();

let isCountdownActive = false;
let countdownInterval: NodeJS.Timeout | null = null;
let lockingInterval: NodeJS.Timeout | null = null;
let lockingTime = POSITION_LOCK_TIME;

const draftSlots = [
  // --- KIRMIZI TAKIM MEVKİLERİ ---
  { x: -246, y: 70, team: 1, number: 5 },   
  { x: -144, y: -120, team: 1, number: 9 }, 
  { x: -144, y: -64, team: 1, number: 10 },  
  { x: -110, y: 80, team: 1, number: 2 },   
  { x: -144, y: 147, team: 1, number: 1 },  
  { x: -235, y: -72, team: 1, number: 11 },  
  { x: -107, y: -1, team: 1, number: 8 },   
  { x: -181, y: 80, team: 1, number: 3 },  
  { x: -53, y: -72, team: 1, number: 7 },   
  { x: -41, y: 69, team: 1, number: 4 },   
  { x: -181, y: -2, team: 1, number: 6 },   

  // --- MAVİ TAKIM MEVKİLERİ ---
  { x: 246, y: 69, team: 2, number: 5 },    
  { x: 143, y: -120, team: 2, number: 9 },  
  { x: 143, y: -65, team: 2, number: 10 },   
  { x: 106, y: 80, team: 2, number: 2 },    
  { x: 143, y: 147, team: 2, number: 1 },   
  { x: 234, y: -73, team: 2, number: 11 },   
  { x: 105, y: -2, team: 2, number: 8 },    
  { x: 177, y: 80, team: 2, number: 3 },   
  { x: 52, y: -73, team: 2, number: 7 },    
  { x: 41, y: 69, team: 2, number: 4 },    
  { x: 180, y: -2, team: 2, number: 6 },    
];

export const clearPlayerLock = (playerId: number) => {
  if (lockedDraftPlayers.has(playerId)) {
    lockedDraftPlayers.delete(playerId);
  }
};

export const handleDraftLocks = () => {
  // --- BURASI DÜZELDİ: Eğer harita aktif değilse bile diziliş aşamasındaysak çıkmasın ---
  if (!isDraftMapActive && !isDizilisPhase) return;

  const allPlayers = room.getPlayerList();
  
  // Eğer hala ilk draft haritasındaysak (Mevkilere kilitlenme aşaması)
  if (isDraftMapActive) {
    let newlyLocked = false; 

    allPlayers.forEach((p) => {
      if (lockedDraftPlayers.has(p.id)) {
        const lockPos = lockedDraftPlayers.get(p.id)!;
        const slot = draftSlots.find(s => s.x === lockPos.x && s.y === lockPos.y);

        if (p.team === 0 || (slot && p.team !== slot.team)) {
          lockedDraftPlayers.delete(p.id); 
          
          const pAug = toAug(p);
          if (pAug) {
             pAug.jerseyNumber = undefined; 
             pAug.p_position = undefined; // 👇 SIFIRLA
          }
          room.setPlayerAvatar(p.id, "");

          if (p.team === 1) {
            room.setPlayerDiscProperties(p.id, { x: -400, y: 0, xspeed: 0, yspeed: 0 });
            sendMessage("Kırmızı takıma geçtin. Forma ve mevkin sıfırlandı, yeniden seçebilirsin!", p);
          } else if (p.team === 2) {
            room.setPlayerDiscProperties(p.id, { x: 400, y: 0, xspeed: 0, yspeed: 0 });
            sendMessage("Mavi takıma geçtin. Forma ve mevkin sıfırlandı, yeniden seçebilirsin!", p);
          }
        }
      }
    });

    const activePlayers = allPlayers.filter((p) => p.team !== 0);

    activePlayers.forEach((p) => {
      const props = room.getPlayerDiscProperties(p.id);
      if (!props) return;

      if (lockedDraftPlayers.has(p.id)) {
        const lockPos = lockedDraftPlayers.get(p.id)!;
        room.setPlayerDiscProperties(p.id, {
          x: lockPos.x, y: lockPos.y, xspeed: 0, yspeed: 0, xgravity: 0, ygravity: 0,
        });
        return; 
      }

      for (const slot of draftSlots) {
        const dist = Math.sqrt((props.x - slot.x) ** 2 + (props.y - slot.y) ** 2);
        
        if (dist < 30) {
          const isTaken = Array.from(lockedDraftPlayers.values()).some(
            (lockPos) => lockPos.x === slot.x && lockPos.y === slot.y
          );

          if (isTaken) continue; 

          lockedDraftPlayers.set(p.id, { x: slot.x, y: slot.y });
          newlyLocked = true; 
          
          if (p.team !== slot.team) room.setPlayerTeam(p.id, slot.team); 

          // (Yaklaşık 190. satırlar)
          const pAug = toAug(p);
          if (pAug) {
            pAug.jerseyNumber = slot.number; 
            // 👇 YENİ EKLENEN KISIM: Kilitlendiğinde pozisyonunu hesapla
            updatePlayerPositionName(pAug, activeTactics[slot.team as 1 | 2]);
          }
          room.setPlayerAvatar(p.id, slot.number.toString());
          
          sendMessage(`✅ MEVKİ KİLİTLENDİ! | 👕 Forma: ${slot.number} | 🔄 Değiştirmek için: !değiş`, p, 0x00FF00, "bold", 2);
          break; 
        }
      }
    });
  }

  // --- EĞER DİZİLİŞ AŞAMASINDAYSAK TAKIM KONTROLÜ ---
  if (isDizilisPhase) {
    const redTeamCount = allPlayers.filter(p => p.team === 1).length;
    const blueTeamCount = allPlayers.filter(p => p.team === 2).length;

    if (redTeamCount === 0 || blueTeamCount === 0) {
      sendMessage("❌ Takımlardan birinde oyuncu kalmadığı için diziliş iptal edildi, RS5 haritasına geçiliyor.");
      setDizilisPhase(false);
      
      // 🚨 DÜZELTME 2: Draft evresini kapattık ki güçler (Game objesi) RS5'te çalışsın!
      changeDuringDraft(false);
      
      try {
        room.stopGame();
        const rsStadium = fs.readFileSync("./maps/rs5.hbs", { encoding: "utf8", flag: "r" });
        room.setCustomStadium(rsStadium);
        room.startGame();
        
        const usedNumbers = new Set<number>();
        room.getPlayerList().forEach(p => {
            let randomNum;
            do {
              randomNum = Math.floor(Math.random() * 99) + 1;
            } while (usedNumbers.has(randomNum));
            usedNumbers.add(randomNum);
            room.setPlayerAvatar(p.id, randomNum.toString());
        });

        lockedDraftPlayers.clear(); // Kilitleri tamamen sök
        
        
        
        // 🚨 DÜZELTME 3: Çivileri söken kodu da garanti olsun diye ufak bir gecikmeye aldık.
        setTimeout(() => {
          setFormationPositions(true); 
        }, 100); 

      } catch (err) {
        console.log("Emergency RS5 Load Error:", err);
      }
    }
  }
};

// --- YENİ EKLENEN KESİN MÜHLET (KICK) SİSTEMİ ---
export const startLockingPhase = () => {
  lockingTime = POSITION_LOCK_TIME + 1; 
  if (lockingInterval) clearInterval(lockingInterval);
  isCountdownActive = false;

  sendMessage(`⏳ Mevki Seç ${POSITION_LOCK_TIME} Saniyen Var!`, undefined, 0xFF0000, "bold", 2);
  lockingInterval = setInterval(() => {
    lockingTime--;

    const draftedPlayers = room.getPlayerList().filter(p => p.team === 1 || p.team === 2);
    
    // 1. ERKEN BAŞLAMA KONTROLÜ: Herkes kilitlendiyse 15 saniyeyi bekleme, DİREKT DİZİLİŞE GEÇ!
    if (draftedPlayers.length > 0) {
        const isEveryoneLocked = draftedPlayers.every(p => lockedDraftPlayers.has(p.id));
        const isFullCapacity = lockedDraftPlayers.size >= 22;
        
        if (isEveryoneLocked || isFullCapacity) {
            clearInterval(lockingInterval!);
            changeToDizilisAndStart(); // Beklemeden haritayı aç
            return;
        }
    }

    // 2. NORMAL GERİ SAYIM
    if (lockingTime === 10) {
        sendMessage("⏳ Mevki seçimi için son 10 saniye!");
    } else if (lockingTime <= 5 && lockingTime > 0) {
        sendMessage(`⏳ ${lockingTime}...`);
    } else if (lockingTime <= 0) {
        clearInterval(lockingInterval!);
        
        // SÜRE BİTTİ: KİLİTLENMEYENLERİ ACIMADAN KİCKLE
        let kickedSomeone = false;
        draftedPlayers.forEach(p => {
            if (!lockedDraftPlayers.has(p.id)) {
                room.kickPlayer(p.id, `Mevki seçme süresi (${POSITION_LOCK_TIME}sn) dolduğu için odadan atıldınız.`, false);
                kickedSomeone = true;
            }
        });

        if (kickedSomeone) {
            sendMessage("⏰ Süre doldu! Mevki seçmeyen oyuncular odadan atıldı.");
        }

        // Kalanlarla direkt diziliş mapine geç
        changeToDizilisAndStart();
    }
  }, 1000);
};


const changeToRs5AndStart = () => {
  try {
    room.stopGame();
    const rsStadium = fs.readFileSync("./maps/rs5.hbs", { encoding: "utf8", flag: "r" });
    room.setCustomStadium(rsStadium);
    
    setDraftMapStatus(false);
    setDizilisPhase(false); // Diziliş evresini tamamen kapat
    isCountdownActive = false;
    lockedDraftPlayers.clear(); // Kilitleri temizle
    
    sendMessage("🔥 MAÇ BAŞLADI! İYİ OYUNLAR!");
    room.startGame(); 

    // --- BURASI ÇOK ÖNEMLİ: true veriyoruz ki çiviler sökülsün, hareket edebilsinler ---
    setTimeout(() => {
      setFormationPositions(true); 
    }, 100); 

  } catch (err) {
     sendMessage("❌ rs5 haritası yüklenirken hata oluştu!");
     console.log("Map Load Error:", err);
     isCountdownActive = false;
  }
};
// ------------------------------------------------
export const clearAllDraftLockTimers = () => {
  if (dizilisInterval) {
    clearInterval(dizilisInterval);
    dizilisInterval = null;
  }
  if (lockingInterval) {
    clearInterval(lockingInterval);
    lockingInterval = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
};
export const releaseDraftLock = (p: PlayerAugmented) => {
  if (isDizilisPhase) {
    sendMessage(`❌ Diziliş mapinde değiş komutunu kullanamazsın! Artık çok geç :)`, p);
    return;
  }
  if (lockedDraftPlayers.has(p.id)) {
    lockedDraftPlayers.delete(p.id); 
    
    const spawnX = p.team === 1 ? -400 : (p.team === 2 ? 400 : 0);
    
    room.setPlayerDiscProperties(p.id, { x: spawnX, y: 0, xspeed: 0, yspeed: 0 });

    p.jerseyNumber = undefined;
    p.p_position = undefined;
    room.setPlayerAvatar(p.id, ""); 
    
    sendMessage(`Mevkiden çıktın. Serbestçe dolaşıp başka mevki seçebilirsin.`, p);
  } else {
    sendMessage(`❌ Zaten herhangi bir mevkiye kilitli değilsin!`, p);
  }
};
// --- YENİ: Dışarıdan mevki seçme süresine (Locking Time) müdahale etme fonksiyonu ---
export const addTimeToLocking = (seconds: number) => {
  // Eğer geri sayım devam ediyorsa (erken başlama tetiklenmemişse)
  if (lockingInterval && !isCountdownActive) {
    lockingTime += seconds;
    if (lockingTime > POSITION_LOCK_TIME) lockingTime = POSITION_LOCK_TIME; // 15'i geçmesin
  }
};