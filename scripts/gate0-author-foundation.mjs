/**
 * Gate0 local authoring helper — NO remote writes.
 * Parses MCP agent-tools dumps and emits:
 * - tmp/gate0_prod_foundation_columns.json
 * - tmp/staging-prod-schema-diff.json
 * - docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TOOLS =
  'C:/Users/yanin/.cursor/projects/e-AVENTA-NEW-aventa-new/agent-tools';

function loadAgentJsonArray(filename) {
  const raw = fs.readFileSync(path.join(TOOLS, filename), 'utf8');
  let text = raw;
  try {
    const wrapped = JSON.parse(raw);
    if (wrapped && typeof wrapped.result === 'string') text = wrapped.result;
  } catch {
    /* plain text */
  }
  // Prefer JSON array between last open tag and matching close tag
  // (prose may mention the tag name before the payload).
  const openRe = /<untrusted-data-[0-9a-f-]+>/g;
  let openMatch;
  let lastOpen = null;
  while ((openMatch = openRe.exec(text)) !== null) lastOpen = openMatch;
  if (lastOpen) {
    const start = lastOpen.index + lastOpen[0].length;
    const closeTag = `</${lastOpen[0].slice(1)}`;
    const end = text.indexOf(closeTag, start);
    if (end > start) {
      return JSON.parse(text.slice(start, end).trim());
    }
  }
  const i = text.indexOf('[{"');
  const j = text.lastIndexOf(']');
  if (i < 0 || j < 0) throw new Error(`no array in ${filename}`);
  return JSON.parse(text.slice(i, j + 1));
}

function sqlType(col) {
  if (col.udt_name === '_text') return 'text[]';
  if (col.udt_name === 'varchar' && col.character_maximum_length) {
    return `varchar(${col.character_maximum_length})`;
  }
  const map = {
    uuid: 'uuid',
    text: 'text',
    bool: 'boolean',
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    numeric: 'numeric',
    jsonb: 'jsonb',
    timestamptz: 'timestamptz',
    timestamp: 'timestamp',
  };
  return map[col.udt_name] || col.data_type;
}

function colLine(col) {
  const parts = [`  ${col.column_name} ${sqlType(col)}`];
  if (col.is_generated === 'ALWAYS' && col.generation_expression) {
    parts.push(`GENERATED ALWAYS AS (${col.generation_expression}) STORED`);
  } else {
    if (col.is_nullable === 'NO') parts.push('NOT NULL');
    if (col.column_default != null && col.is_identity !== 'YES') {
      // rewrite nextval sequence for write_jobs_queue to BIGSERIAL pattern handled separately
      if (String(col.column_default).includes('nextval(')) {
        // skip default; use BIGSERIAL / identity later
      } else {
        parts.push(`DEFAULT ${col.column_default}`);
      }
    }
  }
  return parts.join(' ');
}

const FOUNDATION_REQUIRED = [
  'profiles',
  'user_roles',
  'offers',
  'offer_votes',
  'offer_events',
  'offer_favorites',
  'comments',
  'comment_likes',
  'offer_reports',
  'moderation_logs',
  'moderation_outcomes',
  'user_bans',
  'notifications',
  'user_email_preferences',
  'write_jobs_queue',
  'app_config',
];

const FOUNDATION_OPTIONAL = [
  'announcements',
  'plaza_requests',
  'plaza_discussions',
  'user_activity',
  // communities / community_offers EXCLUDED: staging CONFLICT (bigint vs uuid)
];

const EXCLUDED_DOMAIN = [
  'distribution_*',
  'rewards/economy/supply/hunter/attribution tables',
];

const cols = loadAgentJsonArray('8cc86d93-04a4-4166-9497-07f4233f3235.txt');
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'tmp/gate0_prod_foundation_columns.json'),
  JSON.stringify(cols, null, 2),
);

const byTable = {};
for (const c of cols) (byTable[c.table_name] ||= []).push(c);
for (const t of Object.keys(byTable)) {
  byTable[t].sort((a, b) => a.ordinal_position - b.ordinal_position);
}

// Constraints from earlier MCP (embedded evidence)
const CONSTRAINTS = {
  profiles: [
    'PRIMARY KEY (id)',
    'UNIQUE (username)',
    "CHECK (((leader_badge IS NULL) OR (leader_badge = ANY (ARRAY['cazador_estrella'::text, 'cazador_aventa'::text]))))",
    'CHECK (((vote_weight_multiplier >= 1) AND (vote_weight_multiplier <= 1000)))',
  ],
  user_roles: [
    'PRIMARY KEY (id)',
    "CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text])))",
  ],
  offers: [
    'PRIMARY KEY (id)',
    "CHECK (((bank_coupon IS NULL) OR (bank_coupon = ANY (ARRAY['bbva'::text, 'banamex'::text, 'santander'::text, 'hsbc'::text, 'banorte'::text, 'scotiabank'::text, 'inbursa'::text, 'nu'::text, 'rappi-card'::text, 'otro'::text]))))",
    'CHECK (((msi_months IS NULL) OR ((msi_months >= 1) AND (msi_months <= 24))))',
    'CHECK (((risk_score IS NULL) OR ((risk_score >= 0) AND (risk_score <= 100))))',
  ],
  offer_votes: [
    'PRIMARY KEY (id)',
    'UNIQUE (offer_id, user_id)',
    "CHECK ((value = ANY (ARRAY[2, 4, 8, 12, '-1'::integer, '-2'::integer, '-4'::integer, '-6'::integer])))",
  ],
  offer_events: [
    'PRIMARY KEY (id)',
    "CHECK ((event_type = ANY (ARRAY['view'::text, 'outbound'::text, 'share'::text, 'cazar_cta'::text])))",
  ],
  offer_favorites: ['PRIMARY KEY (id)', 'UNIQUE (user_id, offer_id)'],
  comments: [
    'PRIMARY KEY (id)',
    "CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))",
  ],
  comment_likes: ['PRIMARY KEY (id)', 'UNIQUE (comment_id, user_id)'],
  offer_reports: [
    'PRIMARY KEY (id)',
    "CHECK ((report_type = ANY (ARRAY['precio_falso'::text, 'no_es_oferta'::text, 'expirada'::text, 'spam'::text, 'afiliado_oculto'::text, 'otro'::text])))",
    "CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text])))",
  ],
  moderation_logs: ['PRIMARY KEY (id)'],
  moderation_outcomes: [
    'PRIMARY KEY (id)',
    'UNIQUE (idempotency_key)',
    "CHECK ((decision = ANY (ARRAY['claim'::text, 'approve'::text, 'reject'::text, 'snooze'::text])))",
    'CHECK ((contract_version >= 1))',
    "CHECK ((source_lane = ANY (ARRAY['community'::text, 'machine'::text, 'unknown'::text])))",
    'CHECK (((snooze_minutes IS NULL) OR (snooze_minutes > 0)))',
    'CHECK (((time_from_submission_ms IS NULL) OR (time_from_submission_ms >= 0)))',
    "CHECK (((priority_at_decision IS NULL) OR (priority_at_decision = ANY (ARRAY['P1_HIGH_VALUE'::text, 'P2_REVIEW'::text, 'P3_INSUFFICIENT_EVIDENCE'::text, 'P4_LOW_VALUE'::text]))))",
  ],
  user_bans: ['PRIMARY KEY (id)', 'UNIQUE (user_id)'],
  notifications: ['PRIMARY KEY (id)'],
  user_email_preferences: ['PRIMARY KEY (user_id)'],
  write_jobs_queue: [
    // id is bigserial PRIMARY KEY inline
    "CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))",
  ],
  app_config: ['PRIMARY KEY (key)'],
  announcements: ['PRIMARY KEY (id)'],
  plaza_requests: [
    'PRIMARY KEY (id)',
    "CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'closed'::text])))",
  ],
  plaza_discussions: [
    'PRIMARY KEY (id)',
    "CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'hidden'::text])))",
  ],
  user_activity: ['PRIMARY KEY (user_id)'],
};

const FKS_AFTER = [
  // deferred FKs added after both ends exist
  {
    name: 'profiles_id_fkey',
    sql: 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'user_roles_user_id_fkey',
    sql: 'ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'offers_created_by_fkey',
    sql: 'ALTER TABLE public.offers ADD CONSTRAINT offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;',
  },
  {
    name: 'offers_locked_by_fkey',
    sql: 'ALTER TABLE public.offers ADD CONSTRAINT offers_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES auth.users(id) ON DELETE SET NULL;',
  },
  {
    name: 'profiles_welcome_offer_id_fkey',
    sql: 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_welcome_offer_id_fkey FOREIGN KEY (welcome_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;',
  },
  {
    name: 'profiles_owner_auto_approve_offers_by_fkey',
    sql: 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_owner_auto_approve_offers_by_fkey FOREIGN KEY (owner_auto_approve_offers_by) REFERENCES auth.users(id) ON DELETE SET NULL;',
  },
  {
    name: 'offer_votes_offer_id_fkey',
    sql: 'ALTER TABLE public.offer_votes ADD CONSTRAINT offer_votes_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_votes_user_id_fkey',
    sql: 'ALTER TABLE public.offer_votes ADD CONSTRAINT offer_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_events_offer_id_fkey',
    sql: 'ALTER TABLE public.offer_events ADD CONSTRAINT offer_events_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_events_user_id_fkey',
    sql: 'ALTER TABLE public.offer_events ADD CONSTRAINT offer_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;',
  },
  {
    name: 'offer_favorites_offer_id_fkey',
    sql: 'ALTER TABLE public.offer_favorites ADD CONSTRAINT offer_favorites_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_favorites_user_id_fkey',
    sql: 'ALTER TABLE public.offer_favorites ADD CONSTRAINT offer_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;',
  },
  {
    name: 'comments_offer_id_fkey',
    sql: 'ALTER TABLE public.comments ADD CONSTRAINT comments_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'comments_user_id_fkey',
    sql: 'ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;',
  },
  {
    name: 'comments_parent_id_fkey',
    sql: 'ALTER TABLE public.comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;',
  },
  {
    name: 'comment_likes_comment_id_fkey',
    sql: 'ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;',
  },
  {
    name: 'comment_likes_user_id_fkey',
    sql: 'ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_reports_offer_id_fkey',
    sql: 'ALTER TABLE public.offer_reports ADD CONSTRAINT offer_reports_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'offer_reports_reporter_id_fkey',
    sql: 'ALTER TABLE public.offer_reports ADD CONSTRAINT offer_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;',
  },
  {
    name: 'moderation_logs_offer_id_fkey',
    sql: 'ALTER TABLE public.moderation_logs ADD CONSTRAINT moderation_logs_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;',
  },
  {
    name: 'moderation_logs_user_id_fkey',
    sql: 'ALTER TABLE public.moderation_logs ADD CONSTRAINT moderation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;',
  },
  {
    name: 'moderation_outcomes_offer_id_fkey',
    sql: 'ALTER TABLE public.moderation_outcomes ADD CONSTRAINT moderation_outcomes_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;',
  },
  {
    name: 'user_bans_user_id_fkey',
    sql: 'ALTER TABLE public.user_bans ADD CONSTRAINT user_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'user_bans_banned_by_fkey',
    sql: 'ALTER TABLE public.user_bans ADD CONSTRAINT user_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'notifications_user_id_fkey',
    sql: 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'user_email_preferences_user_id_fkey',
    sql: 'ALTER TABLE public.user_email_preferences ADD CONSTRAINT user_email_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'announcements_created_by_fkey',
    sql: 'ALTER TABLE public.announcements ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;',
  },
  {
    name: 'plaza_requests_user_id_fkey',
    sql: 'ALTER TABLE public.plaza_requests ADD CONSTRAINT plaza_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'plaza_discussions_user_id_fkey',
    sql: 'ALTER TABLE public.plaza_discussions ADD CONSTRAINT plaza_discussions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
  {
    name: 'user_activity_user_id_fkey',
    sql: 'ALTER TABLE public.user_activity ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
  },
];

function emitCreateTable(table) {
  const cols = byTable[table];
  if (!cols) throw new Error(`missing columns for ${table}`);
  const lines = [];
  lines.push(`-- === ${table} (from production mkgsrpsuvedwwlzmzmzh) ===`);

  const colSql = [];
  for (const c of cols) {
    if (table === 'write_jobs_queue' && c.column_name === 'id') {
      colSql.push('  id bigserial PRIMARY KEY');
      continue;
    }
    if (c.is_generated === 'ALWAYS') {
      colSql.push(
        `  ${c.column_name} ${sqlType(c)} GENERATED ALWAYS AS (${c.generation_expression}) STORED`,
      );
      continue;
    }
    let line = `  ${c.column_name} ${sqlType(c)}`;
    if (c.is_nullable === 'NO') line += ' NOT NULL';
    if (c.column_default != null && !String(c.column_default).includes('nextval(')) {
      line += ` DEFAULT ${c.column_default}`;
    }
    colSql.push(line);
  }

  const cons = CONSTRAINTS[table] || [];
  const body = [...colSql, ...cons.map((x) => `  ${x}`)].join(',\n');
  lines.push(`CREATE TABLE IF NOT EXISTS public.${table} (`);
  lines.push(body);
  lines.push(`);`);
  lines.push('');
  lines.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  if (table === 'user_roles') {
    lines.push(`ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;`);
  }
  lines.push('');
  return lines.join('\n');
}

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers (status);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_created_at ON public.offers (created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_created_by ON public.offers (created_by);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_status_created_at ON public.offers (status, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON public.offers (expires_at);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_deleted_at ON public.offers (deleted_at) WHERE (deleted_at IS NOT NULL);`,
  `CREATE INDEX IF NOT EXISTS idx_offers_pending_snooze ON public.offers (status, snoozed_until NULLS FIRST, created_at) WHERE (status = 'pending'::text);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active_product_fingerprint ON public.offers USING btree (product_fingerprint) WHERE ((product_fingerprint IS NOT NULL) AND (product_fingerprint ~ '^(amz|ml):'::text) AND (deleted_at IS NULL) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text])));`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user ON public.offer_votes (offer_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_offer_votes_offer_id ON public.offer_votes (offer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_offer_events_offer_id ON public.offer_events (offer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_offer_events_offer_event_created_at ON public.offer_events (offer_id, event_type, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_offer_favorites_user_id ON public.offer_favorites (user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_comments_offer_id ON public.comments (offer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_moderation_logs_offer ON public.moderation_logs (offer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_offer_id ON public.moderation_outcomes (offer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_decision_at ON public.moderation_outcomes (decision_at DESC);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS moderation_outcomes_idempotency_unique ON public.moderation_outcomes (idempotency_key);`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_status_created ON public.write_jobs_queue (status, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_job_type_status ON public.write_jobs_queue (job_type, status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key ON public.profiles (slug) WHERE ((slug IS NOT NULL) AND (slug <> ''::text));`,
];

const POLICIES = `
-- Policies reconstructed from production pg_policies (Gate0 READ-ONLY).
-- DROP IF EXISTS then CREATE for idempotency on re-apply to empty/new names only.

DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS offers_owner_read_own ON public.offers;
CREATE POLICY offers_owner_read_own ON public.offers FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS offers_select_public ON public.offers;
CREATE POLICY offers_select_public ON public.offers FOR SELECT TO anon, authenticated
  USING ((deleted_at IS NULL) AND (status = ANY (ARRAY['approved'::text, 'published'::text])) AND ((expires_at IS NULL) OR (expires_at > now())));

DROP POLICY IF EXISTS offers_select_staff ON public.offers;
CREATE POLICY offers_select_staff ON public.offers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text])
  ));

DROP POLICY IF EXISTS offer_votes_select_own ON public.offer_votes;
CREATE POLICY offer_votes_select_own ON public.offer_votes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- offer_events: RLS enabled on prod with 0 policies (service_role path). No client policies.

DROP POLICY IF EXISTS offer_favorites_select_own ON public.offer_favorites;
CREATE POLICY offer_favorites_select_own ON public.offer_favorites FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_favorites_insert_own ON public.offer_favorites;
CREATE POLICY offer_favorites_insert_own ON public.offer_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_favorites_delete_own ON public.offer_favorites;
CREATE POLICY offer_favorites_delete_own ON public.offer_favorites FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comments_select_public ON public.comments;
CREATE POLICY comments_select_public ON public.comments FOR SELECT TO anon, authenticated
  USING ((status = 'approved'::text) OR (user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS comments_select_approved_on_visible_offer ON public.comments;
CREATE POLICY comments_select_approved_on_visible_offer ON public.comments FOR SELECT TO public
  USING ((status = 'approved'::text) AND (EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = comments.offer_id
      AND o.status = ANY (ARRAY['approved'::text, 'published'::text])
      AND ((o.expires_at IS NULL) OR (o.expires_at > now()))
  )));

DROP POLICY IF EXISTS comment_likes_select ON public.comment_likes;
CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS comment_likes_insert_own ON public.comment_likes;
CREATE POLICY comment_likes_insert_own ON public.comment_likes FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS comment_likes_delete_own ON public.comment_likes;
CREATE POLICY comment_likes_delete_own ON public.comment_likes FOR DELETE TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS offer_reports_select_own ON public.offer_reports;
CREATE POLICY offer_reports_select_own ON public.offer_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_reports_select_staff ON public.offer_reports;
CREATE POLICY offer_reports_select_staff ON public.offer_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS moderation_logs_select_staff ON public.moderation_logs;
CREATE POLICY moderation_logs_select_staff ON public.moderation_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS moderation_outcomes_select_staff ON public.moderation_outcomes;
CREATE POLICY moderation_outcomes_select_staff ON public.moderation_outcomes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS user_bans_select_admin ON public.user_bans;
CREATE POLICY user_bans_select_admin ON public.user_bans FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_insert_admin ON public.user_bans;
CREATE POLICY user_bans_insert_admin ON public.user_bans FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_update_admin ON public.user_bans;
CREATE POLICY user_bans_update_admin ON public.user_bans FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_delete_admin ON public.user_bans;
CREATE POLICY user_bans_delete_admin ON public.user_bans FOR DELETE TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS users_own_notifications ON public.notifications;
CREATE POLICY users_own_notifications ON public.notifications FOR ALL TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_email_prefs ON public.user_email_preferences;
CREATE POLICY users_own_email_prefs ON public.user_email_preferences FOR ALL TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS announcements_select_active ON public.announcements;
CREATE POLICY announcements_select_active ON public.announcements FOR SELECT TO public
  USING (active = true);
DROP POLICY IF EXISTS announcements_all_service_role ON public.announcements;
CREATE POLICY announcements_all_service_role ON public.announcements FOR ALL TO public
  USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS plaza_requests_select_approved ON public.plaza_requests;
CREATE POLICY plaza_requests_select_approved ON public.plaza_requests FOR SELECT TO public
  USING ((status = 'approved'::text) OR (auth.uid() = user_id));
DROP POLICY IF EXISTS plaza_requests_insert_own ON public.plaza_requests;
CREATE POLICY plaza_requests_insert_own ON public.plaza_requests FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plaza_discussions_select_approved ON public.plaza_discussions;
CREATE POLICY plaza_discussions_select_approved ON public.plaza_discussions FOR SELECT TO public
  USING ((status = 'approved'::text) OR (auth.uid() = user_id));
DROP POLICY IF EXISTS plaza_discussions_insert_own ON public.plaza_discussions;
CREATE POLICY plaza_discussions_insert_own ON public.plaza_discussions FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_activity_own_upsert ON public.user_activity;
CREATE POLICY user_activity_own_upsert ON public.user_activity FOR ALL TO public
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- write_jobs_queue / app_config: RLS on; client policies UNKNOWN/none on prod for queue.
`;

const VIEWS = `
CREATE OR REPLACE VIEW public.public_profiles_view AS
 SELECT id,
    display_name,
    avatar_url,
    leader_badge,
    ml_tracking_tag,
    slug,
    amazon_tracking_tag
   FROM public.profiles;

CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
 SELECT id,
    title,
    price,
    original_price,
    image_url,
    image_urls,
    msi_months,
    bank_coupon,
    tags,
    store,
    category,
    offer_url,
    description,
    steps,
    conditions,
    coupons,
    created_at,
    created_by,
    status,
    expires_at,
    COALESCE(upvotes_count, 0) AS up_votes,
    COALESCE(downvotes_count, 0) AS down_votes,
    COALESCE(upvotes_count, 0) * 2 - COALESCE(downvotes_count, 0) AS score,
    (COALESCE(upvotes_count, 0) * 2 - COALESCE(downvotes_count, 0))::double precision / power(GREATEST(COALESCE(EXTRACT(epoch FROM now() - created_at), 0::numeric) / 3600::numeric + 2::numeric, 2::numeric), 1.5)::double precision AS score_final,
    COALESCE(ranking_momentum, 0::numeric) AS ranking_momentum,
    COALESCE(reputation_weighted_score, 0::numeric) AS reputation_weighted_score,
    COALESCE(ranking_momentum, 0::numeric) + COALESCE(reputation_weighted_score, 0::numeric) AS ranking_blend
   FROM public.offers o;

CREATE OR REPLACE VIEW public.daily_system_metrics AS
 WITH o AS (
         SELECT date((offers.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_offers_created
           FROM public.offers
          WHERE offers.created_at IS NOT NULL
          GROUP BY (date((offers.created_at AT TIME ZONE 'UTC'::text)))
        ), v AS (
         SELECT date((offer_votes.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_votes
           FROM public.offer_votes
          WHERE offer_votes.created_at IS NOT NULL
          GROUP BY (date((offer_votes.created_at AT TIME ZONE 'UTC'::text)))
        ), ev_view AS (
         SELECT date((offer_events.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_views
           FROM public.offer_events
          WHERE offer_events.created_at IS NOT NULL AND offer_events.event_type = 'view'::text
          GROUP BY (date((offer_events.created_at AT TIME ZONE 'UTC'::text)))
        ), ev_out AS (
         SELECT date((offer_events.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_outbound
           FROM public.offer_events
          WHERE offer_events.created_at IS NOT NULL AND offer_events.event_type = 'outbound'::text
          GROUP BY (date((offer_events.created_at AT TIME ZONE 'UTC'::text)))
        )
 SELECT COALESCE(o.date, v.date, ev_view.date, ev_out.date) AS date,
    COALESCE(o.total_offers_created, 0::bigint) AS total_offers_created,
    COALESCE(v.total_votes, 0::bigint) AS total_votes,
    COALESCE(ev_view.total_views, 0::bigint) AS total_views,
    COALESCE(ev_out.total_outbound, 0::bigint) AS total_outbound,
    COALESCE(ev_out.total_outbound, 0::bigint)::numeric / NULLIF(COALESCE(ev_view.total_views, 0::bigint), 0)::numeric AS ctr
   FROM o
     FULL JOIN v ON v.date = o.date
     FULL JOIN ev_view ON ev_view.date = COALESCE(o.date, v.date)
     FULL JOIN ev_out ON ev_out.date = COALESCE(o.date, v.date, ev_view.date)
  ORDER BY (COALESCE(o.date, v.date, ev_view.date, ev_out.date)) DESC;
`;

const header = `-- FOUNDATION BASELINE 20260917
-- Source of truth: PRODUCTION schema mkgsrpsuvedwwlzmzmzh (Gate0 READ-ONLY catalog)
-- Companion: docs/SYSTEMS/FOUNDATION_DDL_SPEC.md / STAGING_SCHEMA_FORENSIC_DIFF.md
--
-- STATUS: AUTHORED ONLY — DO NOT APPLY until founder approval.
-- Target when approved: STAGING oojshofrpbfwsiypcecr ONLY (never silent prod apply).
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE POLICY.
-- CONFLICT GUARDS: aborts if staging-incompatible relations exist (views named offers/user_roles,
-- or legacy profiles without canonical columns). Does NOT DROP/ALTER legacy silently.
--
-- EXCLUDED (domain / money / supply / distribution): see footer TODO.
-- NOT VALID prod CHECKs omitted (offers_price_non_negative_check NOT VALID, etc.).
-- Triggers / vote counter functions: TODO — not fully reconstructed here (UNKNOWN completeness).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Conflict preflight (staging-aware)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offers_kind "char";
  roles_kind "char";
  has_display_name boolean;
BEGIN
  SELECT c.relkind INTO offers_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'offers';

  IF offers_kind = 'v' THEN
    RAISE EXCEPTION 'GATE0 CONFLICT: public.offers exists as VIEW (legacy over ofertas). Rename/drop view before creating canonical TABLE. No DROP performed.';
  END IF;

  SELECT c.relkind INTO roles_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'user_roles';

  IF roles_kind = 'v' THEN
    RAISE EXCEPTION 'GATE0 CONFLICT: public.user_roles exists as VIEW (legacy over profiles.role). Rename/drop view before creating canonical TABLE. No DROP performed.';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'display_name'
    ) INTO has_display_name;
    IF NOT has_display_name THEN
      RAISE EXCEPTION 'GATE0 CONFLICT: public.profiles exists but lacks canonical column display_name (legacy shape). Do not CREATE IF NOT EXISTS over incompatible table. Manual reconcile required. No ALTER performed.';
    END IF;
  END IF;
END $$;

`;

const order = [
  'profiles',
  'user_roles',
  'offers',
  'offer_votes',
  'offer_events',
  'offer_favorites',
  'comments',
  'comment_likes',
  'offer_reports',
  'moderation_logs',
  'moderation_outcomes',
  'user_bans',
  'notifications',
  'user_email_preferences',
  'write_jobs_queue',
  'app_config',
  'announcements',
  'plaza_requests',
  'plaza_discussions',
  'user_activity',
];

let sql = header;
for (const t of order) {
  sql += emitCreateTable(t) + '\n';
}
sql += '-- ---------------------------------------------------------------------------\n-- Foreign keys\n-- ---------------------------------------------------------------------------\n';
for (const fk of FKS_AFTER) {
  sql += `DO $$ BEGIN\n  ${fk.sql}\nEXCEPTION\n  WHEN duplicate_object THEN NULL;\nEND $$;\n`;
}

sql += '\n-- ---------------------------------------------------------------------------\n-- Indexes (subset evidenced on prod; additional prod indexes may exist)\n-- ---------------------------------------------------------------------------\n';
sql += INDEXES.join('\n') + '\n';

sql += '\n-- ---------------------------------------------------------------------------\n-- RLS policies\n-- ---------------------------------------------------------------------------\n';
sql += POLICIES;

sql += '\n-- ---------------------------------------------------------------------------\n-- Views (REQUIRED: public_profiles_view, ofertas_ranked_general; OPTIONAL: daily_system_metrics)\n-- WARNING: CREATE OR REPLACE VIEW will fail if staging has incompatible view named ofertas_ranked_general (none today).\n-- WARNING: staging has VIEW public.offers — blocked by preflight above.\n-- ---------------------------------------------------------------------------\n';
sql += VIEWS;

sql += `
COMMIT;

-- ===========================================================================
-- EXCLUDED / TODO (do NOT invent here)
-- ===========================================================================
-- - communities / community_offers: STAGING CONFLICT (staging communities.id = bigint; prod = uuid)
-- - distribution_* tables
-- - rewards / affiliate_ledger / conversions / commissions / settlement / payouts
-- - hunter_* / price snapshots / mercadolibre_oauth_tokens
-- - reward_outbound_clicks / attribution foundation
-- - Triggers: offer_votes_counter_trigger, handle_new_user, set_updated_at, risk score, etc. (prod has them; bodies not fully exported in this file)
-- - Functions/RPCs beyond view dependencies
-- - Storage bucket offer-images (prod) vs ofertas/ofertas-images (staging) — metadata only; not created here
-- - Grants REVOKE patterns for offer_events/write_jobs_queue (prod service_role-only) — TODO verify exact grants
`;

fs.writeFileSync(
  path.join(ROOT, 'docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql'),
  sql,
);

// Diff JSON
const prodBase = [
  'affiliate_commission_revisions','affiliate_commissions','affiliate_conversions','affiliate_economic_events','affiliate_ledger_entries','affiliate_reconciliation_findings','affiliate_reconciliation_runs','announcements','app_config','comment_likes','comments','commission_allocations','commission_pools','communities','community_offers','creator_rewards','hunter_shadow_cycles','hunter_shadow_outcomes','hunter_source_health','hunter_supply_runs','ingest_cycle_locks','ledger_settlements','mercadolibre_oauth_tokens','moderation_logs','moderation_outcomes','notifications','offer_events','offer_favorites','offer_health_state','offer_price_snapshots','offer_quality_checks','offer_reports','offer_votes','offers','plaza_discussions','plaza_requests','product_price_snapshots','profiles','reward_audit_log','reward_clawback_adjustments','reward_outbound_clicks','reward_payouts','user_activity','user_bans','user_email_preferences','user_roles','write_jobs_queue'
];
const stagingBase = [
  'admin_kpi_daily','affiliate_clicks','affiliate_configs','affiliate_events','affiliate_programs','affiliate_verifications','communities','community_members','event_types','fx_rates','merchants','moderation_log','ofertas','offer_fingerprints','offer_interactions','payouts','profiles','promotion_requests','push_subscriptions','site_settings','stores','ui_events','ui_events_rejects','user_roles_tbl','votos'
];
const stagingViews = [
  'my_rank','ofertas_author_compat','ofertas_scores','offer_scores','offer_vote_counts','offer_vote_stats','offers','offers_normalized','site_settings_active','site_settings_current_json','site_settings_latest','top_helpers_day','top_helpers_week','user_roles','user_roles_effective','v_affiliate_revenue_by_user','v_payouts_pending','votes_norm'
];
const prodViews = ['daily_system_metrics','ofertas_ranked_general','public_profiles_view'];

const nameMatch = prodBase.filter((t) => stagingBase.includes(t));
const missingOnStaging = prodBase.filter((t) => !stagingBase.includes(t) && !stagingViews.includes(t));
const extraOnStaging = stagingBase.filter((t) => !prodBase.includes(t));

const diff = {
  generated_at: new Date().toISOString(),
  method: 'supabase MCP execute_sql SELECT-only + list_tables',
  production_ref: 'mkgsrpsuvedwwlzmzmzh',
  staging_ref: 'oojshofrpbfwsiypcecr',
  env_local_preflight: {
    url_ref: 'mkgsrpsuvedwwlzmzmzh',
    expected_ref: 'oojshofrpbfwsiypcecr',
    target: 'staging',
    mismatch: true,
    note: 'NEXT_PUBLIC_SUPABASE_URL points to PRODUCTION while guards expect staging. Forensics used MCP project_id explicitly; no env-dependent writes.',
  },
  remote_writes: { production: 0, staging: 0 },
  tables: {
    production_base_count: prodBase.length,
    staging_base_count: stagingBase.length,
    name_match_base: nameMatch,
    missing_on_staging_vs_prod: missingOnStaging,
    extra_legacy_on_staging: extraOnStaging,
    critical_kind_conflicts: [
      {
        name: 'offers',
        production: 'BASE TABLE uuid PK',
        staging: 'VIEW over ofertas (bigint id)',
        class: 'CONFLICT',
      },
      {
        name: 'user_roles',
        production: 'BASE TABLE (id,user_id,role,created_at) RLS forced',
        staging: 'VIEW selecting id AS user_id, role FROM profiles',
        class: 'CONFLICT',
      },
      {
        name: 'profiles',
        production: 'canonical 2026 columns (display_name, reputation_*, welcome_offer_id, …)',
        staging: 'legacy columns (full_name, role, karma, rank_tier, …) — missing display_name',
        class: 'CONFLICT',
      },
      {
        name: 'communities',
        production: 'id uuid',
        staging: 'id bigint + many extra columns',
        class: 'CONFLICT',
      },
    ],
  },
  views: {
    production: prodViews,
    staging_extra_legacy: stagingViews,
    foundation_required_missing_on_staging: ['ofertas_ranked_general', 'public_profiles_view'],
    foundation_optional_missing_on_staging: ['daily_system_metrics'],
  },
  storage: {
    production_buckets: [{ name: 'offer-images', public: true }],
    staging_buckets: [
      { name: 'ofertas', public: true },
      { name: 'ofertas-images', public: true },
    ],
    class: 'CONFLICT_NAMES',
  },
  auth: { production_users: 17, staging_users: 1 },
  extensions: {
    production: ['pg_cron','pg_stat_statements','pgcrypto','plpgsql','supabase_vault','uuid-ossp'],
    staging: ['pg_cron','pg_graphql','pg_stat_statements','pg_trgm','pgcrypto','plpgsql','supabase_vault','uuid-ossp'],
    staging_extra: ['pg_graphql','pg_trgm'],
  },
  rls: {
    production: 'all 47 base tables enabled; user_roles forced',
    staging: 'all listed base tables enabled; views have rls_enabled false',
  },
  foundation_ddl: {
    file: 'docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql',
    included_required: FOUNDATION_REQUIRED,
    included_optional: FOUNDATION_OPTIONAL,
    excluded: EXCLUDED_DOMAIN.concat(['communities','community_offers']),
    applied: false,
  },
  blockers: [
    'env.local URL is production while AVENTA_* expects staging',
    'staging offers/user_roles are VIEWS — foundation CREATE TABLE blocked until renamed',
    'staging profiles incompatible column set',
    'staging communities.id bigint vs prod uuid',
    'triggers/functions not fully authored in foundation SQL',
  ],
};

fs.writeFileSync(
  path.join(ROOT, 'tmp/staging-prod-schema-diff.json'),
  JSON.stringify(diff, null, 2),
);

console.log(
  JSON.stringify(
    {
      sql_bytes: sql.length,
      foundation_tables: order.length,
      missing_on_staging: missingOnStaging.length,
      conflicts: diff.tables.critical_kind_conflicts.length,
    },
    null,
    2,
  ),
);
