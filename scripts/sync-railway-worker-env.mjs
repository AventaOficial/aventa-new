import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const envText = fs.readFileSync('.env.vercel.cron', 'utf8');
const env = {};
for (const line of envText.split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const secret = env.CRON_SECRET;
if (!secret) {
  console.error('NO_CRON_SECRET');
  process.exit(1);
}

const pairs = {
  AVENTA_CRON_SECRET: secret,
  AVENTA_INGEST_ENDPOINT: 'https://aventaofertas.com/api/cron/bot-ingest-candidates',
  WORKER_ML_SEEDS:
    'https://www.mercadolibre.com.mx/ofertas#nav-header,https://www.mercadolibre.com.mx/ofertas?container_id=MLM779363-1&promotion_type=lightning',
  WORKER_MAX_ITEMS: '12',
  WORKER_MIN_DISCOUNT_PERCENT: '15',
  WORKER_HEADLESS: '1',
  WORKER_PROFILE: 'standard',
  WORKER_TIMEOUT_MS: '45000',
};

function set(key, value) {
  const r = spawnSync(
    'npx',
    ['--yes', '@railway/cli', 'variable', 'set', key, '--stdin', '--service', 'aventa-new', '--skip-deploys', '--json'],
    { encoding: 'utf8', shell: true, input: value }
  );
  console.log(key, r.status === 0 ? 'OK' : 'FAIL');
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || '').slice(0, 400));
  }
}

for (const [k, v] of Object.entries(pairs)) set(k, v);
