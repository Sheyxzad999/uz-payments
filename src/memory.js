/**
 * Xotirada saqlovchi oddiy storage — testlar va demo uchun.
 * Productionda oʻrniga oʻz bazangizni (PostgreSQL, MongoDB...) ulang.
 */
export function memoryStorage() {
  const map = new Map();
  return {
    async find(id) { return map.get(id) ?? null; },
    async create(tx) { map.set(tx.id, { ...tx }); },
    async update(id, patch) { map.set(id, { ...map.get(id), ...patch }); },
    async list(from, to) {
      return [...map.values()].filter((t) => t.time >= from && t.time <= to).sort((a, b) => a.time - b.time);
    },
    async findActiveByAccount(account) {
      const key = JSON.stringify(account);
      return [...map.values()].find((t) => t.state === 1 && JSON.stringify(t.account) === key) ?? null;
    },
  };
}
