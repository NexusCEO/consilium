-- Un appareil abonné (adresse de notification fournie par le navigateur).
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,          -- empreinte SHA-256 de l'adresse
  endpoint TEXT NOT NULL,
  updated_at INTEGER NOT NULL   -- dernière synchronisation (ms)
);

-- Uniquement des heures : aucun titre, lieu ou détail de rendez-vous.
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  fire_at INTEGER NOT NULL      -- heure du rappel (ms)
);

CREATE INDEX IF NOT EXISTS reminders_fire_at ON reminders (fire_at);
CREATE INDEX IF NOT EXISTS reminders_subscription ON reminders (subscription_id);
