import { readFileSync } from 'node:fs';
import { pool } from './db.js';

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  // one migration at a time, even if two server processes start together (deploy overlap, dev restarts)
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7262001)');
    await client.query(sql);
  } finally {
    await client.query('SELECT pg_advisory_unlock(7262001)').catch(() => {});
    client.release();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  migrate().then(() => { console.log('migrated'); return pool.end(); });
}
