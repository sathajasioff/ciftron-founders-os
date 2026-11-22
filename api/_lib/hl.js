// HighLevel API v2 client and pure helpers. Base URL, Version header and scopes checked against
// marketplace.gohighlevel.com docs (Nov 2026): current docs use Version "v3"; older "2021-07-28" is kept as a fallback.
import { HttpError } from './http.js';

export const HL_BASE = 'https://services.leadconnectorhq.com';
const VERSIONS = [process.env.HL_API_VERSION || 'v3', '2021-07-28'];

// Exact scopes per feature. Read-only first; writes only for features that exist.
export const HL_SCOPES = {
  read: [
    ['locations.readonly', 'Test the connection, read the sub-account name'],
    ['opportunities.readonly', 'Pipeline board: pipelines, stages, opportunities'],
    ['contacts.readonly', 'Contact details in the Pipeline drawer'],
    ['products.readonly', 'Products and prices as context'],
    ['funnels/funnel.readonly', 'Funnel list as context'],
    ['socialplanner/account.readonly', 'Connected social accounts for drafts'],
    ['locations/customValues.readonly', 'Read OS_ custom values'],
  ],
  write: [
    ['opportunities.write', 'Move a card to another stage (confirmed)'],
    ['contacts.write', 'Create a contact (confirmed)'],
    ['socialplanner/post.write', 'Send a Social Planner post as a draft (confirmed)'],
    ['emails/templates.write', 'Save an email template (confirmed)'],
    ['locations/customValues.write', 'Create or update OS_ custom values only (confirmed)'],
    ['products.write', 'Create a product for an offer or funnel (confirmed)'],
    ['products/prices.write', 'Add the price to that product (confirmed)'],
    ['courses.write', 'Send a program as a draft course (confirmed)'],
  ],
};

export async function hlFetch(token, path, { method = 'GET', query, body, scope } = {}) {
  const url = new URL(HL_BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  let last;
  for (let i = 0; i < VERSIONS.length; i++) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, Version: VERSIONS[i], Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) { throw new HttpError(502, 'Could not reach HighLevel: ' + e.message); }
    const text = await r.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }
    if (r.ok) return json;
    last = { status: r.status, json, text };
    // Retry once with the older Version header if HighLevel rejects the version value.
    if ((r.status === 400 || r.status === 422) && /version/i.test(text) && i < VERSIONS.length - 1) continue;
    break;
  }
  throw hlError(last, scope);
}

export function hlError({ status, json, text }, scope) {
  const msg = json?.message ? [].concat(json.message).join('; ') : (text || '').slice(0, 200);
  if (status === 401 && /scope|not authorized/i.test(msg) && scope) return new HttpError(403, `Your HighLevel token is missing the "${scope}" scope. Add it to the Private Integration in HighLevel.`, { scope });
  if (status === 401) return new HttpError(400, 'HighLevel rejected the token. Check it in Connections, or rotate it in HighLevel and save the new one.', { needs: 'highlevel' });
  if (status === 403) return new HttpError(403, `HighLevel says this token cannot access that ${scope ? `(${scope})` : 'resource'}. Check the Location ID and scopes.`, { scope });
  if (status === 429) return new HttpError(429, 'HighLevel rate limit reached. Try again in a minute.');
  return new HttpError(status >= 500 ? 502 : 400, `HighLevel error ${status}: ${msg || 'no details'}`, { hl_status: status, hl_body: json });
}

// ---------- Pure helpers (unit tested) ----------

export function pickPipeline(pipelines, wanted) {
  if (!pipelines?.length) return null;
  return pipelines.find((p) => p.id === wanted) || pipelines.find((p) => /agency/i.test(p.name)) || pipelines[0];
}

export function sortStages(pipeline) {
  return [...(pipeline?.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => ({ id: s.id, name: s.name, position: s.position ?? 0 }));
}

// Only what the board needs. Notes, tasks and anything conversational are dropped.
export function slimOpportunity(o) {
  return {
    id: o.id, name: o.name, monetaryValue: o.monetaryValue ?? null, pipelineId: o.pipelineId, pipelineStageId: o.pipelineStageId,
    status: o.status, source: o.source || null, createdAt: o.createdAt || o.dateAdded || null, lastStageChangeAt: o.lastStageChangeAt || null,
    contact: o.contact ? { id: o.contact.id, name: o.contact.name || null, companyName: o.contact.companyName || null, email: o.contact.email || null, phone: o.contact.phone || null, tags: o.contact.tags || [] } : (o.contactId ? { id: o.contactId } : null),
  };
}

export function slimContact(c) {
  return {
    id: c.id, firstName: c.firstName || null, lastName: c.lastName || null, name: c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
    email: c.email || null, phone: c.phone || null, companyName: c.companyName || null, tags: c.tags || [], source: c.source || null, dateAdded: c.dateAdded || null,
    city: c.city || null, state: c.state || null, country: c.country || null, website: c.website || null,
  };
}

// Board stats from stage names, so they work with renamed stages too.
export function boardStats(stages, opps, now = Date.now()) {
  const stageName = Object.fromEntries(stages.map((s) => [s.id, s.name.toLowerCase()]));
  const inStage = (re) => opps.filter((o) => re.test(stageName[o.pipelineStageId] || '')).length;
  const week = now - 7 * 864e5;
  return {
    total: opps.length,
    newLeads7d: opps.filter((o) => o.createdAt && new Date(o.createdAt).getTime() >= week).length,
    qualified: opps.filter((o) => /qualified/.test(stageName[o.pipelineStageId] || '') && !/not|pending|lost/.test(stageName[o.pipelineStageId] || '')).length,
    appointments: inStage(/appointment|booked|call/),
    active: opps.filter((o) => o.status === 'open').length,
    won: opps.filter((o) => o.status === 'won').length,
    lost: opps.filter((o) => o.status === 'lost' || o.status === 'abandoned').length,
    openValue: opps.filter((o) => o.status === 'open').reduce((a, o) => a + (Number(o.monetaryValue) || 0), 0),
  };
}

export function checkMove(stages, fromId, toId, allowBackward) {
  const from = stages.findIndex((s) => s.id === fromId);
  const to = stages.findIndex((s) => s.id === toId);
  if (to < 0) throw new HttpError(400, 'That stage is not in this pipeline');
  if (from === to) throw new HttpError(400, 'The card is already in that stage');
  if (to < from && !allowBackward) throw new HttpError(400, 'Moves are forward-only. Turn on backward moves to allow this.');
  return { from: stages[from]?.name || 'Unknown', to: stages[to].name, backward: to < from };
}

const AUTOMATION_WARNING = 'HighLevel automations may trigger on this change (stage moves, tags or new contacts).';
const toHtml = (text) => '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55">' +
  String(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`).join('') + '</div>';

// Every write is built here, so the preview the owner confirms is exactly what gets sent.
export function buildWrite(kind, input, { locationId, stages } = {}) {
  const s = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
  switch (kind) {
    case 'move': {
      const m = checkMove(stages || [], input.fromStageId, input.toStageId, !!input.allowBackward);
      return {
        method: 'PUT', path: `/opportunities/${encodeURIComponent(s(input.opportunityId, 64))}`, scope: 'opportunities.write',
        body: { pipelineId: s(input.pipelineId, 64), pipelineStageId: s(input.toStageId, 64) },
        summary: `${s(input.name, 150) || 'Opportunity'}: ${m.from} → ${m.to}`, warning: (m.backward ? 'Backward move. ' : '') + AUTOMATION_WARNING,
      };
    }
    case 'contact': {
      const body = { locationId, firstName: s(input.firstName, 100), lastName: s(input.lastName, 100), email: s(input.email, 200).toLowerCase(), phone: s(input.phone, 40), companyName: s(input.companyName, 200), source: 'Founders AI OS' };
      if (input.tags?.length) body.tags = input.tags.map((t) => s(t, 50)).filter(Boolean).slice(0, 10);
      for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
      if (!body.firstName && !body.email && !body.phone) throw new HttpError(400, 'Add at least a name, email or phone');
      if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) throw new HttpError(400, 'That email does not look right');
      return { method: 'POST', path: '/contacts/', scope: 'contacts.write', body, summary: `New contact: ${[body.firstName, body.lastName].filter(Boolean).join(' ') || body.email || body.phone}`, warning: AUTOMATION_WARNING };
    }
    case 'social_draft': {
      const summary = s(input.text, 63000);
      if (!summary) throw new HttpError(400, 'The post is empty');
      const body = { summary, status: 'draft', type: 'post', accountIds: (input.accountIds || []).map((x) => s(x, 200)).filter(Boolean), media: [] };
      return { method: 'POST', path: `/social-media-posting/${encodeURIComponent(locationId)}/posts`, scope: 'socialplanner/post.write', body,
        summary: `Social Planner draft: ${s(input.title, 80) || summary.slice(0, 60)}`, warning: 'Saved as a draft only. Nothing is published until you schedule it in HighLevel.' };
    }
    case 'email_template': {
      const text = s(input.body, 100000);
      if (!text) throw new HttpError(400, 'The email is empty');
      const body = { name: `OS · ${s(input.name, 100) || 'Email'}`, editorType: 'html', editorContent: toHtml(text), subjectLine: s(input.subject, 200) || undefined, previewText: s(input.previewText, 200) || undefined };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      return { method: 'POST', path: `/emails/locations/${encodeURIComponent(locationId)}/templates`, scope: 'emails/templates.write', body,
        summary: `Email template: ${body.name}`, warning: 'Saved as a template only. HighLevel sends nothing until you use it.' };
    }
    case 'custom_value': {
      const name = s(input.name, 100);
      if (!/^OS_[A-Za-z0-9_]+$/.test(name)) throw new HttpError(400, 'Custom value names must start with OS_ and use only letters, numbers and _');
      const body = { name, value: s(input.value, 5000) };
      const id = input.id ? s(input.id, 64) : null;
      return { method: id ? 'PUT' : 'POST', path: `/locations/${encodeURIComponent(locationId)}/customValues${id ? '/' + encodeURIComponent(id) : ''}`, scope: 'locations/customValues.write', body,
        summary: `${id ? 'Update' : 'Create'} custom value ${name}`, warning: 'Anything in HighLevel that uses this custom value will show the new text.' };
    }
    case 'product': {
      const name = s(input.name, 200);
      if (!name) throw new HttpError(400, 'The product needs a name');
      const amount = Number(input.price);
      const steps = [{ method: 'POST', path: '/products/', scope: 'products.write', body: { name, locationId, productType: 'SERVICE', description: s(input.description, 2000) || undefined, availableInStore: false }, saveAs: 'productId', idFrom: ['_id', 'product._id', 'id'] }];
      if (Number.isFinite(amount) && amount > 0) {
        const recurring = input.cadence === 'month' || input.cadence === 'year';
        steps.push({ method: 'POST', path: '/products/{productId}/price', scope: 'products/prices.write', body: { name: `${name} ${recurring ? (input.cadence === 'month' ? 'monthly' : 'yearly') : 'price'}`, type: recurring ? 'recurring' : 'one_time', currency: s(input.currency, 3) || 'USD', amount, locationId, ...(recurring ? { recurring: { interval: input.cadence, intervalCount: 1 } } : {}) } });
      }
      for (const st of steps) for (const k of Object.keys(st.body)) if (st.body[k] === undefined) delete st.body[k];
      return { steps, scope: 'products.write', summary: `Product: ${name}${steps.length > 1 ? ` with ${amount} ${steps[1].body.currency}${steps[1].body.recurring ? ' per ' + input.cadence : ''}` : ''}`,
        warning: 'Creates a product in HighLevel Payments. Check the price amount: HighLevel shows it in the currency you see here.' };
    }
    case 'course': {
      const p = input.program || {};
      if (!s(p.name, 200) || !(p.modules || []).length) throw new HttpError(400, 'The program needs a name and at least one module');
      const body = { locationId, products: [{ title: s(p.name, 200), description: s(p.description, 2000) || s(p.name, 200), categories: (p.modules || []).slice(0, 30).map((m) => ({
        title: s(m.title, 200), visibility: 'draft', posts: (m.lessons || []).slice(0, 50).map((l) => ({ title: s(l.title, 200), visibility: 'draft', contentType: 'video', description: s(l.summary || l.body || l.title, 5000) })),
      })) }] };
      return { method: 'POST', path: '/courses/courses-exporter/public/import', scope: 'courses.write', body, summary: `Draft course: ${body.products[0].title}`, warning: 'Imported as a draft course. Every module and lesson is set to draft, so nothing is visible to members until you publish it.' };
    }
    case 'funnel_bundle': {
      const steps = [];
      if (input.product?.name) steps.push(...buildWrite('product', input.product, { locationId }).steps);
      for (const e of (input.emails || []).slice(0, 6)) {
        const w = buildWrite('email_template', { name: `${s(input.funnelName, 80)} · ${s(e.subject, 80)}`, subject: e.subject, previewText: e.preview, body: e.body }, { locationId });
        steps.push({ method: w.method, path: w.path, scope: w.scope, body: w.body });
      }
      for (const [name, value] of Object.entries(input.customValues || {})) {
        const w = buildWrite('custom_value', { name, value }, { locationId });
        steps.push({ method: w.method, path: w.path, scope: w.scope, body: w.body });
      }
      if (!steps.length) throw new HttpError(400, 'Nothing to send');
      return { steps, scope: [...new Set(steps.map((x) => x.scope))].join(', '), summary: `Funnel "${s(input.funnelName, 80)}": ${steps.length} items`,
        warning: 'Creates a product and price, email templates and OS_ custom values. Templates are not sent to anyone.' };
    }
    default:
      throw new HttpError(400, 'Unknown write action');
  }
}

export async function loadBoard(token, locationId, pipelineId) {
  const { pipelines = [] } = await hlFetch(token, '/opportunities/pipelines', { query: { locationId }, scope: 'opportunities.readonly' });
  const pipeline = pickPipeline(pipelines, pipelineId);
  if (!pipeline) return { pipelines: [], pipeline: null, stages: [], opportunities: [] };
  const stages = sortStages(pipeline);
  const opportunities = [];
  for (let page = 1; page <= 5; page++) {
    const r = await hlFetch(token, '/opportunities/search', { query: { locationId, pipelineId: pipeline.id, status: 'all', limit: 100, page }, scope: 'opportunities.readonly' });
    opportunities.push(...(r.opportunities || []).map(slimOpportunity));
    if (!r.meta?.nextPage || (r.opportunities || []).length < 100) break;
  }
  return { pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })), pipeline: { id: pipeline.id, name: pipeline.name }, stages, opportunities, truncated: opportunities.length >= 500 };
}
