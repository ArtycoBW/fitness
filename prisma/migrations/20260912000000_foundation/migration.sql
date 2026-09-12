CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE "ClubSettings" (
 "id" TEXT PRIMARY KEY DEFAULT 'club', "name" TEXT NOT NULL DEFAULT 'Страйд',
 "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow', "currency" TEXT NOT NULL DEFAULT 'RUB',
 "settings" JSONB NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "ClubSettings" ("id") VALUES ('club');
