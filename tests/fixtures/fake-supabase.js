// Minimal in-browser stand-in for @supabase/supabase-js, used only by tests/live_e2e.py.
// Supports the query shapes the app uses and mimics the version_conflict trigger.
const VERSIONED = ['offers', 'brain_facts', 'approvals', 'agents'];
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const OWNER = '11111111-1111-1111-1111-111111111111';
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
  content_items: [],
  approvals: [
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
  in(k, vs) { this.filters.push([k, vs, 'in']); return this; }
  order(k, o) { this.order_ = [k, o?.ascending !== false]; return this; }
  limit(n) { this.limit_ = n; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'single'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const rows = (db[this.t] ||= []);
    const match = (r) => this.filters.every(([k, v, op]) => (op === 'in' ? v.includes(r[k]) : (r[k] ?? null) === v));
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
  const session = signedIn ? { access_token: 'test-token', user: { id: OWNER, email: 'owner@ciftron.com' } } : null;
  window.__FAKE_CALLS__ ||= [];
  return {
    from: (t) => new Query(t),
    rpc: async () => ({ data: [], error: null }),
    storage: { from: () => ({ upload: async (p) => { window.__FAKE_CALLS__.push(['upload', p]); return { data: { path: p }, error: null }; }, remove: async () => ({ data: [], error: null }) }) },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async (o) => { window.__FAKE_CALLS__.push(['otp', o]); return { error: o.email === 'owner@ciftron.com' ? null : { message: 'Signups not allowed for otp' } }; },
      signOut: async () => { localStorage.removeItem('fake.session'); location.reload(); },
    },
  };
}
