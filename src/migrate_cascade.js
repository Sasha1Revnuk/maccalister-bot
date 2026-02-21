// Запустити один раз на сервері: node migrate_cascade.js
const Database = require('better-sqlite3');
const db = new Database('bot.db');

db.pragma('foreign_keys = OFF');

db.exec(`
  -- records
  CREATE TABLE records_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_login TEXT NOT NULL,
    amount INTEGER NOT NULL,
    label TEXT NOT NULL,
    type TEXT DEFAULT 'expense',
    closed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
  );
  INSERT INTO records_new SELECT * FROM records;
  DROP TABLE records;
  ALTER TABLE records_new RENAME TO records;

  -- active_contract_members
  CREATE TABLE active_contract_members_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    active_contract_id INTEGER NOT NULL,
    user_login TEXT NOT NULL,
    FOREIGN KEY (active_contract_id) REFERENCES active_contract(id),
    FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
  );
  INSERT INTO active_contract_members_new SELECT * FROM active_contract_members;
  DROP TABLE active_contract_members;
  ALTER TABLE active_contract_members_new RENAME TO active_contract_members;
`);

db.pragma('foreign_keys = ON');
console.log('✅ Міграція завершена — ON DELETE CASCADE додано');