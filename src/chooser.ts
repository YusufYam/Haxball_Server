import { room, players, PlayerAugmented, db } from "..";
import * as fs from "fs";

import { sendMessage } from "./message";
import { game, Game } from "..";
import { sleep } from "./utils";
import { toAug } from "..";
import { teamSize } from "./settings";
import { changeElo } from "./elo";
import { startChatDraft } from "./draft/draftManager";
import { setDraftMapStatus, isDraftMapActive, isDizilisPhase } from "./draft/draftLock";
import { triggerAutoDraft } from "./command";


/* This manages teams and players depending
 * on being during ranked game or draft phase. */

const maxTeamSize = process.env.DEBUG ? 1 : teamSize;
let isRunning: boolean = false;
export let isRanked: boolean = false;
export const changeIsRanked = (m: boolean) => { isRanked = m; };


export const DRAFT_LIMIT = 2;
export const CAPTAIN_PICK_TIME = 60;    // Kaptanların havuzdan oyuncu seçme süresi
export const POSITION_LOCK_TIME = 60;   // Oyuncuların mevkiye kilitlenme süresi
export const FORMATION_SETUP_TIME = 120;


export let duringDraft: boolean = false;
export let changeDuringDraft = (m: boolean) => (duringDraft = m);

const balanceTeams = () => {
  if (duringDraft || isRanked || isDraftMapActive) {
    return;
  }
  
  const movableRed = red().filter((p) => toAug(p).jerseyNumber === undefined);
  const movableBlue = blue().filter((p) => toAug(p).jerseyNumber === undefined);

  if (red().length > blue().length + 1 && movableRed.length > 0) {
    room.setPlayerTeam(movableRed[0].id, 2);
  } else if (red().length + 1 < blue().length && movableBlue.length > 0) {
    room.setPlayerTeam(movableBlue[0].id, 1);
  }
};

export const handlePlayerLeaveOrAFK = async () => {
  if (players.filter((p) => !p.afk).length < 1) {
    room.stopGame();
    sleep(5000); 
    room.startGame();
  }
  await sleep(100);
  if (!duringDraft && !isRanked) {
    balanceTeams();
  }
  
  // 🚨 İŞTE SİNSİ DÜŞMAN BURADAYDI! 🚨
  if (isRanked && !process.env.DEBUG) {
    // Eskiden <= 2 yazıyordu, yani sahada 2 kişi kaldığı an isRanked'i false yapıyordu!
    // Artık sadece sahada 1 kişi veya hiç kimse kalmazsa iptal edecek. (< 2 yaptık)
    if ([...red(), ...blue()].length < 2) {
      isRanked = false;
      sendMessage("Sahada oynayan kimse kalmadı. Dereceli oyun iptal ediliyor.");
    }
  }
};

const handleWin = async (game: Game, winnerTeamId: TeamID) => {
  try {
    const changes = await changeElo(game, winnerTeamId)

    changes.forEach((co) => {
      const p = room.getPlayer(co.id);
      if (p) {
        sendMessage(
          `XP: ${toAug(p).elo} → ${toAug(p).elo + co.change} (${co.change > 0 ? "+" : ""}${co.change})`,
          p,
        );
      }
    });

    changes.forEach((co) => {
      if (players.map((p) => p.id).includes(co.id)) {
        const pp = room.getPlayer(co.id);
        if (pp) {
          toAug(pp).elo += co.change;
        } 
      }
    });
  } catch (e) {
    console.log("ELO işlenirken hata oluştu:", e);
  }
};

const red = () => room.getPlayerList().filter((p) => p.team == 1);
const blue = () => room.getPlayerList().filter((p) => p.team == 2);
const spec = () => room.getPlayerList().filter((p) => p.team == 0);
const both = () => room.getPlayerList().filter((p) => p.team == 1 || p.team == 2);
const ready = () => room.getPlayerList().filter((p) => !toAug(p).afk);

export const addToGame = (room: RoomObject, p: PlayerObject) => {
  // 1. KORUMA: Eğer oyun Ranked (Dereceli) ise ve sahada yer kalmamışsa (>= 22) alma.
  // (Eskiden burada <= 22 yazıyordu, o yüzden kimseyi sahaya almıyordu!)
  if (game && isRanked && [...red(), ...blue()].length >= maxTeamSize * 2) {
    return;
  }
  
  if (game && (toAug(p).cardsAnnounced >= 2 || toAug(p).foulsMeter >= 2)) {
    return;
  }
  
  // Drafttayken sahaya atlama koruması (izleyicide kalmalarını sağlar)
  if (duringDraft || isDraftMapActive) {
    return;
  }

  // 6 Kişi oto-draft koruması
  if (!isRanked && ready().length >= DRAFT_LIMIT) { 
    return;
  }

  // Hiçbir engele takılmadıysa (yani maç oynanıyorsa) takıma dağıt
  if (red().length > blue().length) {
    room.setPlayerTeam(p.id, 2);
  } else {
    room.setPlayerTeam(p.id, 1);
  }
};

const initChooser = (room: RoomObject) => {
  const refill = () => {
    const specs = spec().filter((p) => !toAug(p).afk);
    for (let i = 0; i < specs.length; i++) {
      const toTeam = i % 2 == 0 ? 1 : 2;
      room.setPlayerTeam(specs[i].id, toTeam);
    }
  };

  // --- OTO-BAŞLATMA GÖZLEMCİSİ (6 KİŞİ OLUNCA DRAFT AÇAR) ---
 // --- OTO-BAŞLATMA GÖZLEMCİSİ ---
 // --- OTO-BAŞLATMA GÖZLEMCİSİ ---
// --- OTO-BAŞLATMA GÖZLEMCİSİ ---
// --- OTO-BAŞLATMA GÖZLEMCİSİ ---
// --- OTO-BAŞLATMA GÖZLEMCİSİ ---
const checkAndStartDraft = () => {
  // 1. 🚨 KESİN KORUMA: Eğer aktif bir maç varsa (Skor tablosu varsa) KESİNLİKLE başlatma
  if (room.getScores() !== null) {
    return;
  }

  // 2. KORUMA: Zaten draft veya diziliş aşamasındaysak iptal et
  if (isDraftMapActive || isDizilisPhase) {
    return;
  }

  // 3. KORUMA: Oyun dereceli (Ranked) modundaysa iptal et
  if (isRanked) {
    return;
  }

  // Bütün engelleri aştıysa, demek ki oda boşta bekliyor. Sayı da tamamsa başlat!
  if (ready().length >= DRAFT_LIMIT) {
    changeIsRanked(true);
    triggerAutoDraft();
  }
};

  // Oyuncu katıldığında veya ayrıldığında kontrol et
  const _onPlayerJoin = room.onPlayerJoin;
  room.onPlayerJoin = (p) => {
    if (_onPlayerJoin) _onPlayerJoin(p);
    checkAndStartDraft();
  };

  const _onPlayerLeave = room.onPlayerLeave;
  room.onPlayerLeave = (p) => {
    if (_onPlayerLeave) _onPlayerLeave(p);
    checkAndStartDraft();
    handlePlayerLeaveOrAFK();
  };
  // ---------------------------------------------------------

  const isEnoughPlayers = () => ready().length >= 2;
  if (room.getScores()) {
    isRunning = true;
  }

  const _onTeamGoal = room.onTeamGoal;
  room.onTeamGoal = (team) => {
    if (game) {
      game.inPlay = false;
      game.animation = true;
      game.boostCount = 0;
      game.ballRotation.power = 0;
      game.positionsDuringPass = [];
      players.forEach((p) => (p.canCallFoulUntil = 0));
      game.eventCounter += 1;
      if (isRanked && !duringDraft) {
        const evC = game.eventCounter;
        const gameId = game.id;
        const dirKick = team == 1 ? -1 : 1;
        setTimeout(() => {
          if (
            room.getBallPosition()?.x == 0 &&
            room.getBallPosition()?.y == 0 &&
            game?.eventCounter == evC &&
            game?.id == gameId
          ) {
            room.setDiscProperties(0, {
              xspeed: dirKick * 2,
              yspeed: Math.random(),
            });
            sendMessage(
              "Topa 35 saniye boyunca dokunulmadı, bu nedenle otomatik olarak hareket ettirildi.",
            );
          }
        }, 35000);
      }
    }
    _onTeamGoal(team);
  };

  const _onTeamVictory = room.onTeamVictory;
  room.onTeamVictory = async (scores) => {
    if (duringDraft) {
      return;
    }
    if (_onTeamVictory) {
      _onTeamVictory(scores);
    }
    const winTeam = scores.red > scores.blue ? 1 : 2;
    const loseTeam = scores.red > scores.blue ? 2 : 1;
    if (isRanked) {
      if (!game) {
        return;
      }
      await handleWin(game, winTeam);
    }
    sendMessage("Mola 10sn");
    await sleep(10000);
    
    // --- BURADAN AŞAĞISINI TAMAMEN DEĞİŞTİRİYORUZ --- burası maç biitince 6 kontrl fln
    if (ready().length >= DRAFT_LIMIT) { 
      // Eski, manuel ve hatalı harita yükleme kodlarını çöpe attık!
      // Onun yerine tüm kilitleri temizleyen merkezi fonksiyonumuzu çağırıyoruz:
      triggerAutoDraft(); 
      isRanked = true; // Sistemin Ranked modda kalması için
    } else {
      isRanked = false;
      let i = 0;
      ready().forEach((p) => {
        if (i % 2) {
          room.setPlayerTeam(p.id, 2);
        } else {
          room.setPlayerTeam(p.id, 1);
        }
        i++;
      });
      room.startGame();
    }
  };
};

export const resetChooser = () => {
  isRunning = false;
  isRanked = false;
  duringDraft = false;
};

export default initChooser;