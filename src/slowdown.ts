import { PlayerAugmented, room, toAug } from "../index";

export const applySlowdown = () => {
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      const pAug = toAug(p);
      
      if (new Date().getTime() > pAug.slowdownUntil) {
        if (pAug.slowdown) {
          pAug.slowdown = 0;
          // Yavaşlama bittiğinde avatarı sıfırlamak yerine numarayı geri getir
          room.setPlayerAvatar(p.id, pAug.jerseyNumber !== undefined ? pAug.jerseyNumber.toString() : "");
          room.setPlayerDiscProperties(p.id, { xgravity: 0, ygravity: 0 });
        }
        return;
      }
      
      const props = room.getPlayerDiscProperties(p.id);
      // BUG FİX: Sadece null veya undefined ise iptal et. 0 olma durumunda çalışmaya devam etsin!
      if (!props || props.xspeed === undefined || props.yspeed === undefined) {
        return;
      }
      
      room.setPlayerDiscProperties(p.id, {
        xgravity: -props.xspeed * pAug.slowdown,
        ygravity: -props.yspeed * pAug.slowdown,
      });
    });
};