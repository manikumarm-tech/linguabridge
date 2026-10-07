import { readFileSync } from 'node:fs';
import { pool } from './db.js';

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  migrate().then(() => { console.log('migrated'); return pool.end(); });
}
