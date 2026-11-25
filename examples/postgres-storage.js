// Payme tranzaksiyalari uchun PostgreSQL storage (npm i pg)
//
// CREATE TABLE payme_transactions (
//   id            text PRIMARY KEY,
//   transaction   text NOT NULL,
//   time          bigint NOT NULL,
//   amount        bigint NOT NULL,
//   account       jsonb NOT NULL,
//   create_time   bigint NOT NULL,
//   perform_time  bigint,
//   cancel_time   bigint,
//   state         smallint NOT NULL,
//   reason        smallint
// );
import pg from 'pg';

const pool = new pg.Pool();
const COLS = ['transaction', 'time', 'amount', 'account', 'create_time', 'perform_time', 'cancel_time', 'state', 'reason'];
const ALLOWED = new Set(COLS);
const num = (v) => (v == null ? v : Number(v));
const row = (r) => r && {
  ...r,
  time: num(r.time), amount: num(r.amount), create_time: num(r.create_time),
  perform_time: num(r.perform_time), cancel_time: num(r.cancel_time),
};

export const paymeStorage = {
  async find(id) {
    const { rows } = await pool.query('SELECT * FROM payme_transactions WHERE id = $1', [id]);
    return row(rows[0]) ?? null;
  },
  async create(tx) {
    const placeholders = COLS.map((_, i) => '$' + (i + 2)).join(', ');
    await pool.query(
      `INSERT INTO payme_transactions (id, ${COLS.join(', ')}) VALUES ($1, ${placeholders})`,
      [tx.id, ...COLS.map((c) => tx[c] ?? null)],
    );
  },
  async update(id, patch) {
    const keys = Object.keys(patch).filter((k) => ALLOWED.has(k));
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE payme_transactions SET ${set} WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
  },
  async list(from, to) {
    const { rows } = await pool.query(
      'SELECT * FROM payme_transactions WHERE time BETWEEN $1 AND $2 ORDER BY time', [from, to],
    );
    return rows.map(row);
  },
  async findActiveByAccount(account) {
    const { rows } = await pool.query(
      'SELECT * FROM payme_transactions WHERE state = 1 AND account = $1 LIMIT 1', [account],
    );
    return row(rows[0]) ?? null;
  },
};
