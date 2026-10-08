import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const cfg = loadConfig();
const db = createPool(cfg.DATABASE_URL, 2);
migrate(db)
  .then((a) => {
    console.log(a.length ? `Uygulandı: ${a.join(', ')}` : 'Şema güncel.');
    return db.end();
  })
  .catch(async (e) => {
    console.error(e);
    await db.end();
    process.exit(1);
  });
