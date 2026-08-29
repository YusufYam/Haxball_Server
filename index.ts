import HaxballJS from "haxball.js";

import { addToGame, duringDraft, handlePlayerLeaveOrAFK } from "./src/chooser";
import { isCommand, handleCommand } from "./src/command";
import { playerMessage, sendMessage } from "./src/message";
import { startVaazTimer, startCumaCheckTimer, checkBanOnJoin,isProfanity, banPlayer,mutedAuths,getMuteStatus } from "./src/vaaz";
import { startPanel } from "./src/panel"; // Panel importu
import {
  handleBallOutOfBounds,
  handleBallInPlay,
  clearThrowInBlocks,
} from "./src/out";
import { checkAllX, rotateBall, enforcePhysicsLock } from "./src/superpower";
import { handleLastTouch } from "./src/offside";
import { checkFoul } from "./src/foul";
import * as fs from "fs";
import { applySlowdown } from "./src/slowdown";
import initChooser from "./src/chooser";
import { initDb } from "./src/db";
import { initPlayer, welcomePlayer} from "./src/welcome";
import { setBallInvMassAndColor, teamplayBoost,getCalculatedInvMass,CONFIG,startColorTransition,updateColorTransition,boostToColor } from "./src/teamplayBoost";
import { applyRotation } from "./src/rotateBall";
import { afk } from "./src/afk";
import * as crypto from "node:crypto";
import config from "./config";
import { handleDribble } from "./src/dribble";
import { handleDraftLocks, clearPlayerLock,isDizilisPhase } from "./src/draft/draftLock";
import { handleDraftChat, handleLateJoinerDuringDraft, redCap, blueCap, draftPhase } from "./src/draft/draftManager";
import { setFormationPositions, handleLateJoiner,applyDynamicPhysics } from "./src/match/formation";
import { isDraftMapActive } from "./src/draft/draftLock"; // Sadece draft haritasında çalışmasın diye şalteri alıyoruz


export const version = '1.0.0 (13/08/2026)'

export interface lastTouch {
  byPlayer: PlayerAugmented;
  x: number;
  y: number;
}

export interface previousTouch {
  byPlayer: PlayerAugmented;
  x: number;
  y: number;
}
export interface holdPlayer {
  // used to save player data in memory for each game to handle him
  // returning to game and stats
  id: number;
  auth: string;
  team: TeamID;
}

export class PlayerAugmented {
  id: number;
  name: string;
  auth: string;
  foulsMeter: number;
  cardsAnnounced: number;
  sliding: boolean;
  conn: string;
  activation: number;
  team: 0 | 1 | 2;
  slowdown: number;
  slowdownUntil: number;
  cooldownUntil: number;
  fouledAt: { x: number; y: number };
  canCallFoulUntil: number;
  afk: boolean;
  afkCounter: number;
  elo: number;
  jerseyNumber?: number; // Forma Numarası
  p_position?: string;
  customId?: number;

  constructor(p: PlayerObject & Partial<PlayerAugmented>) {
    this.id = p.id;
    this.name = p.name;
    this.auth = p.auth;
    this.conn = p.conn;
    this.team = p.team;
    this.foulsMeter = p.foulsMeter || 0;
    this.cardsAnnounced = p.cardsAnnounced || 0;
    this.activation = 0;
    this.sliding = false;
    this.slowdown = p.slowdown || 0;
    this.slowdownUntil = p.slowdownUntil || 0;
    this.cooldownUntil = p.cooldownUntil || 0;
    this.canCallFoulUntil = 0;
    this.fouledAt = { x: 0, y: 0 };
    this.afk = false;
    this.afkCounter = 0;
    this.elo = 1200;
    this.jerseyNumber = undefined;
    this.p_position = undefined; 
    
    // 🚨 İŞTE TERSİNE MÜHENDİSLİK KANCASI (Constructor'ın İÇİNDE kalmalı!) 🚨
    const match = this.name.match(/^\[(\d+)\]/);
    if (match) {
      this.customId = parseInt(match[1], 10);
    } else {
      this.customId = undefined;
    }
  } // 👈 İŞTE CONSTRUCTOR BURADA KAPANMALI!

  get position() {
    return room.getPlayer(this.id).position;
  }
}
export const usedCustomIds = new Set<number>();


// 🚨 YENİ: KÜRESEL ID ÜRETİCİSİ (Oyun motoru buradan ID çekecek) 🚨
declare global {
  var getUniqueHaxId: () => number;
}
global.getUniqueHaxId = () => {
  let randomId;
  do {
    randomId = Math.floor(Math.random() * 90) + 10;
  } while (usedCustomIds.has(randomId)); // Daha önce alınmışsa yenisini üretir
  
  // Ürettiği an havuza da ekliyor ki aynı milisaniyede giren iki kişiye aynısını vermesin
  usedCustomIds.add(randomId); 
  return randomId;
};

let gameId = 0;
export class Game {
  id: number;
  inPlay: boolean;
  animation: boolean;
  eventCounter: number;
  lastTouch: lastTouch | null;
  previousTouch: previousTouch | null;  
  lastKick: PlayerObject | null;
  ballRotation: { x: number; y: number; power: number };
  positionsDuringPass: PlayerObject[];
  skipOffsideCheck: boolean;
  holdPlayers: holdPlayer[];
  rotateNextKick: boolean;
  boostCount: number;
  dribblePower: number;// Topun şarj seviyesi (0 ile 100 arası)
  dribblerId: number | null; // Topu o an süren oyuncunun ID'si
  transitioningColor: boolean;
  colorTransitionProgress: number; // 0 ile 1 arası
  startColor: number;
  targetColor: number;

  constructor() {
    gameId += 1;
    this.id = gameId;
    this.eventCounter = 0; // to debounce some events
    this.inPlay = true;
    this.lastTouch = null;
    this.previousTouch = null;
    this.lastKick = null;
    this.animation = false;
    this.ballRotation = { x: 0, y: 0, power: 0 };
    this.positionsDuringPass = [];
    this.skipOffsideCheck = false;
    this.holdPlayers = JSON.parse(JSON.stringify(players.map(p => { return { id: p.id, auth: p.auth, team: p.team }})))
    this.rotateNextKick = false;
    this.boostCount = 0;
    this.dribblePower = 0;
    this.dribblerId = null;
    this.transitioningColor = false;
    this.colorTransitionProgress = 0;
    this.startColor = 0xffffff;
    this.targetColor = 0xffffff;
  }
  rotateBall() {
    rotateBall(this);
  }
  handleBallTouch() {
    const ball = room.getDiscProperties(0);
    if (!ball) {
      return;
    }
    for (const p of room.getPlayerList()) {
      const prop = room.getPlayerDiscProperties(p.id);
      if (!prop) {
        continue;
      }
      const dist = Math.sqrt((prop.x - ball.x) ** 2 + (prop.y - ball.y) ** 2);
      const isTouching = dist < prop.radius + ball.radius + 0.1;
      if (isTouching) {
        const pAug = toAug(p);
        pAug.sliding = false;
        handleLastTouch(this, pAug);
      }

      // Used for cancelling teamplay. I dont want to enemy
      // team to be able to hit boosted ball when intercepting
      // strength
      if (!this.lastKick || this.lastKick.team === p.team || !this.inPlay) { continue; }
      const distPredicted = Math.sqrt(((prop.x+prop.xspeed*2) - (ball.x+ball.xspeed*2)) ** 2 + ((prop.y+prop.yspeed*2) - (ball.y+ball.yspeed*2)) ** 2);
      const isAlmostTouching = distPredicted < prop.radius + ball.radius + 5;
      if (isAlmostTouching) {
        this.boostCount = 0;
        this.lastKick = null;
        setBallInvMassAndColor(this);
      }
    }
  }
  handleBallOutOfBounds() {
    handleBallOutOfBounds(this);
  }
  handleBallInPlay() {
    handleBallInPlay(this);
  }
  checkAllX() {
    checkAllX(this);
  }
  checkFoul() {
    checkFoul();
  }
  applySlowdown() {
    applySlowdown();
  }
}

export let players: PlayerAugmented[] = [];
export let toAug = (p: PlayerObject) => {
  const found = players.find((pp) => pp.id == p.id);
  if (!found) {
    throw(`Lookup for player with id ${p.id} failed. Player is not in the players array: ${JSON.stringify(players)}`);
  }
  return found;
};
export let room: RoomObject;
export let game: Game | null;
export let db: any;
export let adminPass: string = crypto.randomBytes(6).toString("hex");

const roomBuilder = async () => {
  const HBInit = await HaxballJS()
  const args: RoomConfigObject = { ...config, noPlayer: true }
  room = HBInit(args);
  //room.setPassword("123");
  db = await initDb();
  const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
    encoding: "utf8",
    flag: "r",
  });
  room.setCustomStadium(rsStadium);
  room.setTimeLimit(config.timeLimit);
  room.setScoreLimit(config.scoreLimit);
  room.setTeamsLock(true);
  if (process.env.DEBUG) {
    room.setScoreLimit(config.scoreLimit);
    room.setTimeLimit(config.timeLimit);
  }
  room.startGame();

  let i = 0;
  
  room.onTeamGoal = (team) => {
    if (game?.lastTouch?.byPlayer.team === team) {
      sendMessage(`Gool! ${game?.lastTouch?.byPlayer.name} Gol attı! 🥅`);
      if (game?.previousTouch?.byPlayer.id !== game?.lastTouch?.byPlayer.id && game?.previousTouch?.byPlayer.team === game?.lastTouch?.byPlayer.team) {
        sendMessage(`Assisti yapan ${game?.previousTouch?.byPlayer.name}! 🎯`);
      }
    } else {
      sendMessage(`Kendi kalesine olağan üstü bir gol atan şahıs -> ${game?.lastTouch?.byPlayer.name}!`);
    }
  };
  let debugTick = 0;
  room.onGameTick = () => {
    handleDraftLocks();
   
    // 🚨 İŞTE WASD MOTORUNU 60 FPS'TE TETİKLEDİĞİMİZ YER 🚨
    enforcePhysicsLock(); 
    // debugTick++;
    // if (debugTick % 20 === 0) { // Saniyede 3 kez ekrana basar
    //   const activePlayers = room.getPlayerList().filter(p => p.team === 1 || p.team === 2);
      
    //   activePlayers.forEach(p => {
    //     const props = room.getPlayerDiscProperties(p.id);
    //     if (props) {
    //       // X ve Y eksenindeki hızları toplayıp gerçek hızı (vektör büyüklüğünü) buluyoruz
    //       const anlikHiz = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2).toFixed(3);
          
    //       console.log(`🏎️ [${p.name}] - Gerçek Hız: ${anlikHiz} | Üzerindeki Damping: ${props.damping} | invs: ${props.invMass}`);
    //     }
    //   });
    // }
    if (!game) {
      return;
    }
    try {
      // 👇 DURAN TOP KİLİDİ: Top oyunda değilse (taç, faul vb.) top sürmeyi devre dışı bırak
      if (game.inPlay) {
        handleDribble(game);
      }
      
      updateColorTransition(game);
      
      

      i++;
      game.handleBallTouch();
      if (i > 6) {
        if (game.inPlay) {
          game.handleBallOutOfBounds();
          game.rotateBall();
        } else {
          game.handleBallInPlay();
        }
        game.applySlowdown();
        afk.onTick();
        game.checkAllX();
        game.checkFoul();
        i = 0;
      }
    } catch (e) {
      console.log("Error:", e);
    }
  };

  room.onPlayerActivity = (p) => {
    afk.onActivity(p);
  };

  room.onPlayerJoin = async (p) => {
    const isBanned = await checkBanOnJoin(p);
    if (isBanned) return;
    if (!p.auth) {
      room.kickPlayer(p.id, "Your auth key is invalid. Change at haxball.com/playerauth", false);
      return
    }
    if (process.env.DEBUG) {
      room.setPlayerAdmin(p.id, true);
    } else {
      if (players.map((p) => p.auth).includes(p.auth)) {
        room.kickPlayer(p.id, "You are already on the server.", false);
        return
      }
    }
    welcomePlayer(room, p);
    await initPlayer(room, p);

    const pAug = toAug(p);

    // 🚨 KONTROL: Bu ID'ye sahip başka biri odada var mı? 🚨
    if (pAug.customId !== undefined) {
      const alreadyExists = players.some(pp => pp.id !== p.id && pp.customId === pAug.customId);
      if (alreadyExists) {
        room.kickPlayer(p.id, `[${pAug.customId}] ID'si odadaki başka bir oyuncu tarafından kullanılıyor! Başka bir ID ile gir.`, false);
        return;
      }
    }

    // --- 🚨 DİZİLİŞ AŞAMASI İZLEYİCİ KORUMASI 🚨 ---
    if (isDizilisPhase) {
      sendMessage(`📥 ${p.name} odaya katıldı. Diziliş aşamasında olduğumuz için maç başlayana kadar izleyicide bekleyecek.`);
      console.log("oyuncu katıldı (izleyici):" + p.id);
      return; 
    }
    // -----------------------------------------------

    addToGame(room, p);
    handleLateJoinerDuringDraft(p.id);
    console.log("oyuncu katıldı:"+p.id)
  };

  room.onPlayerLeave = async (p) => {
    // Draft aşamasındaysa kilitlerini temizle
    clearPlayerLock(p.id);

    const leavingPlayer = players.find((pp) => pp.id === p.id); 
    
    // --- 🚨 ÇIKAN OYUNCUNUN ID'SİNİ HAVUZDAN SİL (Geri Dönüşüm) 🚨 ---
    if (leavingPlayer && leavingPlayer.customId) {
      usedCustomIds.delete(leavingPlayer.customId);
    }
    // -----------------------------------------------------------------

    players = players.filter((pp) => p.id != pp.id);
    await handlePlayerLeaveOrAFK();
    
    // Odada hiç kimse kalmazsa sistemi sıfırla
    if (players.filter((p) => !p.afk).length < 1) {
      if (game) {
        game.eventCounter += 1
      }
      room.stopGame(); 
      room.startGame();
    }
  };

  room.onPlayerChat = (p, msg) => {
    const pp = toAug(p);
    
    // 1. Draft sistemi konuşmaları (+ yazma veya draft numarası seçme)
    // Eğer adam + yazdıysa sistem bunu halleder ve true döner, mesaj chate düşmez!
    const muteStatus = getMuteStatus(p.auth);
  if (muteStatus.isMuted) {
    sendMessage(`🤫 Susturulduğunuz için mesaj gönderemezsiniz! (Kalan Süre: ${muteStatus.remainingMinutes} dk)`, p, 0xFF0000, "bold", 2);
    return false;
  }
    if (isProfanity(msg)) {
      banPlayer(p, "Sohbet alanında küfür kullanımı");
      return false; // Mesajın ekrana düşmesini engeller
    }
    if (handleDraftChat(pp, msg)) {
      return false; 
    }

    // 2. Oyun içi ! komutları (!forma, !diziliş vs.)
    if (isCommand(msg)) {
      handleCommand(pp, msg);
      return false;
    }

    // 3. Admin Kontrolü (Admin her zaman konuşur)
    if (p.admin) {
      const adminMessage = `👑 [ADMİN] ${p.name}: ${msg}`;
      room.sendAnnouncement(adminMessage, undefined, 0xFFD700, "bold", 1);
      return false; 
    }

    // 🚨 4. DRAFT HARİTASI (Seçim Aşamaları) SUSTURUCUSU 🚨
    if (isDraftMapActive) {
      const isRedCaptain = redCap && p.id === redCap.id;
      const isBlueCaptain = blueCap && p.id === blueCap.id;

      // Kaptan seçilirken (CAPTAINS) veya Mevkiye kilitlenirken (IDLE) KİMSE konuşamaz
      if (draftPhase === "CAPTAINS") {
        sendMessage("🤫 Bu aşamada sadece + yazarak kaptan adayı olabilirsiniz. Sohbet Edemezsiniz!", pp, 0xFF0000, "bold", 2);
        return false;
      }
      if (draftPhase === "IDLE") {
        sendMessage("🤫 Bu aşamada sohbet sadece takım kaptanlarına açıktır!", pp, 0xFF0000, "bold", 2);
        return false;
      }

      // Oyuncular takıma alınırken (PICKING) SADECE KAPTANLAR konuşabilir
      if (draftPhase === "PICKING" && !isRedCaptain && !isBlueCaptain) {
        sendMessage("🤫 Seçim aşamasında sadece Takım Kaptanları konuşabilir!", pp, 0xFF0000, "bold", 2);
        return false;
      }
    }

    // 🚨 5. DİZİLİŞ HARİTASI SUSTURUCUSU 🚨
    if (isDizilisPhase) {
      const isRedCaptain = redCap && p.id === redCap.id;
      const isBlueCaptain = blueCap && p.id === blueCap.id;
      
      if (!isRedCaptain && !isBlueCaptain) {
        sendMessage("🤫 Diziliş aşamasında sadece Takım Kaptanları konuşabilir!", pp, 0xFF0000, "bold", 2);
        return false;
      }
    }

    // 6. Normal maç aşaması (Gerçek maça geçilince kilitler açılır, herkes konuşur)
    playerMessage(pp, msg);
    return false;
};

  room.onGameStart = (_) => {
    players.forEach((p) => {
      p.slowdownUntil = 0;
      p.foulsMeter = 0;
      p.cardsAnnounced = 0;
      p.activation = 0;
      p.sliding = false;
      p.slowdown = 0;
      p.slowdownUntil = 0;
      p.cooldownUntil = 0;
      p.canCallFoulUntil = 0;
    });
    if (!duringDraft) {
      game = new Game();
    }
    clearThrowInBlocks();
    room.getPlayerList().forEach((p) => {
      const augPlayer = players.find(pp => pp.id === p.id);
      if (augPlayer && augPlayer.jerseyNumber !== undefined) {
        room.setPlayerAvatar(p.id, augPlayer.jerseyNumber.toString());
      } else {
        room.setPlayerAvatar(p.id, "");
      }

     
    });
    
  };

  room.onPositionsReset = () => {
    // 1. Taç bloklarını temizle ve topu sıfırla
    clearThrowInBlocks();
    if (game) {
      game.animation = false;
      game.inPlay = false;
      room.setDiscProperties(0, {
        xspeed: 0,
        yspeed: 0,
        xgravity: 0,
        ygravity: 0,
      });
      game.ballRotation = { x: 0, y: 0, power: 0 };
    }

    // 2. Eğer draft haritasındaysak formasyonu es geç
    if (isDraftMapActive) return;
    
    // Konumları ayarlarken dinamik fizikleri de anında tekrar tetikliyoruz!
    setFormationPositions(true); 
    applyDynamicPhysics(); // 👈 İŞTE BURAYA EKLEDİK!
  };

  room.onGameStop = (_) => {
    if (game) {
      game = null;
    }
  };

  room.onPlayerTeamChange = (p, byPlayer) => {
    if (process.env.DEBUG) {
      //room.setPlayerDiscProperties(p.id, {x: -10, y: 0})
    }
    
    // --- İŞTE HAYAT KURTARAN DÜZELTME BURASI ---
    // Eğer Draft haritasında VEYA Diziliş aşamasındaysak normal maçın formasyon kodunu ÇALIŞTIRMA!
    if (!isDraftMapActive && !isDizilisPhase) {
      if (p.team === 1 || p.team === 2) {
        handleLateJoiner(p);
      }
    }
    // ------------------------------------------

    const pp = toAug(p);
    pp.team = p.team;

    // Oyuncu izleyiciden sahaya veya sahadan izleyiciye geçtiğinde numarasını koru
    if (pp.jerseyNumber !== undefined) {
      room.setPlayerAvatar(p.id, pp.jerseyNumber.toString());
    } else {
      room.setPlayerAvatar(p.id, "");
    }

    // 👇 OYUNA SONRADAN GİREN (LATE JOINER) KALECİ KONTROLÜ 👇
    if (!isDraftMapActive && !isDizilisPhase && (p.team === 1 || p.team === 2)) {
      setTimeout(() => {
        const currentProps = room.getPlayerDiscProperties(p.id); 
        
        if (currentProps) {
          if (pp.jerseyNumber === 1) {
            // Sonradan giren adam 1 Numaraysa şişir!
            room.setPlayerDiscProperties(p.id, { radius: 18, invMass: 0.8 });
          } else {
            // Diğerleri standart
            room.setPlayerDiscProperties(p.id, { radius: 15, invMass: 1.0 }); 
          }
        }
      }, 50); 
    }
  };

  room.onPlayerBallKick = (p) => {
    if (game) {
      
      const pp = toAug(p);
      
      let effectiveRotationBoost = game.boostCount; 
      let currentColor = room.getDiscProperties(0)?.color || 0xffffff;
      
      if (game.dribblePower > 0) {
        if (game.dribblerId === p.id) {
          // Hız çarpanlarını çöpe attık! 
          // Çünkü handleDribble içindeyken topun kütlesi(invMass) zaten dribling şarjına göre ayarlandı.
          // Vuruş tam olarak normal bir pasmış gibi oyun fiziği tarafından doğal işlenecek.

          // Falso (rotation) için sanal pas gücünü hesaplayıp fonksiyona yollamamız yeterli:
          const dynamicMax = Math.max(0, 100 - (game.boostCount * (100 / 6)));
          const ratio = dynamicMax > 0 ? (game.dribblePower / dynamicMax) : 0;
          
          effectiveRotationBoost = game.boostCount + (ratio * (6 - game.boostCount));
        }
        
        // Vuruş yapıldı, driblingi sıfırla
        game.dribblePower = 0;
        game.dribblerId = null;
      }
      
      // Pas/Takım oyununu işletirken sanal gücü gönderiyoruz
      teamplayBoost(game, p, effectiveRotationBoost); 
      
      // Falso hesaplamasına sanal gücü veriyoruz
      applyRotation(game, p, effectiveRotationBoost);

      // EĞER PAS SAYISI 6 DEĞİLSE TOP HAREKET HALİNDEYKEN RENK YAVAŞÇA ESKİ HALİNE DÖNSÜN
      if (game.boostCount < 6) {
        const targetCol = boostToColor(game.boostCount, p.team);
        startColorTransition(game, currentColor, targetCol);
      }
      
      handleLastTouch(game, pp);
      
      if (pp.activation > 20) {
        pp.activation = 0;
        room.setPlayerAvatar(p.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : "");
      }
    }
  };

  room.onRoomLink = (url) => {
    console.log(`Room link: ${url}`);
    console.log(`Admin Password: ${adminPass}`);
  };

  initChooser(room); // must be called at the end
  startVaazTimer();  
  startCumaCheckTimer();
  startPanel(3000);
};

roomBuilder();

// 🛠️ DEBUG: HER 2 SANİYEDE BİR OYUNCULARIN MEVKİLERİNİ CONSOLE'A YAZDIRIR
// setInterval(() => {
//   if (!room) return; // Oda henüz kurulmadıysa hata vermesin

//   const activePlayers = room.getPlayerList().filter(p => p.team === 1 || p.team === 2);
  
//   if (activePlayers.length > 0) {
//     console.log("=== 🔍 OYUNCU MEVKİ (P_POSITION) TESTİ ===");
//     activePlayers.forEach(p => {
//       try {
//         const pAug = toAug(p);
//         console.log(`👤 Oyuncu: ${p.name} | Forma: ${pAug.jerseyNumber || "YOK"} | Mevki: ${pAug.p_position || "BOŞ / TANIMSIZ ❌"}`);
//       } catch (e) {
//         // toAug bazen hızlı gir-çık yapanlarda hata verebilir, atlıyoruz
//       }
//     });
//     console.log("=========================================");
//   }
// }, 2000);