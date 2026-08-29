import { room, PlayerAugmented } from "../index";
import { blendColorsInt } from "./utils";

const percentage = (elo: number) => 1 / (1 + Math.E ** -((elo - 12) / 100));

export const sendMessage = (
  msg: string,
  p?: PlayerAugmented | PlayerObject | null,
  color?: number,
  style?: string,
  sound?: number
) => {
  if (p) {
    // Eğer özel bir renk/stil verilmişse onu kullanır, verilmemişse senin eski varsayılan ayarlarını (0xd6cedb) kullanır
    room.sendAnnouncement(`[DM] ${msg}`, p.id, color ?? 0xd6cedb, style ?? "small", sound ?? 2);
  } else {
    room.sendAnnouncement(`[Server] ${msg}`, undefined, color ?? 0xd6cedb, style ?? "small", sound ?? 0);
  }
};

export const playerMessage = async (p: PlayerAugmented, msg: string) => {
  if (p.afk) {
    sendMessage(`Klavye başında değilsiniz. Geri dönmek için "!back" yazın.`, p);
  }
  const card = p.cardsAnnounced < 1 ? `` : p.cardsAnnounced < 2 ? `🟨 ` : `🟥 `;
  room.sendAnnouncement(
    `XP:${p.elo} | ${card}${p.name.replace(/^\[\d{4}\]\s/, "")}: ${msg}`,
    undefined,
    blendColorsInt(0x636363, 0xfff7f2, percentage(p.elo) * 100),
    "normal",
    1,
  );
};
