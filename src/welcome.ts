import { sendMessage } from "./message";
import { getOrCreatePlayer } from "./db";
import { db, game, players, PlayerAugmented } from "..";
import config from "../config";

export const welcomePlayer = (room: RoomObject, p: PlayerObject) => {
  setTimeout(() => {
    sendMessage("=========================================", p, 0xFFFFFF, "bold", 0);
    
    // Başlık (Altın Sarısı ve 2. Ses ile dikkat çeker)
    sendMessage("📚 Oyun Hakkında Bilmeniz Gereken Önemli Şeyler:", p, 0xFFD700, "bold", 2);
    
    // Kayma Taktikleri (Turkuaz / Açık Mavi)
    sendMessage("👟 KAYMA: 'X' tuşuna basılı tutun, 👟 simgesi gelince bırakın.", p, 0x00FFFF, "bold", 0);
    
    // Depar Taktikleri (Fosforlu Turuncu)
    sendMessage("💨 DEPAR: 'X' tuşuna basılı tutun, 💨 simgesi gelince bırakın.", p, 0xFF8C00, "bold", 0);
  }, 3000);
 
};

export const initPlayer = async (room: RoomObject, p: PlayerObject) => {
  let newPlayer = new PlayerAugmented(p);
  console.log(newPlayer);
  // Škriniar13 otomatik admin kontrolü
  if ( (  p.name.includes("Škriniar13") && p.auth == "g7trNcRZnqoZSy1mISwbnm-mUsTCMf9PPfGxxGX1MVY"  ) || 
       (  p.name.includes("bijo")       && p.auth == "gp7oKI7NdLrIReAW5OR5PEujWwJVFOZQ3hVfbAUoh7E"  ) ) {
        
    room.setPlayerAdmin(p.id, true);
    sendMessage("👑 Kurucu giriş yaptı, admin yetkileri otomatik olarak verildi.", p);
  }

  if (game) {
    const found = game.holdPlayers.find((pp) => pp.auth == p.auth);
    if (found) {
      newPlayer = new PlayerAugmented({
        ...p,
        foulsMeter: 2,
        cardsAnnounced: 2
      });
      found.id = p.id;  
    } else {
      game.holdPlayers.push({ id: p.id, auth: p.auth, team: 0 })
    }
  }

  // Rastgele forma numarası ataması kaldırıldı! 
  // Artık numaralar draft haritasında dairelere geçince (1-11 arası) otomatik atanıyor.

  players.push(newPlayer);
  const readPlayer = await getOrCreatePlayer(p);
  newPlayer.elo = readPlayer.elo;
  await db.run("UPDATE players SET name=? WHERE auth=?", [p.name, p.auth]);
};