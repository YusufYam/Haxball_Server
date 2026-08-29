import { room, Game } from "..";
import { sendMessage } from "./message";
import { defaults } from "./settings";
import { blendColorsInt } from "./utils";

// ==========================================
// 🛠️ GÜÇ VE FALSO AYAR MERKEZİ 🛠️
// ==========================================
export const CONFIG = {
  // Dribling şutunun hızını ayarlar. Paslaşma ile aynı hissi yakalamak için 0.20 ile 0.25 arası idealdir.
  KICK_POWER_MULTIPLIER: 0.05, 
  
  // Falsonun (kavisin) genel gücü. 1.0 normaldir. %50 daha fazla falso istersen 1.5 yapabilirsin.
  SPIN_POWER_MULTIPLIER: 1.0,  
};
// ==========================================

export const boostToCoef = (boostCount: number) =>
  (1 / (1 + Math.E ** -(boostCount * 0.4)) - 0.5) * 2;

// Kütle hesaplama formülünü dışarı açtık ki dribling de aynı matematiği kullansın
export const getCalculatedInvMass = (boostCount: number) => {
  const highStreakBonus = boostCount > 3 ? (boostCount - 3) * 0.20 : 0;
  return defaults.ballInvMass + boostToCoef(boostCount) * 0.9 + highStreakBonus;
};

// GÜNCELLEME: Objeyi değil, direkt boost sayısını alacak şekilde sadeleştirdik
export const boostToColor = (boostCount: number, team?: TeamID) =>
  blendColorsInt(
    0xffffff,
    team === 1 ? 0xd10000 : 0x0700d1,
    boostToCoef(boostCount) * 100,
  );

// GÜNCELLEME: Dışarıdan gelen sanal gücü (overrideBoost) hesaba katıyoruz
export const setBallInvMassAndColor = (game: Game, team?: TeamID, overrideBoost?: number) => {
  const activeBoost = overrideBoost !== undefined ? overrideBoost : game.boostCount;
  room.setDiscProperties(0, {
    color: boostToColor(activeBoost, team),
    invMass: getCalculatedInvMass(activeBoost), 
  });
};
// Renk geçişini başlatan fonksiyon
export const startColorTransition = (game: Game, fromColor: number, toColor: number) => {
  // Eğer pas sayısı 6 ise hiç geçiş yapmasın, renk sabit kalsın
  if (game.boostCount >= 6) {
    game.transitioningColor = false;
    return;
  }
  game.transitioningColor = true;
  game.colorTransitionProgress = 0; // 0'dan başlar
  game.startColor = fromColor;
  game.targetColor = toColor;
};
export const updateColorTransition = (game: Game) => {
  if (!game.transitioningColor) return;

  // Geçiş hızı (Bu değeri büyütürsen daha hızlı, küçültürsen daha yavaş/yumuşak akar. Örn: 0.05)
  game.colorTransitionProgress += 0.01; 

  if (game.colorTransitionProgress >= 1) {
    game.colorTransitionProgress = 1;
    game.transitioningColor = false; // Geçiş bitti
  }

  // İki renk arasında ara rengi hesapla
  const blended = blendColorsInt(game.startColor, game.targetColor, game.colorTransitionProgress * 100);
  
  const currentProps = room.getDiscProperties(0);
  if (currentProps) {
    room.setDiscProperties(0, { color: blended });
  }
};
// GÜNCELLEME: effectiveBoost parametresini ekledik
export const teamplayBoost = (game: Game, p: PlayerObject, effectiveBoost?: number) => {
  if (!game.lastKick || game.lastKick?.team === p.team) {
    game.boostCount += 1;
    const teamName = p.team == 1 ? "Red" : "Blue";
    const teamEmoji = p.team == 1 ? "🔴" : "🔵";
    if (game.boostCount >= 3) {
      sendMessage(`👏  ${teamEmoji}: ${game.boostCount} pas. (${p.name})`);
    }
    if (game.boostCount == 5) {
      sendMessage(`🔥   ${teamName} Takım ortalığın tozunu attırıyor.`);
    } else if (game.boostCount == 8) {
      sendMessage(`🔥🔥🔥    ${teamName} Takım inanılmaz!`);
    } else if (game.boostCount > 10) {
      sendMessage(`🚀🚀🚀    ${teamName} Takım efsane!`);
    }
  } else {
    game.boostCount = 0;
    game.transitioningColor = false; 
    resetTeamplayBoost(game);
  }
  game.lastKick = p;
  
  // Vuruş anındaki nihai gücü belirle: Normal pas mı, dribling şarjı mı?
  const finalBoost = effectiveBoost !== undefined ? Math.max(game.boostCount, effectiveBoost) : game.boostCount;
  
  setBallInvMassAndColor(game, p.team, finalBoost);
};

export const resetTeamplayBoost = (game: Game) => {
  game.ballRotation = { x: 0, y: 0, power: 0 };
  game.boostCount = 0;
  setBallInvMassAndColor(game);
};