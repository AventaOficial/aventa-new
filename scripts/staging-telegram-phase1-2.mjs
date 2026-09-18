import {
  loadEnvLocal,
  assertStagingTarget,
  tokenMeta,
  telegramGetMe,
  telegramGetUpdates,
} from './staging-telegram-provision.mjs';

const env = loadEnvLocal();
const target = assertStagingTarget(env);
const token = env.TELEGRAM_BOT_TOKEN_STAGING || '';
const meta = tokenMeta(token);

console.log('TARGET = STAGING');
console.log('PROJECT_REF =', target.ref);
console.log('PRODUCTION_REF = mkgsrpsuvedwwlzmzmzh');
console.log('PRODUCTION_WRITES = 0');
console.log(
  'DISTRIBUTION_ENGINE_ENABLED =',
  env.DISTRIBUTION_ENGINE_ENABLED || 'false (unset)',
);
console.log(JSON.stringify({ preflight_ok: target.ok, token: meta }, null, 2));

if (!target.ok) {
  console.error('ABORT: staging target mismatch');
  process.exit(2);
}
if (!meta.present) {
  console.error('ABORT: TELEGRAM_BOT_TOKEN_STAGING missing');
  process.exit(2);
}
if (!meta.formatOk) {
  console.error('ABORT: token format invalid (expected digits:secret)');
  console.error(JSON.stringify({ token_meta: meta }, null, 2));
  process.exit(2);
}

const me = await telegramGetMe(token);
if (!me.json?.ok) {
  console.error(
    JSON.stringify(
      {
        api_accessible: false,
        httpStatus: me.httpStatus,
        description: me.json?.description || null,
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const bot = me.json.result || {};
console.log(
  JSON.stringify(
    {
      token_present: true,
      api_accessible: true,
      bot_id: bot.id ?? null,
      bot_username: bot.username ?? null,
      bot_is_bot: bot.is_bot ?? null,
    },
    null,
    2,
  ),
);

const updates = await telegramGetUpdates(token);
const results = Array.isArray(updates.json?.result) ? updates.json.result : [];
const chats = [];
for (const u of results) {
  const msg = u.channel_post || u.message || u.my_chat_member?.chat || null;
  const chat = msg?.chat || u.my_chat_member?.chat || null;
  if (chat?.id != null) {
    chats.push({
      id: chat.id,
      type: chat.type,
      title: chat.title || null,
      username: chat.username || null,
      update_type: u.channel_post
        ? 'channel_post'
        : u.my_chat_member
          ? 'my_chat_member'
          : 'message',
    });
  }
}

// dedupe by id
const seen = new Set();
const unique = [];
for (const c of chats) {
  const key = String(c.id);
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(c);
}

console.log(
  JSON.stringify(
    {
      updates_ok: Boolean(updates.json?.ok),
      updates_count: results.length,
      discovered_chats: unique,
      needs_manual:
        unique.filter((c) => c.type === 'channel' || c.type === 'supergroup').length === 0,
    },
    null,
    2,
  ),
);
