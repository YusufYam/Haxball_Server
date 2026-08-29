import { room, PlayerAugmented, toAug, players } from "../../index";
import { sendMessage } from "../message";
import { startLockingPhase, addTimeToLocking, isDraftMapActive, changeToDizilisAndStart,setDraftMapStatus } from "./draftLock";
import { DRAFT_LIMIT, changeDuringDraft, CAPTAIN_PICK_TIME } from "../chooser"; // Varsa virgül koyup ekle
import * as fs from "fs"; 

export let draftPhase = "IDLE"; 
let candidates: number[] = [];
export let redCap: PlayerAugmented | null = null;
export let blueCap: PlayerAugmented | null = null;
let currentTurn: 1 | 2 = 1;

let pickTimer: NodeJS.Timeout | null = null;
let pickTimeLeft = 15;

const getAvailablePool = (): PlayerAugmented[] => {
  let pool: PlayerAugmented[] = [];
  room.getPlayerList().forEach(p => {
    if (p.team === 0) {
      const augP = toAug(p);
      if (augP && augP.id !== redCap?.id && augP.id !== blueCap?.id) {
        pool.push(augP);
      }
    }
  });
  return pool.sort((a, b) => b.elo - a.elo);
};

const processNextTurn = () => {
  const pool = getAvailablePool();
  const redCount = room.getPlayerList().filter(pl => pl.team === 1).length;
  const blueCount = room.getPlayerList().filter(pl => pl.team === 2).length;

  if (pool.length === 0 || (redCount >= 11 && blueCount >= 11)) {
    //sendMessage("🎉 Mevki seçiniz...");
    draftPhase = "IDLE";
    if (pickTimer) clearInterval(pickTimer);
    startLockingPhase();
    return;
  }

  // --- OTO-SEÇİM: Havuzda sadece 1 kişi kaldıysa ---
  if (pool.length === 1) {
    if (pickTimer) clearInterval(pickTimer); 
    const pickedPlayer = pool[0];

    room.setPlayerTeam(pickedPlayer.id, currentTurn);
    const spawnX = currentTurn === 1 ? -400 : 400;
    setTimeout(() => {
      room.setPlayerDiscProperties(pickedPlayer.id, { x: spawnX, y: 0, xspeed: 0, yspeed: 0 });
    }, 100);

    const teamEmoji = currentTurn === 1 ? "🔴" : "🔵";
    //sendMessage(`⚡ Havuzda son 1 kişi kaldığı için [${pickedPlayer.name}] otomatik olarak ${teamEmoji} takımına eklendi!`);
    // son eleman otomatik eklenince çalışan fonksiyon.
    
    currentTurn = currentTurn === 1 ? 2 : 1;
    
    // YIĞILMA ÖNLEYİCİ: StackOverflow'u (Call Stack hatasını) engellemek için setTimeout kullanıyoruz!
    setTimeout(() => {
      processNextTurn(); 
    }, 100);
    return;
  }

  announcePool();
  const nextCap = currentTurn === 1 ? redCap : blueCap;
  const nextEmoji = currentTurn === 1 ? "🔴" : "🔵";
  sendMessage(`👉 Sıra ${nextEmoji} ${nextCap?.name} kaptanında! Chate numarayı yaz (${CAPTAIN_PICK_TIME} Saniyen var).`);
  startPickTimer();
};

const startPickTimer = () => {
  if (pickTimer) clearInterval(pickTimer);
  pickTimeLeft = CAPTAIN_PICK_TIME;

  pickTimer = setInterval(() => {
    pickTimeLeft--;
    const currentCap = currentTurn === 1 ? redCap : blueCap;
    
    if (!currentCap) return;

    if (pickTimeLeft === 5) {
      sendMessage(`⏳ ${currentCap.name}, seçim yapmak için son 5 saniyen!`);
    }

    if (pickTimeLeft <= 0) {
      clearInterval(pickTimer!);
      handleCaptainTimeout(currentCap);
    }
  }, 1000);
};

const handleCaptainTimeout = (failedCap: PlayerAugmented) => {
  sendMessage(`⏰ Süre doldu! ${failedCap.name} seçim yapmadığı için odadan atıldı.`);
  room.kickPlayer(failedCap.id, `Draft seçim süresini (${CAPTAIN_PICK_TIME} saniye) aştığınız için odadan atıldınız.`, false);

  const pool = getAvailablePool();
  if (pool.length === 0) {
      sendMessage("🎉 Draft tamamlandı! Mevki kilitlenme aşamasına geçiliyor...");
      draftPhase = "IDLE";
      startLockingPhase(); 
      return;
    }

  const newCap = pool[0];
  if (currentTurn === 1) {
    redCap = newCap;
  } else {
    blueCap = newCap;
  }

  room.setPlayerTeam(newCap.id, currentTurn);
  const spawnX = currentTurn === 1 ? -400 : 400;
  setTimeout(() => {
    room.setPlayerDiscProperties(newCap.id, { x: spawnX, y: 0, xspeed: 0, yspeed: 0 });
  }, 100);

  const teamEmoji = currentTurn === 1 ? "🔴" : "🔵";
  sendMessage(`👑 Yeni ${teamEmoji} Kaptanı: ${newCap.name} (ELO: ${Math.round(newCap.elo)})`);
  
  setTimeout(() => {
    processNextTurn(); 
  }, 100);
};

export const startChatDraft = () => {
  draftPhase = "CAPTAINS";
  candidates = [];
  if (pickTimer) clearInterval(pickTimer);
  
  room.getPlayerList().forEach(p => {
    if (p.team !== 0) room.setPlayerTeam(p.id, 0);
  });

  players.forEach(p => {
    p.afk = false;
    p.afkCounter = 0;
  });

// Alt üst çizgiyle çerçeveye alıyoruz ki chatte kaynamasın
sendMessage("=========================================", undefined, 0xFFFFFF, "bold", 0);
sendMessage("👉 Kaptan olmak istiyorsan + yaz! 👈", undefined, 0x00FFFF, "bold", 2);
sendMessage("=========================================", undefined, 0xFFFFFF, "bold", 0);
  setTimeout(() => {
    selectCaptains();
  }, 10000);
};

export const resetDraft = () => {
  draftPhase = "IDLE";
  candidates = [];
  redCap = null;
  blueCap = null;
  if (pickTimer) clearInterval(pickTimer);
};

const selectCaptains = () => {
  let pool: PlayerAugmented[] = [];
  room.getPlayerList().forEach(p => { 
    if (p.team === 0) {
      const augPlayer = toAug(p);
      if (augPlayer) pool.push(augPlayer);
    }
  });
  
  // Havuzda EN AZ 2 KİŞİ (iki kaptan adayı) yoksa sistemi iptal et ve RS5'e dön.
  if (pool.length < 2) { 
    sendMessage("❌ Kaptan seçimi için odada yeterli oyuncu (en az 2 kişi) kalmadı. RS5 haritasına geçiliyor.");
    draftPhase = "IDLE";
    
    // 🚨 İŞTE HAYAT KURTARAN ŞALTERLER BURASI 🚨
    setDraftMapStatus(false); // Mevki atama (handleLateJoiner) fonksiyonunun kilidini açar!
    changeDuringDraft(false); // Güçlerin ve pas sisteminin (Game objesi) çalışmasını sağlar!

    try {
      room.stopGame();
      const rsStadium = fs.readFileSync("./maps/rs5.hbs", { encoding: "utf8", flag: "r" });
      room.setCustomStadium(rsStadium);
      
      let i = 0;
      room.getPlayerList().forEach(p => {
        // Burada oyuncuyu takıma attığımız an, şalter kapalı olduğu için 
        // sistem onlara otomatik olarak 1-11 arası boş mevki numarası verecek.
        if (i % 2 === 0) {
          room.setPlayerTeam(p.id, 1);
        } else {
          room.setPlayerTeam(p.id, 2);
        }
        i++;
      });

      // Herkes gerçek mevki formalarını giydiğine göre maçı başlatıp yerlerine çivileyebiliriz!
      room.startGame();

      // NOT: Eskiden burada olan rastgele 1-99 avatar veren kodu sildik, 
      // çünkü o kod handleLateJoiner'ın verdiği gerçek mevki numaralarını bozuyordu.

    } catch (err) {
      console.log("Map Load Error:", err);
    }
    return;
  }

  let candidatePlayers = pool.filter(p => candidates.includes(p.id)).sort((a, b) => b.elo - a.elo);  
  if (candidatePlayers.length < 2) {
    const nonCandidates = pool.filter(p => !candidates.includes(p.id)).sort((a, b) => b.elo - a.elo);
    candidatePlayers = [...candidatePlayers, ...nonCandidates];
  }

  redCap = candidatePlayers[0];
  blueCap = candidatePlayers[1];

  room.setPlayerTeam(redCap.id, 1);
  room.setPlayerTeam(blueCap.id, 2);

  setTimeout(() => {
    room.setPlayerDiscProperties(redCap!.id, { x: -400, y: 0, xspeed: 0, yspeed: 0 });
    room.setPlayerDiscProperties(blueCap!.id, { x: 400, y: 0, xspeed: 0, yspeed: 0 });
  }, 100);

  sendMessage(`🔴 Kırmızı Kaptan: ${redCap.name} (ELO: ${Math.round(redCap.elo)})`);
  sendMessage(`🔵 Mavi Kaptan: ${blueCap.name} (ELO: ${Math.round(blueCap.elo)})`);
  
  draftPhase = "PICKING";
  currentTurn = 1;

  announcePool();
  processNextTurn();
};

const announcePool = () => {
  const pool = getAvailablePool();
  if (pool.length === 0) return;
  let msg = "📋 BOŞTAKİ OYUNCULAR:\n";
  pool.forEach((p, index) => {
    msg += `${index + 1}- ${p.name} (ELO: ${Math.round(p.elo)})\n`;
  });
  sendMessage(msg);
};

export const handleDraftChat = (p: PlayerAugmented, msg: string): boolean => {
  if (draftPhase === "IDLE") return false;

  if (draftPhase === "CAPTAINS") {
    if (msg.trim() === "+") {
      if (!candidates.includes(p.id)) {
        candidates.push(p.id);
        sendMessage(`✅ ${p.name} kaptan adayı oldu!`);
      }
      return true;
    }
  }

  if (draftPhase === "PICKING") {
    const isRedTurn = currentTurn === 1 && p.id === redCap?.id;
    const isBlueTurn = currentTurn === 2 && p.id === blueCap?.id;

    if (isRedTurn || isBlueTurn) {
      const pool = getAvailablePool();
      const pickIndex = parseInt(msg.trim()) - 1;
      
      if (!isNaN(pickIndex) && pickIndex >= 0 && pickIndex < pool.length) {
        if (pickTimer) clearInterval(pickTimer); 
        
        const pickedPlayer = pool[pickIndex];

        room.setPlayerTeam(pickedPlayer.id, currentTurn);
        const spawnX = currentTurn === 1 ? -400 : 400;
        
        setTimeout(() => {
          room.setPlayerDiscProperties(pickedPlayer.id, { x: spawnX, y: 0, xspeed: 0, yspeed: 0 });
        }, 100);

        sendMessage(`✅ ${p.name}, [${pickIndex + 1}] ${pickedPlayer.name} adlı oyuncuyu takımına aldı!`);

        // Gecikme koyarak stack overflow'u ve liste güncellenmeme sorununu aynı anda çözüyoruz
        setTimeout(() => {
          currentTurn = currentTurn === 1 ? 2 : 1;
          processNextTurn(); 
        }, 100);

        return true;
      }
    }
  }

  return false;
};

export const handleLateJoinerDuringDraft = (playerID: number) => {  
  if (draftPhase === "CAPTAINS") return;
  
  setTimeout(() => {
    const currentP = room.getPlayer(playerID);
    if (!currentP || currentP.team !== 0) return;

    if (redCap?.id !== playerID && blueCap?.id !== playerID) {
      const redCount = room.getPlayerList().filter(pl => pl.team === 1).length;
      const blueCount = room.getPlayerList().filter(pl => pl.team === 2).length;

      if (redCount >= 11 && blueCount >= 11) return; 

      if (draftPhase === "PICKING") {
        sendMessage(`📥 ${currentP.name} odaya katıldı ve canlı havuzuna eklendi!`);
        return; 
      }

      let assignedTeam: 1 | 2 = 1;
      if (redCount < blueCount) assignedTeam = 1;
      else if (blueCount < redCount) assignedTeam = 2;
      else assignedTeam = 1; 

      room.setPlayerTeam(playerID, assignedTeam);
      const teamEmoji = assignedTeam === 1 ? "🔴" : "🔵";

      if (isDraftMapActive) {
        //sendMessage(`📥 ${currentP.name} odaya katıldı ve eşitleme için ${teamEmoji} takımına alındı!`);
        addTimeToLocking(7); 
        sendMessage(`⏳ Yeni oyuncu geldiği için mevki seçme süresine +7 saniye eklendi!`);
      } else {
        //sendMessage(`📥 ${currentP.name} odaya katıldı ve eşitleme için ${teamEmoji} takımına alındı!`);
      }
    }
  }, 500); 
};