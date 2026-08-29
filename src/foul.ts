import { Game, room, PlayerAugmented, toAug, players } from "../index";
import { defaults, box, mapBounds } from "./settings";
import { sendMessage } from "./message";

export const isPenalty = (victim: PlayerAugmented) => {
  const positiveX = Math.abs(victim.fouledAt.x);
  const isYInRange = Math.abs(victim.fouledAt.y) <= box.y;
  const boxSide = victim.team == 1 ? 1 : -1;
  const isInBox =
    positiveX >= box.x &&
    positiveX <= mapBounds.x &&
    Math.sign(victim.fouledAt.x) === boxSide;
  const result = isYInRange && isInBox;
  return result;
};

export const checkFoul = async () => {
  room
    .getPlayerList()
    .filter((p) => p.team != 0 && toAug(p).sliding)
    .forEach((p) => {
      // 👇 YENİ: Oyuncunun ve topun o anki güncel (dinamik) fiziklerini alıyoruz
      const pProps = room.getPlayerDiscProperties(p.id);
      if (!pProps) return;
      
      const ballProps = room.getDiscProperties(0);
      if (!ballProps) return;

      const distToBall = Math.sqrt(
        (pProps.x - ballProps.x) ** 2 + (pProps.y - ballProps.y) ** 2,
      );
      
      // 🚨 1. DÜZELTME: Topa olan temiz müdahaleyi dinamik boyutla hesaplıyoruz
      // Toleransı 1.5 yaptık ki motor topu sektirmeden önce yakalayalım.
      if (distToBall < pProps.radius + ballProps.radius + 1.5) {
        toAug(p).sliding = false;
        return;
      }
      
      const enemyTeam = p.team == 1 ? 2 : 1;
      room
        .getPlayerList()
        .filter((pp) => pp.team == enemyTeam)
        .forEach((enemy) => {
          const enemyProps = room.getPlayerDiscProperties(enemy.id);
          if (!enemyProps) return;
          
          const dist = Math.sqrt(
            (pProps.x - enemyProps.x) ** 2 +
              (pProps.y - enemyProps.y) ** 2,
          );
          
          // 🚨 2. DÜZELTME: Rakibe faul yapılma durumunu dinamik boyutlarla hesaplıyoruz
          // Eski koddaki (defaults.playerRadius * 2 + 0.1) sınırını kaldırıp gerçek değerleri aldık!
          if (dist < pProps.radius + enemyProps.radius + 1.5) {
            handleSlide(toAug(p), toAug(enemy));
          }
        });
    });
};

const handleSlide = (slider: PlayerAugmented, victim: PlayerAugmented) => {
  if (victim.slowdown) {
    return;
  }
  slider.sliding = false;
  const sliderProps = room.getPlayerDiscProperties(slider.id);
  const victimProps = room.getPlayerDiscProperties(victim.id);
  const ballPos = room.getBallPosition();
  const ballDist = Math.sqrt(
    (slider.position.x - ballPos.x) ** 2 + (slider.position.y - ballPos.y) ** 2,
  );
  let cardsFactor = 0.7;
  if (ballDist > 300) {
    cardsFactor += 1; // flagrant foul
    sendMessage(`${slider.name} Tarafından Foul Yapıldı.`);
  }
  victim.fouledAt = { x: victimProps.x, y: victimProps.y };
  if (isPenalty(victim)) {
    cardsFactor += 0.3;
  }
  const power = Math.max(
    Math.sqrt(sliderProps.xspeed ** 2 + sliderProps.yspeed ** 2) * 0.6,
    0.7,
  );
  const slowdown = power > 2.9 ? 0.045 * power : 0.032 * power;
  const av = power > 2.7 ? "❌" : "🩹";
  room.setPlayerAvatar(victim.id, av);
  victim.slowdown = slowdown;
  victim.slowdownUntil =
    new Date().getTime() +
    1000 * (5 ** power * (0.5 + 0.5 * Math.random() * Math.random()));
  victim.canCallFoulUntil = new Date().getTime() + 4000;
  sendMessage(
    "Free Kick Kullanmak İçin X'e Basılı Tutunuz.",
    victim,
  );
  slider.foulsMeter += 0.7 * power * cardsFactor * (Math.random() * 0.2 + 0.9);
};

export const announceCards = (game: Game) => {
  players
    .filter((p) => p.team != 0)
    .forEach((p) => {
      if (p.foulsMeter > p.cardsAnnounced) {
        if (p.foulsMeter > 1 && p.foulsMeter < 2) {
          room.setPlayerAvatar(p.id, "🟨");
          sendMessage("🟨 Sarı Kart: " + p.name);
        } else if (p.foulsMeter >= 2) {
          room.setPlayerAvatar(p.id, "🟥");
          room.setPlayerTeam(p.id, 0);
          sendMessage("🟥 Kırmızı Kart:" + p.name);
        }
        p.cardsAnnounced = p.foulsMeter;
      }
    });
};
