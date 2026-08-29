import { room, Game, toAug } from "..";
import { CONFIG } from "./teamplayBoost"; 

export const applyRotation = (game: Game, p: PlayerObject, overrideBoostCount?: number) => {
  const props = room.getPlayerDiscProperties(p.id);
  const spMagnitude = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2);
  if (spMagnitude === 0) return;
  
  const vecXsp = props.xspeed / spMagnitude;
  const vecYsp = props.yspeed / spMagnitude;

  const effectiveBoost = overrideBoostCount !== undefined ? overrideBoostCount : game.boostCount;
  const boostMultiplier = effectiveBoost > 3 ? 1 + ((effectiveBoost - 3) * 0.3) : 1.0;
  
  // 🎯 OYUNCUNUN BULUNDUĞU MEVKİ BLOKUNA GÖRE FALSO ÇARPANI
  let positionSpinMultiplier = 1.0;
  const pAug = toAug(p);
  
  if (pAug) {
    // 👇 YENİ SİSTEM: Doğrudan p_position'ı okuyoruz
    if (pAug.p_position === 'Kaleci' || pAug.p_position === 'Forvet' || pAug.p_position === 'Forvet Arkası / Kanat') {
      positionSpinMultiplier = 1.0; // Kaleci ve Forvetler -> Zirve falso (Eşit)
    } else if (pAug.p_position === 'Orta Saha') {
      positionSpinMultiplier = 0.8; // Orta Saha -> Orta falso
    } else if (pAug.p_position === 'Defans') {
      positionSpinMultiplier = 0.5; // Defans -> En az falso
    }
  }

  const finalSpinPower = (spMagnitude ** 0.5 * 8) * boostMultiplier * CONFIG.SPIN_POWER_MULTIPLIER * positionSpinMultiplier;
  
  game.ballRotation = {
    x: -vecXsp,
    y: -vecYsp,
    power: finalSpinPower, 
  };
  
  if (game.rotateNextKick) {
    const finalSuperSpinPower = (spMagnitude ** 0.5 * 15) * boostMultiplier * CONFIG.SPIN_POWER_MULTIPLIER * positionSpinMultiplier;
    game.ballRotation = {
      x: -vecXsp,
      y: -vecYsp,
      power: finalSuperSpinPower,
    };
  }
  game.rotateNextKick = false;
};