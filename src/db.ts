import { AsyncDatabase as Database } from "promised-sqlite3";
import { game, PlayerAugmented } from "..";

export let db: any;

const createTables = async (db: any) => {
  const createStatements = [
    `CREATE TABLE IF NOT EXISTS "players" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "auth" TEXT NOT NULL,
        "name" TEXT,
        "elo" INTEGER
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS auth ON players(auth);`,
    
    // 🕌 Cuma Namazı Ban Tablosu
    `CREATE TABLE IF NOT EXISTS "cuma_ban" (
        "id" INTEGER PRIMARY KEY CHECK (id = 1),
        "banned_until" INTEGER NOT NULL
    );`,

    // 🤬 Katlamalı Oyuncu Ban Tablosu
    `CREATE TABLE IF NOT EXISTS "player_bans" (
        "auth" TEXT PRIMARY KEY,
        "name" TEXT,
        "reason" TEXT,
        "banned_until" INTEGER NOT NULL,
        "ban_level" INTEGER DEFAULT 1,
        "last_ban_time" INTEGER DEFAULT 0
    );`
  ];

  for (const t of createStatements) {
    await db.run(t);
  }

  // 🛠️ Eski veritabanı dosyaları için otomatik sütun ekleme (Migrasyon)
  try {
    await db.run(`ALTER TABLE "player_bans" ADD COLUMN "ban_level" INTEGER DEFAULT 1;`);
  } catch (e) { /* Sütun zaten varsa hata vermesini engelle */ }

  try {
    await db.run(`ALTER TABLE "player_bans" ADD COLUMN "last_ban_time" INTEGER DEFAULT 0;`);
  } catch (e) { /* Sütun zaten varsa hata vermesini engelle */ }
};

export const initDb = async () => {
  db = await Database.open("db.sqlite");
  try {
    console.log("Creating DB...");
    await createTables(db);
  } catch (e) {
    console.log("\nDB tables already created.");
  }
  return db;
};

interface ReadPlayer {
  elo: number;
}

export const getOrCreatePlayer = async (
  p: { auth: string; name: string }
): Promise<ReadPlayer> => {
  const auth = p.auth;
  const playerInDb = await db.get("SELECT elo FROM players WHERE auth=?", [
    auth,
  ]);
  if (!playerInDb) {
    await db.run("INSERT INTO players(auth, name, elo) VALUES (?, ?, ?)", [
      p.auth,
      p.name,
      12,
    ]);
    const newPlayer = { elo: 12 };
    return newPlayer;
  }
  return playerInDb;
};