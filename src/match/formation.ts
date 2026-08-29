  import { room, PlayerAugmented, toAug,players } from "../../index";
  import { sendMessage } from "../message";
  import config from "../../config";
  import { isDraftMapActive, isDizilisPhase } from "../draft/draftLock";

  // 1. Senin özenle ayarladığın görsel şablonlar (Birebir eşleşenler bunları kullanacak)
  const draftTactics: Record<string, Record<number, { x: number; y: number }>> = {
    "4-3-3": { 1: { x: 143, y: 147 }, 2: { x: 106, y: 80 }, 3: { x: 177, y: 80 }, 4: { x: 41, y: 69 }, 5: { x: 246, y: 69 }, 6: { x: 180, y: -2 }, 7: { x: 52, y: -73 }, 8: { x: 105, y: -2 }, 9: { x: 143, y: -120 }, 10: { x: 143, y: -65 }, 11: { x: 234, y: -73 } },
    "4-4-2": { 1: { x: 143, y: 147 }, 2: { x: 106, y: 80 }, 3: { x: 177, y: 80 }, 4: { x: 41, y: 69 }, 5: { x: 246, y: 69 }, 6: { x: 106, y: -2 }, 8: { x: 177, y: -2 }, 7: { x: 52, y: -30 }, 11: { x: 234, y: -30 }, 9: { x: 106, y: -120 }, 10: { x: 177, y: -120 } },
    "3-5-2": { 1: { x: 143, y: 147 }, 4: { x: 106, y: 80 }, 5: { x: 143, y: 80 }, 3: { x: 177, y: 80 }, 2: { x: 41, y: 30 }, 6: { x: 106, y: -2 }, 8: { x: 143, y: -2 }, 10: { x: 177, y: -2 }, 11: { x: 246, y: 30 }, 9: { x: 106, y: -120 }, 7: { x: 177, y: -120 } }
  };

  const matchTactics: Record<string, Record<number, { x: number; y: number }>> = {
    "4-3-3": { 1: { x: 1080, y: 0 }, 2: { x: 750, y: -350 }, 4: { x: 850, y: -150 }, 5: { x: 850, y: 150 }, 3: { x: 750, y: 350 }, 6: { x: 500, y: 0 }, 8: { x: 350, y: -200 }, 10: { x: 250, y: 0 }, 7: { x: 150, y: -400 }, 11: { x: 150, y: 400 }, 9: { x: 300, y: 0 } },
    "4-4-2": { 1: { x: 1080, y: 0 }, 2: { x: 750, y: -350 }, 4: { x: 850, y: -150 }, 5: { x: 850, y: 150 }, 3: { x: 750, y: 350 }, 7: { x: 450, y: -350 }, 6: { x: 450, y: -150 }, 8: { x: 450, y: 150 }, 11: { x: 450, y: 350 }, 9: { x: 300, y: -150 }, 10: { x: 300, y: 150 } },
    "3-5-2": { 1: { x: 1080, y: 0 }, 4: { x: 850, y: -200 }, 5: { x: 850, y: 0 }, 3: { x: 850, y: 200 }, 2: { x: 500, y: -350 }, 6: { x: 450, y: -150 }, 8: { x: 450, y: 0 }, 10: { x: 450, y: 150 }, 11: { x: 500, y: 350 }, 9: { x: 300, y: -150 }, 7: { x: 300, y: 150 } }
  };

  export const activeTactics: { 1: string, 2: string } = {
    1: "4-3-3", 
    2: "4-3-3"  
  };
  export const resetTactics = () => {
    activeTactics[1] = "4-3-3";
    activeTactics[2] = "4-3-3";
  };

  export const applyDynamicPhysics = () => {
    if (isDraftMapActive) {
      [1, 2].forEach(teamId => {
        const teamPlayers = room.getPlayerList().filter(p => p.team === teamId);
        teamPlayers.forEach(p => {
          room.setPlayerDiscProperties(p.id, { radius: 15, invMass: 1.0 });
        });
      });
      return; 
    }
    [1, 2].forEach(teamId => {
      const teamPlayers = room.getPlayerList().filter(p => p.team === teamId);
      
      // Aktif taktiği al
      const currentTactic = activeTactics[teamId as 1 | 2] || "4-3-3";
      
      teamPlayers.forEach((p) => {
        const pAug = toAug(p);
        if (!pAug || pAug.jerseyNumber === undefined) return;
  
        // 1. Oyuncunun p_position değerini formasyona ve numarasına göre hesapla/güncelle
        updatePlayerPositionName(pAug, currentTactic);
  
        // 2. Çıkan p_position değerine göre fizik özelliklerini uyarla
        if (pAug.p_position === "Kaleci") {
          room.setPlayerDiscProperties(p.id, config.PHYSICS.GK);
        } else if (pAug.p_position === "Defans") {
          room.setPlayerDiscProperties(p.id, config.PHYSICS.DEF);
        } else if (pAug.p_position === "Orta Saha") {
          room.setPlayerDiscProperties(p.id, config.PHYSICS.MID);
        } else if (pAug.p_position === "Forvet" || pAug.p_position === "Forvet Arkası / Kanat") {
          room.setPlayerDiscProperties(p.id, config.PHYSICS.FWD);
        }
      });
    });
  };
  export const updatePlayerPositionName = (pAug: PlayerAugmented, tacticName: string) => {
    if (!pAug.jerseyNumber) {
      pAug.p_position = undefined;
      return;
    }
  
    if (pAug.jerseyNumber === 1) {
      pAug.p_position = "Kaleci";
      return;
    }
  
    const lines = tacticName.split("-").map(Number);
    let currentJersey = 2;
  
    for (let i = 0; i < lines.length; i++) {
      const playerCount = lines[i];
      if (playerCount === 0) continue;
  
      const startNum = currentJersey;
      const endNum = currentJersey + playerCount - 1;
  
      if (pAug.jerseyNumber >= startNum && pAug.jerseyNumber <= endNum) {
        if (i === 0) {
          pAug.p_position = "Defans";
        } else if (i === 1 && lines.length === 3) {
          pAug.p_position = "Orta Saha";
        } else if (i === 2 && lines.length === 3) {
          pAug.p_position = "Forvet";
        } else {
          pAug.p_position = i === lines.length - 1 ? "Forvet" : (i === 0 ? "Defans" : "Orta Saha");
        }
        return;
      }
      currentJersey += playerCount;
    }
  
    if (pAug.jerseyNumber >= 2 && pAug.jerseyNumber <= 5) {
      pAug.p_position = "Defans";
    } else if (pAug.jerseyNumber >= 6 && pAug.jerseyNumber <= 8) {
      pAug.p_position = "Orta Saha";
    } else {
      pAug.p_position = "Forvet";
    }
};
  // 🚨 YENİ ALGORİTMA: Sınırsız Diziliş Oluşturucu 🚨
  // 🚨 YENİ ALGORİTMA: Sınırsız ve Kusursuz Ortalı Diziliş Oluşturucu 🚨
  export const getTacticPositions = (tacticName: string, isMatch: boolean) => {
    // 1. Önce senin elle yaptığın özel tasarımlara (4-3-3 vs.) baksın
    if (isMatch && matchTactics[tacticName]) return matchTactics[tacticName];
    if (!isMatch && draftTactics[tacticName]) return draftTactics[tacticName];

    // 2. Eğer özel bir tasarımsa (Örn: 4-1-5, 7-0-3) matematiksel olarak hesaplasın
    const lines = tacticName.split("-").map(Number);
    const positions: Record<number, { x: number; y: number }> = {};
    
    // Kaleci her zaman sabittir
    positions[1] = isMatch ? { x: 1080, y: 0 } : { x: 143, y: 147 };
    
    let currentJersey = 2;
    const numLines = lines.length;

    lines.forEach((playerCount, lineIndex) => {
      if (playerCount === 0) return;

      // --- DERİNLİK HESABI (Defans, Orta Saha, Forvet mesafesi) ---
      let rs5_X = 850;
      let draft_Y = 80;
      
      if (numLines > 1) {
        rs5_X = 850 - (lineIndex * (600 / (numLines - 1))); // 850'den 250'ye daralır
        draft_Y = 80 - (lineIndex * (200 / (numLines - 1))); // 80'den -120'ye daralır
      } else if (numLines === 1) {
        // Eğer tek hat varsa (Örn: !dizilis 10) takımı tam ortaya koy
        rs5_X = 550;
        draft_Y = -20;
      }

      // 👉 İŞTE DÜZELTTİĞİMİZ KUSURSUZ ORTALAMA (CENTERING) FORMÜLÜ BURA 👈
      // N adet oyuncuyu, sahanın genişliğine orantılı olarak "eşit boşluklarla" merkeze yayar.
      // Artık sağdan yığılma yapmayacak, kenarlardan eşit mesafe bırakacak!
      
      // RS5 için Y ekseni (Genişlik ~ 700, Üst sınır: -350)
      const rs5_spacing = 700 / (playerCount + 1);
      const rs5_startY = -350;

      // Draft için X ekseni (Kendi kutusunun genişliği ~ 210, İç Sınır: 40)
      const draft_spacing = 210 / (playerCount + 1);
      const draft_startX = 40;

      for (let p = 0; p < playerCount; p++) {
        // Oyuncuları baştan sona doğru eşit orantıyla yerleştirir
        let rs5_Y = rs5_startY + ((p + 1) * rs5_spacing);
        let draft_X = draft_startX + ((p + 1) * draft_spacing);

        if (isMatch) {
          positions[currentJersey] = { x: Math.round(rs5_X), y: Math.round(rs5_Y) };
        } else {
          positions[currentJersey] = { x: Math.round(draft_X), y: Math.round(draft_Y) };
        }
        currentJersey++;
      }
    });

    return positions;
  };

  export const changeTactic = (team: 1 | 2, tacticName: string, p: PlayerAugmented, isMatch: boolean = false) => {    // Doğrulama: Sadece sayılar girilmiş mi? Ve sayıların toplamı 10 ediyor mu?
    const lines = tacticName.split("-");
    const isValidFormat = lines.length >= 1 && 
                          lines.every(str => !isNaN(Number(str)) && str !== "") && 
                          lines.reduce((sum, str) => sum + Number(str), 0) === 10;

    if (!draftTactics[tacticName] && !isValidFormat) {
      sendMessage(`❌ Geçersiz diziliş! Toplamı 10 olan sayılar girmelisin. (Örn: 4-4-2)`, p);
      return;
    }
    
    activeTactics[team] = tacticName;
    const teamEmoji = team === 1 ? "🔴" : "🔵";
    sendMessage(`✅ ${teamEmoji} Takımı dizilişini [${tacticName}] olarak güncelledi!`);
    
    setFormationPositions(isMatch);
    applyDynamicPhysics();
  };

  let enforceInterval: NodeJS.Timeout | null = null;

  export const setFormationPositions = (isMatch: boolean = false) => {
    if (enforceInterval) clearInterval(enforceInterval); 
    
    let enforceCount = 0;
    
    enforceInterval = setInterval(() => {
      enforceCount++;
      if (isMatch && enforceCount > 10) {
        clearInterval(enforceInterval!);
        enforceInterval = null;
        return;
      }

      // 🚨 İŞTE ÇÖZÜM: Harita yüklenirken oyunun bizim ayarlarımızı ezmemesi için döngü içinde mühürlüyoruz!
      applyDynamicPhysics(); 

      const players = room.getPlayerList().filter(p => p.team === 1 || p.team === 2);
      
      players.forEach(p => {
        const pAug = toAug(p);
        if (pAug && pAug.jerseyNumber && pAug.jerseyNumber <= 11) {
          const teamTactic = activeTactics[p.team as 1 | 2];
          
          // 👇 İŞTE BU SATIRI EKLE! ADAM ETİKETİNİ ALSIN 👇
          updatePlayerPositionName(pAug, teamTactic);
  
          const activeDatabase = getTacticPositions(teamTactic, isMatch);
          const pos = activeDatabase?.[pAug.jerseyNumber];
          
          if (pos) {
            const spawnX = p.team === 1 ? -Math.abs(pos.x) : Math.abs(pos.x);
            room.setPlayerDiscProperties(p.id, { x: spawnX, y: pos.y, xspeed: 0, yspeed: 0 });
          }
        }
      });
    }, 50);
  };

  export const handleLateJoiner = (p: PlayerObject) => {
    if (p.team !== 1 && p.team !== 2) return;

    const pAug = toAug(p);
    if (pAug.jerseyNumber && pAug.jerseyNumber <= 11) return;

    const teamPlayers = room.getPlayerList().filter(pl => pl.team === p.team && pl.id !== p.id);
    const takenNumbers = teamPlayers.map(pl => toAug(pl)?.jerseyNumber).filter(n => n !== undefined);

    let assignedNumber: number | null = null;
    for (let i = 1; i <= 11; i++) {
      if (!takenNumbers.includes(i)) {
        assignedNumber = i;
        break;
      }
    }

    if (assignedNumber) {
      pAug.jerseyNumber = assignedNumber;
      room.setPlayerAvatar(p.id, assignedNumber.toString());
      //sendMessage(`Dizilişe sonradan katıldın! Sana boşta olan [${assignedNumber}] numaralı forma/mevki atandı.`, p);

      const gameState = room.getScores();
      if (gameState) {
        const teamTactic = activeTactics[p.team as 1 | 2];
        
        // 🚨 Algoritmayı tetikliyoruz 🚨
        const activeDatabase = getTacticPositions(teamTactic, true);
        const pos = activeDatabase?.[assignedNumber];
        
        if (pos) {
          const spawnX = p.team === 1 ? -Math.abs(pos.x) : Math.abs(pos.x);
          setTimeout(() => {
            room.setPlayerDiscProperties(p.id, { x: spawnX, y: pos.y, xspeed: 0, yspeed: 0 });
            applyDynamicPhysics();
          }, 100);
        }
      }
    }
  };