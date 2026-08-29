import { duringDraft } from "./chooser";
import { room, players } from "..";
import { sendMessage } from "./message";
import { toAug } from "..";

// ÇÖZÜM: isDraftMapActive şalterini de kilit listesiyle birlikte import ediyoruz
import { lockedDraftPlayers, isDraftMapActive, isDizilisPhase } from "./draft/draftLock";
let j = 0;
export const afk = {
  onTick: () => {
    if (!duringDraft && !process.env.DEBUG) {
      j+=6;
    }

    if (j > 60) {
      j = 0;
      players
        .filter((p) => p.team == 1 || p.team == 2)
        .forEach((p) => {
          
          // 🚨 DÜZELTİLEN KISIM BURASI 🚨
          // Mevkide kilitli adamları VEYA Diziliş haritasındaki herkesi AFK saymaktan kurtarıyoruz
          if (lockedDraftPlayers.has(p.id) || isDizilisPhase) {
            p.afkCounter = 0; 
            return; 
          }

          p.afkCounter += 1;
          
          if (p.afkCounter == 14) {
            sendMessage("Hareket et! 5 saniye içinde AFK olacaksın...", p);
          } else if (p.afkCounter > 19) { 
            p.afkCounter = 0;
            
            // --- YENİ DÜZENLEME: Haritaya Göre AFK Cezası ---
            // if (isDraftMapActive) {
            //   // Eğer 11v11 Draft haritasındaysak acıma, direkt odadan at
            //   room.kickPlayer(p.id, "Draft haritasında AFK kaldığınız için odadan atıldınız.", false);
            // } else {
            //   // Normal haritalardaysak eski usül izleyiciye at
            //   room.setPlayerTeam(p.id, 0);
            //   p.afk = true;
              
            //   if (p.jerseyNumber !== undefined) {
            //     room.setPlayerAvatar(p.id, p.jerseyNumber.toString());
            //   }
            // }
            // -------------------------------------------------
          }
        });
    }
  },
  onActivity: (p: PlayerObject) => {
    toAug(p).afkCounter = 0;
  },
};