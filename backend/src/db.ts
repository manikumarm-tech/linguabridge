import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}
