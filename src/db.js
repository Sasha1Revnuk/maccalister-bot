const Database = require('better-sqlite3');
const db = new Database('bot.db');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_login TEXT NOT NULL,
    amount INTEGER NOT NULL,
    label TEXT NOT NULL,
    type TEXT DEFAULT 'expense',
    closed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    reward INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_contract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    started_by TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
  );

  CREATE TABLE IF NOT EXISTS active_contract_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    active_contract_id INTEGER NOT NULL,
    user_login TEXT NOT NULL,
    FOREIGN KEY (active_contract_id) REFERENCES active_contract(id),
    FOREIGN KEY (user_login) REFERENCES users(login) ON DELETE CASCADE
  );
`);

// --- Users ---
function upsertUser(login, name) {
  const existing = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!existing) {
    db.prepare('INSERT INTO users (login, name) VALUES (?, ?)').run(login, name);
    return 'added';
  }
  if (existing.name !== name) {
    db.prepare('UPDATE users SET name = ? WHERE login = ?').run(name, login);
    return 'updated';
  }
  return 'exists';
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users').all();
}

// --- Records ---
function createWeeklyRecords(amount, label) {
  const users = getAllUsers();
  const insert = db.prepare('INSERT INTO records (user_login, amount, label, type) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((users) => {
    for (const user of users) insert.run(user.login, amount, label, 'expense');
  });
  insertMany(users);
  return users.length;
}

function getAllBalance() {
  const users = db.prepare(`
    SELECT u.login, u.name
    FROM users u
    WHERE EXISTS (
      SELECT 1 FROM records r WHERE r.user_login = u.login AND r.closed = 0
    )
  `).all();

  return users.map(u => ({
    ...u,
    records: db.prepare(`
      SELECT * FROM records WHERE user_login = ? AND closed = 0 ORDER BY created_at DESC
    `).all(u.login),
    total: db.prepare(`
      SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) as total
      FROM records WHERE user_login = ? AND closed = 0
    `).get(u.login)?.total ?? 0,
  }));
}

function getOpenExpenses(login) {
  return db.prepare(`
    SELECT * FROM records
    WHERE user_login = ? AND closed = 0 AND type = 'expense'
    ORDER BY amount ASC
  `).all(login);
}

function getOpenIncomes(login) {
  return db.prepare(`
    SELECT * FROM records
    WHERE user_login = ? AND closed = 0 AND type = 'income'
    ORDER BY amount ASC
  `).all(login);
}

function getRecordsByLogin(login) {
  return getOpenExpenses(login);
}

function insertRecord(login, amount, label, type) {
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user) {
    console.error(`❌ insertRecord: юзер ${login} не знайдений в БД`);
    return null;
  }
  return db.prepare('INSERT INTO records (user_login, amount, label, type) VALUES (?, ?, ?, ?)').run(login, amount, label, type);
}

function addRecord(login, amount, label, type = 'expense') {
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user) {
    console.error(`❌ addRecord: юзер ${login} не знайдений в БД`);
    return { netted: [], remaining: amount };
  }

  const oppositeRecords = type === 'income' ? getOpenExpenses(login) : getOpenIncomes(login);

  if (!oppositeRecords.length) {
    insertRecord(login, amount, label, type);
    return { netted: [], remaining: amount };
  }

  let remaining = amount;
  const netted = [];

  for (const record of oppositeRecords) {
    if (remaining <= 0) break;

    if (remaining >= record.amount) {
      db.prepare('UPDATE records SET closed = 1 WHERE id = ?').run(record.id);
      netted.push({
        id: record.id,
        label: record.label,
        originalAmount: record.amount,
        amount: record.amount,
        created_at: record.created_at,
        fullyPaid: true,
      });
      remaining -= record.amount;
    } else {
      db.prepare('UPDATE records SET closed = 1 WHERE id = ?').run(record.id);
      const leftover = record.amount - remaining;
      insertRecord(login, leftover, record.label, record.type);
      netted.push({
        id: record.id,
        label: record.label,
        originalAmount: record.amount,
        amount: record.amount,
        created_at: record.created_at,
        paid: remaining,
        leftover,
        fullyPaid: false,
      });
      remaining = 0;
    }
  }

  const inserted = insertRecord(login, amount, label, type);
  db.prepare('UPDATE records SET closed = 1 WHERE id = ?').run(inserted.lastInsertRowid);

  if (remaining > 0) {
    insertRecord(login, remaining, label, type);
  }

  return { netted, remaining };
}

function closeRecords(ids) {
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE records SET closed = 1 WHERE id IN (${placeholders})`).run(...ids);
}

function partialCloseRecord(id, paid, login, label) {
  const record = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!record) {
    console.error(`❌ partialCloseRecord: запис ${id} не знайдено`);
    return;
  }
  const remaining = record.amount - paid;
  db.prepare('UPDATE records SET closed = 1 WHERE id = ?').run(id);
  insertRecord(login, remaining, label, 'expense');
}

// --- Contracts ---
function getAllContracts() {
  return db.prepare('SELECT * FROM contracts ORDER BY name ASC').all();
}

function getContractById(id) {
  return db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
}

function addContract(name, reward) {
  return db.prepare('INSERT INTO contracts (name, reward) VALUES (?, ?)').run(name, reward);
}

function updateContract(id, name, reward) {
  db.prepare('UPDATE contracts SET name = ?, reward = ? WHERE id = ?').run(name, reward, id);
}

function deleteContract(id) {
  db.prepare('DELETE FROM contracts WHERE id = ?').run(id);
}

// --- Active Contract ---
function getActiveContract() {
  return db.prepare(`
    SELECT ac.*, c.name, c.reward
    FROM active_contract ac
    JOIN contracts c ON c.id = ac.contract_id
    LIMIT 1
  `).get();
}

function startContract(contractId, startedBy) {
  return db.prepare('INSERT INTO active_contract (contract_id, started_by) VALUES (?, ?)').run(contractId, startedBy);
}

function closeActiveContract(id) {
  db.prepare('DELETE FROM active_contract_members WHERE active_contract_id = ?').run(id);
  db.prepare('DELETE FROM active_contract WHERE id = ?').run(id);
}

// --- Active Contract Members ---
function getActiveContractMembers(activeContractId) {
  return db.prepare(`
    SELECT acm.*, u.name
    FROM active_contract_members acm
    JOIN users u ON u.login = acm.user_login
    WHERE acm.active_contract_id = ?
  `).all(activeContractId);
}

function joinContract(activeContractId, userLogin) {
  const existing = db.prepare(
    'SELECT * FROM active_contract_members WHERE active_contract_id = ? AND user_login = ?'
  ).get(activeContractId, userLogin);
  if (existing) return 'already';
  db.prepare('INSERT INTO active_contract_members (active_contract_id, user_login) VALUES (?, ?)').run(activeContractId, userLogin);
  return 'joined';
}

function removeMemberFromContract(activeContractId, userLogin) {
  db.prepare('DELETE FROM active_contract_members WHERE active_contract_id = ? AND user_login = ?').run(activeContractId, userLogin);
}

module.exports = {
  db,
  upsertUser, getAllUsers,
  createWeeklyRecords, getAllBalance, getRecordsByLogin,
  getOpenExpenses, getOpenIncomes,
  addRecord, insertRecord, closeRecords, partialCloseRecord,
  getAllContracts, getContractById, addContract, updateContract, deleteContract,
  getActiveContract, startContract, closeActiveContract,
  getActiveContractMembers, joinContract, removeMemberFromContract,
};