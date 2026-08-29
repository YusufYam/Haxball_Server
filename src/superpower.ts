import { toAug, room, players, PlayerAugmented, Game, game } from "../index";
import { sendMessage } from "./message";
import { freeKick, penalty } from "./out";
import { handleLastTouch } from "./offside";
import { defaults, mapBounds } from "./settings";
import { sleep } from "./utils";
import { isPenalty } from "./foul";
import config from "../config"; // 👈 Fizikleri okumak için ekledik
import { activeTactics, updatePlayerPositionName } from "./match/formation"; // 👈 Taktikleri ve isimlendirme fonksiyonunu import ediyoruz
import { isDraftMapActive, isDizilisPhase } from "./draft/draftLock";

export const enforcePhysicsLock = () => {
  // Önceki koyduğumuz "if (game && !game.inPlay) return;" kilidini buradan sildik!
  // Çünkü oyun dursa bile oyuncu boyutlarının anında değişmesini istiyoruz.

  players
    .filter((p) => p.team != 0)
    .forEach((pp) => {
      const props = room.getPlayerDiscProperties(pp.id);
      if (!props) return;

      if (isDraftMapActive) {
        let newProps: any = {};
        let needsUpdate = false;
        
        if (Math.abs(props.radius - 15) > 0.01) { newProps.radius = 15; needsUpdate = true; }
        if (Math.abs(props.invMass - 1) > 0.01) { newProps.invMass = 1; needsUpdate = true; }
        
        if (needsUpdate) {
          room.setPlayerDiscProperties(pp.id, newProps);
        }
        return; 
      }

      const currentTactic = activeTactics[pp.team as 1 | 2] || "4-3-3";
      updatePlayerPositionName(pp, currentTactic);

      let targetPhysics = config.PHYSICS.DEF;
      if (pp.p_position === 'Kaleci') targetPhysics = config.PHYSICS.GK;
      else if (pp.p_position === 'Defans') targetPhysics = config.PHYSICS.DEF;
      else if (pp.p_position === 'Orta Saha') targetPhysics = config.PHYSICS.MID;
      else if (pp.p_position === 'Forvet' || pp.p_position === 'Forvet Arkası / Kanat') targetPhysics = config.PHYSICS.FWD;

      let newProps: any = {};
      let needsUpdate = false;

      // 🚨 1. KISIM: BOYUT (Radius) HER ZAMAN GÜNCELLENİR
      // Gol yendikten sonra oyun dursa bile admin mevki değiştiğinde boyutu anında şişer/küçülür.
      if (Math.abs(props.radius - targetPhysics.radius) > 0.01) { 
        newProps.radius = targetPhysics.radius; 
        needsUpdate = true; 
      }

      // 🚨 2. KISIM: AĞIRLIK (invMass) SADECE OYUN AKIYORKEN GÜNCELLENİR
      // Duran top veya santra durumlarında ağırlığı ellemeyiz ki "duvar olma" taktiğin bozulmasın!
      if (!game || game.inPlay) {
        if (Math.abs(props.invMass - targetPhysics.invMass) > 0.01) { 
          newProps.invMass = targetPhysics.invMass; 
          needsUpdate = true; 
        }
      }

      if (needsUpdate) {
        room.setPlayerDiscProperties(pp.id, newProps);
      }
    });
};
export const checkAllX = (game: Game) => {
  players
    .filter((p) => p.team != 0)
    .forEach((pp) => {
      const props = room.getPlayerDiscProperties(pp.id);
      if (!props) {
        return;
      }
      
     if (props.damping == defaults.kickingDamping) {
          pp.activation+=6;
        if (
          new Date().getTime() < pp.canCallFoulUntil &&
          pp.activation > 20 &&
          Math.abs(pp.fouledAt.x) < mapBounds.x
        ) {
          if (!game.inPlay) {
            return
          }
          sendMessage(`${pp.name} foul istedi.`);
          if (isPenalty(pp)) {
            penalty(game, pp.team, { ...pp.fouledAt });
            pp.activation = 0;
            pp.canCallFoulUntil = 0;
            return;
          }
          freeKick(game, pp.team, pp.fouledAt);
          pp.activation = 0;
          pp.canCallFoulUntil = 0;
          return;
        }
        if (pp.slowdown && new Date().getTime() > pp.canCallFoulUntil) {
          pp.activation = 0;
          return;
        }
        if (pp.activation > 20 && pp.activation < 60) {
          room.setPlayerAvatar(pp.id, "👟");
        } else if (pp.activation >= 60 && pp.activation < 100) {
          room.setPlayerAvatar(pp.id, "💨");
        } else if (pp.activation >= 100) {
          room.setPlayerAvatar(pp.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : "");
        }
      } else if (pp.activation > 20 && pp.activation < 60) {
        pp.activation = 0;
        if (!game.inPlay) {
          room.setPlayerAvatar(pp.id, "🚫");
          setTimeout(() => room.setPlayerAvatar(pp.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : ""), 200);
          return
        }
        slide(game, pp);
      } else if (pp.activation >= 60 && pp.activation < 100) {
        pp.activation = 0;
        if (!game.inPlay) {
          room.setPlayerAvatar(pp.id, "🚫");
          setTimeout(() => room.setPlayerAvatar(pp.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : ""), 200);
          return;
        }
        if (pp.cooldownUntil > new Date().getTime()) {
          sendMessage(
            `Bekleme Süresi: ${Math.ceil((pp.cooldownUntil - new Date().getTime()) / 1000)}s.`,
            pp,
          );
          pp.activation = 0;
          room.setPlayerAvatar(pp.id, "🚫");
          setTimeout(() => room.setPlayerAvatar(pp.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : ""), 200);
          return;
        }
        sprint(game, pp);
        room.setPlayerAvatar(pp.id, "💨");
        setTimeout(() => room.setPlayerAvatar(pp.id, pp.jerseyNumber !== undefined ? pp.jerseyNumber.toString() : ""), 700);
        pp.cooldownUntil = new Date().getTime() + 18000;
        if (process.env.DEBUG) {
          pp.cooldownUntil = new Date().getTime() + 3000;
        }
      } else {
        pp.activation = 0;
      }
    });
};

export const sprint = (game: Game, p: PlayerAugmented) => {
  if (p.slowdown) return;
  const props = room.getPlayerDiscProperties(p.id);
  const magnitude = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2);
  if (magnitude === 0) return;
  const vecX = props.xspeed / magnitude;
  const vecY = props.yspeed / magnitude;
  
  let sprintPower = 0.18; 
  if (p.p_position === 'Kaleci') sprintPower = 0.12;
  else if (p.p_position === 'Defans') sprintPower = 0.15;
  else if (p.p_position === 'Orta Saha') sprintPower = 0.18;
  else if (p.p_position === 'Forvet' || p.p_position === 'Forvet Arkası / Kanat') sprintPower = 0.22;

  room.setPlayerDiscProperties(p.id, {
    xgravity: vecX * sprintPower, 
    ygravity: vecY * sprintPower,
  });
  
  setTimeout(() => room.setPlayerDiscProperties(p.id, { xgravity: 0, ygravity: 0 }), 1000);
};

const slide = async (game: Game, p: PlayerAugmented) => {
  if (p.slowdown) return;
  if (game.animation) {
    room.setPlayerAvatar(p.id, p.jerseyNumber !== undefined ? p.jerseyNumber.toString() : "");
    return;
  }
  const props = room.getPlayerDiscProperties(p.id);
  if (p.cooldownUntil > new Date().getTime()) {
    sendMessage(
      `Bekleme Süresi: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}s`,
      p,
    );
    p.activation = 0;
    room.setPlayerAvatar(p.id, "🚫");
    setTimeout(() => room.setPlayerAvatar(p.id, p.jerseyNumber !== undefined ? p.jerseyNumber.toString() : ""), 200);
    return;
  }
  
  let slideMultiplier = 3.4; 
  if (p.p_position === 'Kaleci') slideMultiplier = 2.6;
  else if (p.p_position === 'Defans') slideMultiplier = 3.1;
  else if (p.p_position === 'Orta Saha') slideMultiplier = 3.4;
  else if (p.p_position === 'Forvet' || p.p_position === 'Forvet Arkası / Kanat') slideMultiplier = 4.0;

  room.setPlayerDiscProperties(p.id, {
    xspeed: props.xspeed * slideMultiplier,
    yspeed: props.yspeed * slideMultiplier,
    xgravity: -props.xspeed * 0.026,
    ygravity: -props.yspeed * 0.026,
  });
  room.setPlayerAvatar(p.id, "👟");
  p.cooldownUntil = new Date().getTime() + 23000;
  if (process.env.DEBUG) {
    p.cooldownUntil = new Date().getTime() + 3000;
  }
  p.sliding = true;
  await sleep(900);
  p.sliding = false;
  p.slowdown = 0.13;
  p.slowdownUntil = new Date().getTime() + 1000 * 3;
  room.setPlayerAvatar(p.id, p.jerseyNumber !== undefined ? p.jerseyNumber.toString() : "");
};

export const rotateBall = (game: Game) => {
  if (game.ballRotation.power < 0.02) {
    game.ballRotation.power = 0;
    room.setDiscProperties(0, {
      xgravity: 0,
      ygravity: 0,
    });
    return;
  }
  room.setDiscProperties(0, {
    xgravity: 0.01 * game.ballRotation.x * game.ballRotation.power,
    ygravity: 0.01 * game.ballRotation.y * game.ballRotation.power,
  });
  game.ballRotation.power *= 0.735;
};