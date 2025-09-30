import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, dbQuery } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

const run = async () => {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, 'utf-8');
    if (!sql.trim()) continue;
    // Split by semicolon but simple approach: run entire script.
    await dbQuery(sql);
    console.log(`Applied migration: ${file}`);
  }
};

run()
  .then(() => {
    console.log('All migrations executed successfully');
    return pool.end();
  })
  .catch((error) => {
    console.error('Migration failed', error);
    return pool.end().then(() => process.exit(1));
  });
