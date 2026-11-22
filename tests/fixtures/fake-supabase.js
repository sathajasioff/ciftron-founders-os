// Minimal in-browser stand-in for @supabase/supabase-js, used only by tests/live_e2e.py.
// Supports the query shapes the app uses and mimics the version_conflict trigger.
const VERSIONED = ['offers', 'brain_facts', 'approvals', 'agents', 'content_items', 'email_sequences', 'funnels', 'programs', 'goals', 'voice_playbook'];
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const OWNER = '11111111-1111-1111-1111-111111111111';
const nowIso = () => new Date().toISOString();
const old = '2026-11-01T10:00:00Z';

const db = (window.__FAKE_DB__ ||= {
  brain_sources: [
    { id: 's1', owner_id: OWNER, kind: 'text', name: 'about_me (build brief)', status: 'ready', chunk_count: 4, text_length: 2400, is_writing_sample: false, facts_proposed_at: old, created_at: old, updated_at: old },
    { id: 's2', owner_id: OWNER, kind: 'file', name: 'Captions.pdf', mime: 'application/pdf', storage_path: OWNER + '/x-Captions.pdf', status: 'pending', chunk_count: 0, is_writing_sample: true, created_at: old, updated_at: old },
  ],
  brain_facts: [
    { id: 'f1', owner_id: OWNER, category: 'identity', text: 'Runs Ciftron, a growth and AI automation business.', status: 'approved', starred: true, source_id: 's1', source_quote: 'I run a digital marketing, growth, and AI automation business', authored_by: 'ai', version: 2, created_at: old, updated_at: old },
    { id: 'f2', owner_id: OWNER, category: 'audience', text: 'Serves mortgage brokers and private lenders.', status: 'proposed', starred: false, source_id: 's1', source_quote: 'mortgage brokers; private lenders', authored_by: 'ai', version: 1, created_at: old, updated_at: old },
    { id: 'f3', owner_id: OWNER, category: 'voice', text: 'Writes plain, human, specific copy.', status: 'proposed', starred: false, source_id: 's1', source_quote: 'plain, human, specific', authored_by: 'ai', version: 1, created_at: old, updated_at: old },
  ],
  style_guides: [],
  brand_dna: [{ id: 'd1', owner_id: OWNER, version_no: 1, is_active: true, created_at: '2026-11-02T10:00:00Z', content: { facts: { identity: [{}] } }, markdown: '# Brand DNA v1\n\n## Identity\n- (key) Runs Ciftron, a growth and AI automation business.\n\n## Never\n- No em dashes' }],
  offers: [{ id: 'o1', owner_id: OWNER, name: 'Lead Generation & Paid Advertising Management', price: 497, currency: 'USD', cadence: 'month', status: 'live', services: ['Meta Ads'], in_dna: true, sort: 1, version: 1, created_at: old, updated_at: old }],
  hl_write_log: [],
  agents: [
    { id: 'ag0', owner_id: OWNER, slug: 'chief-of-staff', name: 'Chief of Staff', role: 'Routes work to the right agent', instructions: 'Route work.', enabled: true, pinned: true, sort: 0, version: 1, created_at: old, updated_at: old },
    { id: 'ag1', owner_id: OWNER, slug: 'content-strategist', name: 'Content Strategist', role: 'Content and creative production', instructions: 'Write content.', enabled: true, pinned: false, sort: 1, version: 1, created_at: old, updated_at: old },
    { id: 'ag2', owner_id: OWNER, slug: 'researcher', name: 'Researcher', role: 'Public research', instructions: '', enabled: false, pinned: false, sort: 2, version: 1, created_at: old, updated_at: old },
  ],
  threads: [],
  messages: [],
  content_items: [{ id: 'ci1', owner_id: OWNER, title: 'Follow-up speed Reel', format: 'Short video', stage: 'Idea', publish_date: '2026-11-24', hook: 'Your follow-up is slow', notes: '', tasks: { script: false, film: false, edit: false, thumbnail: false, upload: false }, language: 'en', authored_by: 'ai', version: 1, created_at: old, updated_at: old }],
  research_creators: [{ id: 'rc1', owner_id: OWNER, platform: 'Instagram', handle: '@sample.coach', is_mine: false, median_views: 1800, created_at: old },
    { id: 'rc2', owner_id: OWNER, platform: 'Instagram', handle: '@ciftron', is_mine: true, median_views: 1700, created_at: old },
    { id: 'rc3', owner_id: OWNER, platform: 'LinkedIn', handle: '@jasinthan', profile_url: 'https://www.linkedin.com/in/jasinthan', is_mine: true, median_views: 70, created_at: old }],
  apify_runs: [{ id: 'ar1', owner_id: OWNER, platform: 'Instagram', actor: 'apify~instagram-post-scraper', status: 'SUCCEEDED', cost_usd: 0.4, items: 24, outliers: 4, created_at: new Date().toISOString() }],
  voice_playbook: [{ id: 'vp1', owner_id: OWNER, question: 'How fast should a broker call a new lead?', answer: 'Within five minutes. After that the lead has usually moved on.', status: 'proposed', source_quote: 'I call within five minutes', authored_by: 'ai', version: 1, created_at: old, updated_at: old }],
  research_posts: [
    { id: 'mp1', owner_id: OWNER, creator_id: 'rc2', external_id: 'm1', title: 'My Reel about follow-up speed', format: 'Reel', views: 5200, likes: 310, comments: 41, outlier_score: 3.1, thumbnail_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', posted_at: '2026-11-20T10:00:00Z', created_at: old, research_creators: { handle: '@ciftron', platform: 'Instagram', is_mine: true } },
    { id: 'mp2', owner_id: OWNER, creator_id: 'rc3', external_id: 'm2', title: 'LinkedIn post on CRM leaks', format: 'Post', likes: 44, comments: 6, shares: 2, engagement: 62, outlier_score: 0.9, posted_at: '2026-11-18T10:00:00Z', created_at: old, research_creators: { handle: '@jasinthan', platform: 'LinkedIn', is_mine: true } },
    { id: 'rp1', owner_id: OWNER, creator_id: 'rc1', external_id: 'x', title: 'The 3 texts I send every new lead', format: 'Reel', views: 21400, outlier_score: 11.89, created_at: old, research_creators: { handle: '@sample.coach', platform: 'Instagram' } }],
  learning_signals: [{ id: 'ls1', owner_id: OWNER, key: 'type_up:Hooks', signal: 'You approve most Hooks drafts (4 of 5).', evidence: '5 decisions', weight: 'medium', state: 'on', updated_at: old }],
  email_sequences: [{ id: 'es1', owner_id: OWNER, name: 'Call reminders', sequence_type: 'reminder', language: 'en', status: 'draft', emails: [{ day: 'Immediately', subject: 'Your call is booked', preview: 'p', body: 'Hi NAME' }], version: 1, created_at: old, updated_at: old }],
  funnels: [{ id: 'fn1', owner_id: OWNER, name: 'Meta Ads review call', funnel_type: 'Appointment booking funnel', offer_id: 'o1', brief: { audience: 'Brokers' }, order_form_url: 'https://link.example/book', current_version: 1, status: 'draft', version: 1, created_at: old, updated_at: old }],
  funnel_versions: [{ id: 'fv1', owner_id: OWNER, funnel_id: 'fn1', version_no: 1, status: 'approved', note: 'Built from brief', created_at: old, output: { headline: 'Find your lead leaks', subheadline: 'A 15-minute review', sections: [{ heading: 'What we check', body: 'Ad, form, follow-up', bullets: ['Speed'] }], cta: 'Book my call', faq: [], qualification_questions: ['Ad spend?'], image_prompts: ['hero'], emails: [{ subject: 'Booked', preview: 'p', body: 'Hi NAME' }], hl_setup_notes: ['Create the funnel'] } }],
  graphics: [], graphic_versions: [], brand_board: [],
  vault_items: [{ id: 'v1', owner_id: OWNER, kind: 'url', title: 'Clean pricing page', url: 'https://example.com', note: 'Layout', created_at: old }],
  goals: [], goal_items: [],
  agent_routines: [],
  workspace_members: [],
  error_log: [{ id: 3, owner_id: OWNER, source: 'server', route: '/api/studio', status: 500, message: 'OpenRouter timed out', detail: { action: 'graphic' }, created_at: '2026-11-21T12:00:00Z' }],
  mcp_tokens: [{ id: 'mt1', owner_id: OWNER, name: 'Claude Code laptop', scope: 'read_write', token_prefix: 'cfos_AbCdEfG', last_used_at: '2026-11-21T10:00:00Z', revoked_at: null, created_at: old }],
  mcp_edit_log: [{ id: 7, owner_id: OWNER, token_id: 'mt1', action: 'update', tool: 'update_goal', table_name: 'goals', row_id: 'g9', previous_value: { current_value: 2 }, new_value: { current_value: 5 }, undone_at: null, created_at: '2026-11-21T11:00:00Z' }],
  programs: [], program_modules: [], program_lessons: [],
  approvals: [
    { id: 'apf1', owner_id: OWNER, type: 'Idea', title: 'Book the leak audit', payload: { body: 'Bottom of funnel', funnel_stage: 'bofu', format: 'Carousel', hook: 'Your ads are fine. Your follow-up is not.' }, tags: ['bofu'], language: 'en', source_agent: 'Content Strategist', target_module: 'content', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: '2026-11-05T10:00:00Z', updated_at: old },
    { id: 'ap1', owner_id: OWNER, type: 'Hooks', title: '5 Reel hooks: mortgage follow-up', payload: { body: '1. Your leads are not cold. Your follow-up is slow.\n2. [PROOF NEEDED]' }, tags: ['mortgage'], language: 'en', source_agent: 'Content Strategist', target_module: 'content', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: old, updated_at: old },
    { id: 'ap2', owner_id: OWNER, type: 'Ad copy', title: 'Prêt privé: 6 variations', payload: { body: 'Votre banque a dit non?' }, tags: ['meta ads'], language: 'fr-qc', source_agent: 'Content Strategist', target_module: 'content', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: '2026-11-03T10:00:00Z', updated_at: old },
    { id: 'ap3', owner_id: OWNER, type: 'Email sequence', title: 'Welcome sequence', payload: { body: 'Email 1' }, tags: [], language: 'en', source_agent: 'AI Chat', target_module: 'emails', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: '2026-11-04T10:00:00Z', updated_at: old },
  ],
});

class Query {
  constructor(t) { this.t = t; this.filters = []; this.op = 'select'; this.mode = null; this.order_ = null; this.limit_ = null; }
  select(cols, opts) { this.cols = cols; this.opts = opts || {}; return this; }
  insert(v) { this.op = 'insert'; this.vals = [].concat(v); return this; }
  update(v) { this.op = 'update'; this.vals = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k, v) { this.filters.push([k, v]); return this; }
  is(k, v) { this.filters.push([k, v]); return this; }
  neq(k, v) { this.filters.push([k, v, 'neq']); return this; }
  gte(k, v) { this.filters.push([k, v, 'gte']); return this; }
  in(k, vs) { this.filters.push([k, vs, 'in']); return this; }
  order(k, o) { this.order_ = [k, o?.ascending !== false]; return this; }
  limit(n) { this.limit_ = n; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'single'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const rows = (db[this.t] ||= []);
    const match = (r) => this.filters.every(([k, v, op]) => (op === 'in' ? v.includes(r[k]) : op === 'neq' ? r[k] !== v : op === 'gte' ? r[k] >= v : (r[k] ?? null) === v));
    let data;
    if (this.op === 'insert') {
      data = this.vals.map((v) => ({ id: uid(), version: 1, tags: [], trashed_at: null, agent_id: null, status: this.t === 'brain_sources' ? 'pending' : v.status, created_at: now(), updated_at: now(), starred: false, ...v }));
      rows.unshift(...data);
    } else if (this.op === 'update') {
      data = [];
      for (const r of rows.filter(match)) {
        if (VERSIONED.includes(this.t) && this.vals.version !== r.version + 1) return { data: null, error: { message: 'version_conflict' } };
        Object.assign(r, this.vals, { updated_at: now() }); data.push(r);
      }
    } else if (this.op === 'delete') {
      data = rows.filter(match); db[this.t] = rows.filter((r) => !match(r));
    } else {
      data = rows.filter(match).map((r) => (this.t === 'brain_facts' ? { ...r, brain_sources: db.brain_sources.find((s) => s.id === r.source_id) ? { name: db.brain_sources.find((s) => s.id === r.source_id).name } : null } : { ...r }));
      if (this.order_) { const [k, asc] = this.order_; data.sort((a, b) => (a[k] === b[k] ? 0 : (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1))); }
      if (this.limit_) data = data.slice(0, this.limit_);
    }
    if (this.opts?.head) return { data: null, count: data.length, error: null };
    if (this.mode) data = data[0] || null;
    if (this.mode === 'single' && !data) return { data: null, error: { message: 'not found' } };
    return { data: JSON.parse(JSON.stringify(data)), error: null };
  }
}

export function createClient() {
  const signedIn = localStorage.getItem('fake.session') === '1';
  // fake.member = '1' signs in as a team member working in the owner's workspace.
  const member = localStorage.getItem('fake.member') === '1';
  const session = signedIn ? { access_token: 'test-token', user: member ? { id: '44444444-4444-4444-4444-444444444444', email: 'member@example.com' } : { id: OWNER, email: 'owner@ciftron.com' } } : null;
  window.__FAKE_CALLS__ ||= [];
  return {
    from: (t) => new Query(t),
    rpc: async (name) => (name === 'workspace_owner' ? { data: OWNER, error: null } : { data: [], error: null }),
    storage: { from: () => ({ upload: async (p) => { window.__FAKE_CALLS__.push(['upload', p]); return { data: { path: p }, error: null }; }, remove: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } }) }) },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async (o) => { window.__FAKE_CALLS__.push(['otp', o]); return { error: o.email === 'owner@ciftron.com' ? null : { message: 'Signups not allowed for otp' } }; },
      signOut: async () => { localStorage.removeItem('fake.session'); location.reload(); },
    },
  };
}
