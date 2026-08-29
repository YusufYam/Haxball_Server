import { Game, room } from "../index";
import { boostToColor, setBallInvMassAndColor, getCalculatedInvMass } from "./teamplayBoost";
import { blendColorsInt } from "./utils";

const MAX_DRIBBLE_POWER = 100;

export const handleDribble = (game: Game) => {
  const ball = room.getDiscProperties(0);
  if (!ball || !game.inPlay) return;

  let closestPlayer: PlayerObject | null = null;
  let minDistance = Infinity;
  let closestRadius = 15; // 👈 DÜZELTME: En yakındaki oyuncunun boyutunu tutacağımız hafıza

  for (const p of room.getPlayerList()) {
    if (p.team === 0) continue; 
    const prop = room.getPlayerDiscProperties(p.id);
    if (!prop) continue;

    const dist = Math.sqrt((prop.x - ball.x) ** 2 + (prop.y - ball.y) ** 2);
    if (dist < minDistance) {
      minDistance = dist;
      closestPlayer = p;
      closestRadius = prop.radius; // 👈 DÜZELTME: Adamı buldukça boyutunu da kaydet!
    }
  }

  let powerChanged = false;

  // 🚨 HACI İŞTE SİHİRLİ SATIR BURASI 🚨
  // Sabit 25 yerine: Adamın Boyutu + Topun Boyutu + 2 Birimlik Temas Toleransı
  const ballRadius = ball.radius || 10;
  const dribbleThreshold = closestRadius + ballRadius + 2; 

  if (closestPlayer && minDistance < dribbleThreshold) { 
    if (game.dribblerId === closestPlayer.id) {
      const dynamicMax = Math.max(0, MAX_DRIBBLE_POWER - (game.boostCount * (MAX_DRIBBLE_POWER / 6)));
      
      if (game.boostCount < 6 && game.dribblePower < dynamicMax) {
        game.dribblePower = Math.min(game.dribblePower + 0.5, dynamicMax); 
        powerChanged = true;
      }
    } else {
      game.dribblerId = closestPlayer.id;
      game.dribblePower = 0;
      powerChanged = true;
    }
  } else {
    if (game.dribblerId !== null) {
      game.dribblerId = null;
      game.dribblePower = 0;
      powerChanged = true;
    }
  }

  if (game.dribblePower > 0 && game.dribblerId !== null) {
    const dribbler = room.getPlayer(game.dribblerId);
    if (dribbler) {
      const baseColor = boostToColor(game.boostCount, dribbler.team);
      const targetColor = boostToColor(6, dribbler.team); 
      
      const dynamicMax = Math.max(0, MAX_DRIBBLE_POWER - (game.boostCount * (MAX_DRIBBLE_POWER / 6)));
      
      const ratio = dynamicMax > 0 ? (game.dribblePower / dynamicMax) : 1;
      
      const newColor = blendColorsInt(baseColor, targetColor, ratio * 100);
      
      const virtualBoostCount = game.boostCount + (ratio * (6 - game.boostCount));
      const currentInvMass = getCalculatedInvMass(virtualBoostCount);
      
      room.setDiscProperties(0, { color: newColor, invMass: currentInvMass });
    }
  } else if (powerChanged) {
    setBallInvMassAndColor(game, game.lastKick?.team);
  }
};