// Phase 1 sample data. Every number here is demo data, not real account data.
// Names of contacts are fictional.

export const owner = { name: 'Jasinthan Ukaananthan', business: 'Ciftron', initials: 'JU' };

export const offers = [
  { id: 'o1', name: 'Lead Generation & Paid Advertising Management', price: 497, cadence: 'month', status: 'Live',
    services: ['Meta Ads campaign management', 'Lead generation strategy', 'Campaign optimization', 'Audience targeting', 'Ad creative strategy', 'Conversion tracking', 'Performance reporting', 'Lead qualification optimization'] },
  { id: 'o2', name: 'GoHighLevel CRM, Funnel & Automation Implementation', price: 97, cadence: 'month', status: 'Live',
    services: ['Landing page development', 'Lead generation funnels', 'CRM pipeline configuration', 'Email automation', 'SMS automation', 'Instagram and Facebook DM automation', 'Appointment booking workflows', 'Lead qualification systems', 'Lead nurturing sequences'] },
  { id: 'o3', name: 'AI Automation & Custom SaaS Solutions', price: 697, cadence: 'month', status: 'Live',
    services: ['AI-powered business automation', 'Custom SaaS applications', 'AI agent development', 'Workflow automation', 'AI-assisted content production', 'Business process automation', 'CRM integrations'] },
];

export const snapshot = [
  { label: 'New leads (7 days)', value: '38', delta: '+9 vs last week', dir: 'up', source: 'HighLevel' },
  { label: 'Appointments booked', value: '6', delta: '+2 vs last week', dir: 'up', source: 'HighLevel' },
  { label: 'Cost per lead', value: '$14.20', delta: '-$1.80 vs last week', dir: 'up', source: 'Meta Ads' },
  { label: 'Content in production', value: '9', delta: '3 due this week', dir: '', source: 'OS' },
];

export const agents = [
  { id: 'cos', name: 'Chief of Staff', role: 'Routes work to the right agent', initials: 'CS', pinned: true, enabled: true,
    instructions: 'Read Brand DNA. Break requests into tasks, pick the right specialist, and collect their drafts into Approvals. Never publish or send.' },
  { id: 'cs', name: 'Content Strategist', role: 'Content and creative production', initials: 'CT', enabled: true, primary: true,
    instructions: 'Research content, develop hooks, write scripts, generate ideas, write ad copy variations, prepare carousels and organize production. Use English or Quebec French when asked. No forced sales pitch. Never invent results.' },
  { id: 'res', name: 'Researcher', role: 'Public research and outliers', initials: 'RS', enabled: false },
  { id: 'cw', name: 'Copywriter', role: 'Ads, pages and posts', initials: 'CW', enabled: false },
  { id: 'des', name: 'Designer', role: 'Graphics and thumbnails', initials: 'DS', enabled: false },
  { id: 'fb', name: 'Funnel Builder', role: 'Pages and funnel structure', initials: 'FB', enabled: false },
  { id: 'em', name: 'Email Writer', role: 'Sequences and templates', initials: 'EW', enabled: false },
  { id: 'crm', name: 'CRM Assistant', role: 'Pipeline and automation planning', initials: 'CR', enabled: false },
  { id: 'ma', name: 'Marketing Analyst', role: 'Meta Ads and conversion analysis', initials: 'MA', enabled: false },
  { id: 'am', name: 'Ads Manager', role: 'Meta campaigns, audiences and tests', initials: 'AM', enabled: true },
  { id: 'vp', name: 'Video Producer', role: 'Video and AI video production', initials: 'VP', enabled: true },
  { id: 'sc', name: 'Sales Coach', role: 'Call prep, scripts and objections', initials: 'SC', enabled: true },
  { id: 'os', name: 'Offer Strategist', role: 'Offers, pricing and lead magnets', initials: 'OS', enabled: true },
  { id: 'ow', name: 'Outreach Writer', role: 'Cold email, DMs and call scripts', initials: 'OW', enabled: true },
  { id: 'cs2', name: 'Client Success', role: 'Onboarding, updates and reports', initials: 'CS', enabled: false },
  { id: 'fl', name: 'Quebec French Localizer', role: 'Natural Quebec French versions', initials: 'FR', enabled: true },
  { id: 'pm', name: 'Project Manager', role: 'Weekly plans and priorities', initials: 'PM', enabled: true },
];

export const agentThreads = {
  cos: [
    { from: 'me', text: 'Plan next week of content for mortgage brokers. Two Reels, one carousel, one LinkedIn post.' },
    { from: 'ai', text: 'Routed to Content Strategist. I asked for hooks first so you can pick angles before scripts are written. 4 drafts will land in Approvals.' },
  ],
  cs: [
    { from: 'me', text: 'Give me 5 Reel hooks for mortgage brokers who get leads but never book calls.' },
    { from: 'ai', html: '<p>Five hooks, saved to Approvals as one item:</p><ol><li>Your leads are not cold. Your follow-up is slow.</li><li>A lead that waits 2 hours for a reply has already called someone else.</li><li>Three messages every mortgage lead should get in the first 10 minutes.</li><li>You do not need more leads this month. You need fewer leaks.</li><li>What happens after someone fills out your form? Walk me through it.</li></ol><p class="small muted">Hook 2 uses a timing claim. I flagged it so you can confirm or remove it.</p>' },
  ],
};

export const agentHistory = {
  cos: ['Weekly content plan (routed)', 'Funnel audit request (routed)'],
  cs: ['5 Reel hooks: mortgage follow-up', 'Carousel: 7 lead leaks', 'Meta ad copy: 6 variations (FR-QC)', 'Script: AI receptionist explainer'],
};

export let approvals = [
  { id: 'a1', title: '5 Reel hooks: mortgage follow-up', type: 'Hooks', agent: 'Content Strategist', target: 'Content', tags: ['mortgage', 'reels'], status: 'pending', age: '12 min', lang: 'EN',
    body: '1. Your leads are not cold. Your follow-up is slow.\n2. A lead that waits 2 hours for a reply has already called someone else. [CHECK: timing claim]\n3. Three messages every mortgage lead should get in the first 10 minutes.\n4. You do not need more leads this month. You need fewer leaks.\n5. What happens after someone fills out your form? Walk me through it.' },
  { id: 'a2', title: 'Carousel: 7 places leads leak out of your funnel', type: 'Carousel', agent: 'Content Strategist', target: 'Content', tags: ['lead gen', 'carousel'], status: 'pending', age: '1 h', lang: 'EN',
    body: 'Slide 1: 7 places your leads leak out\nSlide 2: The form asks too much\nSlide 3: Nobody replies for hours\nSlide 4: No reminder before the call\nSlide 5: The ad promises one thing, the page says another\nSlide 6: No second offer for people who are not ready\nSlide 7: Nobody tracks where leads came from\nSlide 8: Which one is costing you the most? Comment LEAK.' },
  { id: 'a3', title: 'Meta ad copy: private lending, 6 variations', type: 'Ad copy', agent: 'Content Strategist', target: 'Content', tags: ['meta ads', 'fr-qc'], status: 'pending', age: '3 h', lang: 'FR-QC',
    body: 'V1: Propriétaire au Québec? Découvrez si un prêt privé peut vous aider à consolider vos dettes.\nV2: Votre banque a dit non? Parlons de vos options.\nV3: Utilisez l’équité de votre maison. Réponse rapide, sans engagement.\n... 3 more variations' },
  { id: 'a4', title: 'Script: AI receptionist explainer (60s)', type: 'Video script', agent: 'Content Strategist', target: 'Content', tags: ['ai automation', 'script'], status: 'pending', age: 'Yesterday', lang: 'EN',
    body: 'HOOK: You missed 3 calls while you were with a client today.\nPOINT: An AI receptionist answers, qualifies and books while you work.\nDEMO: Show the HighLevel calendar filling in.\nCTA: Comment RECEPTION and I will send you the setup checklist.' },
  { id: 'a5', title: 'Welcome sequence for Offer 2 (5 emails)', type: 'Email sequence', agent: 'Content Strategist', target: 'Emails', tags: ['email', 'onboarding'], status: 'pending', age: 'Yesterday', lang: 'EN',
    body: 'Email 1: Welcome, here is what happens this week\nEmail 2: What I need from you to start\nEmail 3: Your pipeline stages explained\nEmail 4: First automation goes live\nEmail 5: Check-in call' },
  { id: 'a6', title: 'LinkedIn post: why your CRM is empty', type: 'Written post', agent: 'Content Strategist', target: 'Content', tags: ['linkedin', 'crm'], status: 'approved', age: '2 days', lang: 'EN', body: 'Most CRMs are not empty because of bad leads...' },
  { id: 'a7', title: 'Thumbnail ideas: Meta Ads audit', type: 'Graphics', agent: 'Content Strategist', target: 'Graphics', tags: ['youtube'], status: 'passed', age: '3 days', lang: 'EN', body: '3 thumbnail concepts' },
];

export const contentStages = ['Idea', 'Scripting', 'Filming', 'Editing', 'Scheduled'];
export let contentItems = [
  { id: 'c1', title: 'Your follow-up is slow, not your leads', format: 'Short video', stage: 'Scripting', date: '2026-11-25', hook: 'Your leads are not cold. Your follow-up is slow.', channel: 'Instagram', lang: 'EN', tasks: { script: true, film: false, edit: false, thumbnail: false, upload: false }, notes: 'Film at the new desk setup.' },
  { id: 'c2', title: '7 places leads leak out', format: 'Carousel', stage: 'Editing', date: '2026-11-26', hook: '7 places your leads leak out', channel: 'Instagram', lang: 'EN', tasks: { script: true, film: true, edit: false, thumbnail: false, upload: false }, notes: '' },
  { id: 'c3', title: 'Prêt privé: 3 questions à poser', format: 'Short video', stage: 'Filming', date: '2026-11-27', hook: 'Avant de signer un prêt privé, posez ces 3 questions.', channel: 'Facebook', lang: 'FR-QC', tasks: { script: true, film: false, edit: false, thumbnail: false, upload: false }, notes: 'Quebec French, informal tone.' },
  { id: 'c4', title: 'Why your CRM is empty', format: 'Written post', stage: 'Scheduled', date: '2026-11-24', hook: 'Most CRMs are not empty because of bad leads.', channel: 'LinkedIn', lang: 'EN', tasks: { script: true, film: true, edit: true, thumbnail: true, upload: false }, notes: '' },
  { id: 'c5', title: 'AI receptionist explainer', format: 'Short video', stage: 'Idea', date: '2026-12-02', hook: 'You missed 3 calls today.', channel: 'Instagram', lang: 'EN', tasks: { script: false, film: false, edit: false, thumbnail: false, upload: false }, notes: '' },
  { id: 'c6', title: 'Meta Ads audit walkthrough', format: 'Long video', stage: 'Idea', date: '2026-12-04', hook: 'I audited a real estate ad account. Here is what I found.', channel: 'YouTube', lang: 'EN', tasks: { script: false, film: false, edit: false, thumbnail: false, upload: false }, notes: 'Use a test account, no client data.' },
  { id: 'c7', title: 'Booking workflow in HighLevel', format: 'Carousel', stage: 'Scripting', date: '2026-11-29', hook: 'The 4-step booking flow I set up for every client', channel: 'Instagram', lang: 'EN', tasks: { script: false, film: false, edit: false, thumbnail: false, upload: false }, notes: '' },
  { id: 'c8', title: 'Lead magnet: 10-minute lead response checklist', format: 'Email', stage: 'Editing', date: '2026-11-28', hook: 'What to send a new lead in the first 10 minutes', channel: 'Email', lang: 'EN', tasks: { script: true, film: true, edit: false, thumbnail: false, upload: false }, notes: '' },
  { id: 'c9', title: 'Mortgage broker DM automation', format: 'Short video', stage: 'Filming', date: '2026-11-30', hook: 'Reply to every DM in under a minute', channel: 'Instagram', lang: 'EN', tasks: { script: true, film: false, edit: false, thumbnail: false, upload: false }, notes: '' },
];

export const creators = [
  { handle: '@sample.growth.agency', platform: 'Instagram', median: 4200, tracked: true },
  { handle: '@sample.mortgage.coach', platform: 'Instagram', median: 1800, tracked: true },
  { handle: '@sample.ghl.builder', platform: 'YouTube', median: 3100, tracked: true },
  { handle: '@ciftron (you)', platform: 'Instagram', median: 950, tracked: true, mine: true },
];
export const outliers = [
  { creator: '@sample.mortgage.coach', title: 'The 3 texts I send every new lead', views: 21400, median: 1800, format: 'Reel', posted: '4 days ago' },
  { creator: '@sample.growth.agency', title: 'Stop boosting posts. Do this instead.', views: 38900, median: 4200, format: 'Reel', posted: '1 week ago' },
  { creator: '@sample.ghl.builder', title: 'I rebuilt a funnel in 20 minutes', views: 14800, median: 3100, format: 'Long video', posted: '2 weeks ago' },
  { creator: '@ciftron (you)', title: 'Why your ads get clicks but no calls', views: 4100, median: 950, format: 'Reel', posted: '6 days ago' },
  { creator: '@sample.growth.agency', title: 'My client onboarding checklist', views: 6100, median: 4200, format: 'Carousel', posted: '3 days ago' },
];
export let learningSignals = [
  { id: 's1', text: 'You approve hooks that name a specific leak (slow reply, long form)', weight: 'High', from: '14 approvals', state: 'on' },
  { id: 's2', text: 'You cut the last sentence of captions that end with a pitch', weight: 'Medium', from: '9 edits', state: 'on' },
  { id: 's3', text: 'Reels under 35 seconds outperform your median', weight: 'Medium', from: 'Social Planner stats', state: 'on' },
  { id: 's4', text: 'You pass on ideas about generic motivation', weight: 'Low', from: '6 passes', state: 'paused' },
];

export const funnels = [
  { id: 'f1', name: 'Meta Ads review call (15 min)', type: 'Appointment booking funnel', offer: 'o1', version: 3, status: 'Draft', updated: 'Today' },
  { id: 'f2', name: 'CRM setup for service businesses', type: 'Lead generation funnel', offer: 'o2', version: 1, status: 'Draft', updated: '3 days ago' },
  { id: 'f3', name: 'AI receptionist checklist', type: 'Lead magnet funnel', offer: 'o3', version: 2, status: 'Sent to HighLevel', updated: 'Last week' },
];

export const emailTemplates = [
  { id: 'welcome', name: 'Welcome', count: 5, desc: 'First week after someone joins or buys.' },
  { id: 'nurture', name: 'Nurture', count: 6, desc: 'Teach and build trust with new leads.' },
  { id: 'cart', name: 'Abandoned cart', count: 3, desc: 'Reminders for people who left checkout.' },
  { id: 'upsell', name: 'Upsell', count: 3, desc: 'Next offer after a purchase.' },
  { id: 'reminder', name: 'Call reminders', count: 4, desc: 'Before and after a booked call.' },
  { id: 'onboarding', name: 'Onboarding', count: 5, desc: 'Steps a new client needs to complete.' },
  { id: 'launch', name: 'Launch', count: 7, desc: 'Announce, open, remind and close.' },
];
export const sampleSequence = [
  { n: 1, subject: 'Your call is booked, here is what to bring', day: 'Immediately', body: 'Hi NAME,\n\nYour call about OFFER NAME is booked for CALL TIME.\n\nTo make the 15 minutes useful, have these ready:\n- Your current monthly ad spend\n- How leads reach you today\n- What happens after someone fills out your form\n\nTalk soon,\nJasinthan' },
  { n: 2, subject: 'Tomorrow: quick reminder', day: '24 h before', body: 'Hi NAME,\n\nQuick reminder that we talk tomorrow at CALL TIME.\n\nIf the time no longer works, you can move it here: RESCHEDULE LINK\n\nJasinthan' },
  { n: 3, subject: 'Starting in 1 hour', day: '1 h before', body: 'Hi NAME,\n\nWe start in one hour. Here is the link: MEETING LINK\n\nJasinthan' },
  { n: 4, subject: 'Thanks for the call', day: '2 h after', body: 'Hi NAME,\n\nThanks for your time today. As promised, here is the summary of what we covered: SUMMARY\n\nIf you want to move forward with OFFER NAME, reply to this email and I will send next steps.\n\nJasinthan' },
];

export const pipelineStages = ['New Lead', 'Lead Engaged', 'Lead Form Submitted', 'Qualification Pending', 'Qualified Lead', 'Appointment Booked', 'Appointment Completed', 'Proposal / Offer Sent', 'Won / Enrolled', 'Lost / Not Qualified'];
export let opportunities = [
  { id: 'p1', name: 'Marc Tremblay', company: 'Tremblay Hypothèques', stage: 0, value: 497, source: 'Meta lead form', tags: ['mortgage', 'fr'], email: 'marc@example.com', phone: '+1 514 555 0101', added: 'Today' },
  { id: 'p2', name: 'Priya Natarajan', company: 'Natarajan Realty', stage: 0, value: 97, source: 'Instagram DM', tags: ['real estate'], email: 'priya@example.com', phone: '+1 416 555 0102', added: 'Today' },
  { id: 'p3', name: 'Daniel Okafor', company: 'Okafor Roofing', stage: 1, value: 97, source: 'Cold call', tags: ['contractor'], email: 'daniel@example.com', phone: '+1 647 555 0103', added: 'Yesterday' },
  { id: 'p4', name: 'Sophie Gagnon', company: 'Capital Privé QC', stage: 2, value: 497, source: 'Landing page', tags: ['private lender', 'fr'], email: 'sophie@example.com', phone: '+1 418 555 0104', added: '2 days ago' },
  { id: 'p5', name: 'Kevin Liu', company: 'Liu Med Spa', stage: 3, value: 497, source: 'Cold email', tags: ['med spa'], email: 'kevin@example.com', phone: '+1 905 555 0105', added: '3 days ago' },
  { id: 'p6', name: 'Amélie Roy', company: 'Roy Immobilier', stage: 4, value: 697, source: 'Referral', tags: ['real estate', 'fr'], email: 'amelie@example.com', phone: '+1 450 555 0106', added: '4 days ago' },
  { id: 'p7', name: 'Jordan Blake', company: 'Blake Landscaping', stage: 5, value: 97, source: 'Meta lead form', tags: ['contractor'], email: 'jordan@example.com', phone: '+1 305 555 0107', added: '5 days ago' },
  { id: 'p8', name: 'Fatima Haddad', company: 'Haddad Mortgage Group', stage: 5, value: 497, source: 'Free consultation', tags: ['mortgage'], email: 'fatima@example.com', phone: '+1 613 555 0108', added: '1 week ago' },
  { id: 'p9', name: 'Luc Bélanger', company: 'Bélanger Investissements', stage: 6, value: 697, source: 'Webinar', tags: ['investor', 'fr'], email: 'luc@example.com', phone: '+1 819 555 0109', added: '1 week ago' },
  { id: 'p10', name: 'Hannah Steele', company: 'Steele Painting', stage: 7, value: 97, source: 'Cold call', tags: ['contractor'], email: 'hannah@example.com', phone: '+1 416 555 0110', added: '2 weeks ago' },
  { id: 'p11', name: 'Omar Siddiqui', company: 'Northline Lending', stage: 8, value: 497, source: 'Referral', tags: ['private lender'], email: 'omar@example.com', phone: '+1 905 555 0111', added: '3 weeks ago' },
  { id: 'p12', name: 'Claire Dubois', company: 'Dubois Courtage', stage: 9, value: 97, source: 'Meta lead form', tags: ['mortgage', 'fr'], email: 'claire@example.com', phone: '+1 514 555 0112', added: '3 weeks ago' },
];

export const factCategories = ['identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say'];
export const factLabels = { identity: 'Identity', offers: 'Offers', audience: 'Audience', voice: 'Voice', beliefs: 'Beliefs', proof: 'Proof', goals: 'Goals', tools: 'Tools', never_say: 'Never say' };
export let facts = [
  { id: 'k1', cat: 'identity', text: 'Jasinthan runs Ciftron, a digital marketing, growth and AI automation business.', status: 'approved', starred: true, source: 'about_me' },
  { id: 'k2', cat: 'identity', text: 'Serves Canada, including Quebec, and takes international clients.', status: 'approved', starred: false, source: 'about_me' },
  { id: 'k3', cat: 'offers', text: 'Lead Generation & Paid Advertising Management is 497 USD per month.', status: 'approved', starred: true, source: 'about_me' },
  { id: 'k4', cat: 'offers', text: 'GoHighLevel CRM, Funnel & Automation Implementation is 97 USD per month.', status: 'approved', starred: false, source: 'about_me' },
  { id: 'k5', cat: 'offers', text: 'AI Automation & Custom SaaS Solutions is 697 USD per month.', status: 'approved', starred: false, source: 'about_me' },
  { id: 'k6', cat: 'audience', text: 'Main audience: mortgage brokers, private lenders, real estate professionals and service businesses.', status: 'approved', starred: true, source: 'about_me' },
  { id: 'k7', cat: 'audience', text: 'Many leads come from Meta lead forms and Instagram DMs.', status: 'proposed', starred: false, source: 'Sales call notes.pdf' },
  { id: 'k8', cat: 'voice', text: 'Plain, human and specific. Short sentences. No hype.', status: 'approved', starred: true, source: 'Writing samples' },
  { id: 'k9', cat: 'voice', text: 'Writes Quebec French in an informal tutoiement tone for social content.', status: 'proposed', starred: false, source: 'FR captions.txt' },
  { id: 'k10', cat: 'beliefs', text: 'Most businesses do not need more leads first. They need faster follow-up.', status: 'proposed', starred: false, source: 'Podcast transcript' },
  { id: 'k11', cat: 'proof', text: 'Has built webinar funnels for clients. [ADD: a real, sourced result before using as proof]', status: 'proposed', starred: false, source: 'Case notes.pdf' },
  { id: 'k12', cat: 'goals', text: 'Wants to grow the personal brand on Instagram, Facebook and LinkedIn.', status: 'approved', starred: false, source: 'about_me' },
  { id: 'k13', cat: 'tools', text: 'Uses GoHighLevel, Meta Ads Manager, Anthropic and OpenAI.', status: 'approved', starred: false, source: 'about_me' },
  { id: 'k14', cat: 'never_say', text: 'Never use em dashes, hype words or "it’s not X, it’s Y" lines.', status: 'approved', starred: true, source: 'Guardrails' },
  { id: 'k15', cat: 'never_say', text: 'Never promise a number of leads or a guaranteed result.', status: 'proposed', starred: false, source: 'Guardrails' },
  { id: 'k16', cat: 'proof', text: 'Helped clients double booked calls in 30 days.', status: 'rejected', starred: false, source: 'AI guess (no source)' },
];
export const sources = [
  { name: 'about_me (build prompt)', type: 'Text', size: '6 KB', chunks: 14, facts: 11, added: 'Today' },
  { name: 'Sales call notes.pdf', type: 'PDF', size: '420 KB', chunks: 38, facts: 3, added: 'Today' },
  { name: 'Podcast transcript.txt', type: 'Transcript', size: '88 KB', chunks: 61, facts: 4, added: 'Yesterday' },
  { name: 'FR captions.txt', type: 'Writing sample', size: '12 KB', chunks: 9, facts: 2, added: 'Yesterday' },
  { name: 'engine.ciftron.com/growth-engine', type: 'Link', size: '', chunks: 22, facts: 5, added: '2 days ago' },
  { name: 'Case notes.pdf', type: 'PDF', size: '210 KB', chunks: 12, facts: 2, added: '3 days ago' },
];
export const styleGuide = {
  summary: 'Direct and practical. Talks to one business owner at a time. Names the problem in concrete terms before giving the fix.',
  rules: ['Short sentences, one idea each', 'Use real numbers only when sourced', 'Open with the problem the reader already feels', 'End with one clear next step, not a pitch', 'Quebec French: informal, tutoiement on social, vouvoiement in emails to new leads'],
  avoid: ['Em dashes', 'Hype words like game-changer or skyrocket', '"It’s not X, it’s Y" lines', 'Filler like "In today’s fast-paced world"'],
  examples: ['Your leads are not cold. Your follow-up is slow.', 'Here is what I would fix first.'],
};

export const graphics = [
  { id: 'g1', fmt: 'Instagram feed post', size: '1080 × 1350', ratio: '4/5', style: '', k: 'Lead gen', h: '7 places your leads leak out', v: 2 },
  { id: 'g2', fmt: 'Instagram Story', size: '1080 × 1920', ratio: '9/16', style: 'lime', k: 'Free checklist', h: 'The AI receptionist setup', v: 1 },
  { id: 'g3', fmt: 'Meta Ads graphic', size: '1080 × 1080', ratio: '1/1', style: 'light', k: 'Prêt privé', h: 'Votre banque a dit non?', v: 3 },
  { id: 'g4', fmt: 'YouTube thumbnail', size: '1280 × 720', ratio: '16/9', style: '', k: 'Audit', h: 'I audited a real estate ad account', v: 1 },
  { id: 'g5', fmt: 'LinkedIn graphic', size: '1200 × 627', ratio: '1200/627', style: 'light', k: 'CRM', h: 'Why your CRM is empty', v: 1 },
  { id: 'g6', fmt: 'Carousel slide', size: '1080 × 1350', ratio: '4/5', style: 'lime', k: 'Slide 1 of 8', h: 'Your follow-up is slow', v: 2 },
];
export const graphicSizes = {
  'Instagram feed post': '1080 × 1350', 'Instagram Story': '1080 × 1920', 'Facebook feed post': '1080 × 1080', 'Carousel slide': '1080 × 1350',
  'Meta Ads graphic': '1080 × 1080', 'YouTube thumbnail': '1280 × 720', 'LinkedIn graphic': '1200 × 627',
};

export const programs = [
  { id: 'pr1', name: 'GHL Lead System Bootcamp', stage: 'Draft', modules: [
    { name: 'Module 1: Pipeline foundations', lessons: ['Mapping your stages', 'Custom fields that matter', 'Tags vs stages'] },
    { name: 'Module 2: Booking workflows', lessons: ['Calendar setup', 'Reminder sequence', 'No-show recovery'] },
    { name: 'Module 3: Lead qualification', lessons: ['Qualification forms', 'Scoring rules'] },
  ], notes: 'Private: test with 3 contractors before selling.' },
  { id: 'pr2', name: 'Meta Ads for Mortgage Brokers', stage: 'Idea', modules: [
    { name: 'Module 1: Offer and audience', lessons: ['Compliance basics', 'Audience setup'] },
  ], notes: '' },
];

export const vault = [
  { id: 'v1', kind: 'URL', title: 'Clean SaaS pricing page layout', from: 'example-saas.com/pricing', note: 'Like the 3-column comparison and FAQ under it.', briefed: true },
  { id: 'v2', kind: 'Screenshot', title: 'Carousel with one bold line per slide', from: 'Instagram screenshot', note: 'Typography rhythm, not the words.', briefed: false },
  { id: 'v3', kind: 'Text', title: 'Cold email opener that names a specific leak', from: 'Pasted text', note: 'The structure: observation, question, one ask.', briefed: true },
  { id: 'v4', kind: 'URL', title: 'Webinar registration page', from: 'example-webinar.com', note: 'Short form above the fold.', briefed: false },
  { id: 'v5', kind: 'Screenshot', title: 'Reel opening with a text-on-screen question', from: 'Instagram screenshot', note: 'Pacing of the first 3 seconds.', briefed: false },
];

export let goals = [
  { id: 'gl1', raw: 'Generate 100 qualified leads', target: '100 contacts reaching "Qualified Lead" by Dec 31, 2026', current: 41, total: 100, unit: 'leads', source: 'HighLevel', checklist: [
    { t: 'Launch Meta campaign for Offer 1 audience', done: true }, { t: 'Add qualification form to consultation funnel', done: true }, { t: 'Publish 3 lead gen Reels per week', done: false }, { t: 'Review cost per qualified lead every Monday', done: false }] },
  { id: 'gl2', raw: 'Book 15 qualified appointments', target: '15 opportunities reaching "Appointment Booked" in December', current: 6, total: 15, unit: 'appointments', source: 'HighLevel', checklist: [
    { t: 'Turn on reminder sequence', done: true }, { t: 'Follow up every qualified lead within 10 minutes', done: false }, { t: 'Add DM automation for "BOOK" keyword', done: false }] },
  { id: 'gl3', raw: 'Publish 20 pieces of content', target: '20 content cards marked Uploaded in December', current: 7, total: 20, unit: 'pieces', source: 'OS Content', checklist: [
    { t: 'Batch film 6 Reels', done: false }, { t: 'Schedule 2 LinkedIn posts per week', done: true }] },
  { id: 'gl4', raw: 'Reduce cost per lead', target: 'Meta cost per lead below $12.00 (now $14.20)', current: 42, total: 100, unit: '% of the way', source: 'Meta Ads', checklist: [
    { t: 'Test 3 new hooks from Content', done: false }, { t: 'Pause ad sets above $20 CPL', done: true }] },
];

export let connections = [
  { id: 'hl', name: 'HighLevel', desc: 'Private Integration token and Location ID. Read context, pipeline and confirmed drafts.', cat: 'CRM', connected: true, fields: ['Private Integration token', 'Location ID'], detail: 'Ciftron sub-account' },
  { id: 'meta', name: 'Meta Ads', desc: 'Read-only Marketing API. Campaigns, ad sets, spend, leads and cost per lead.', cat: 'Ads', connected: true, fields: ['System user access token', 'Ad account ID'], detail: 'act_••••4821 (read-only)' },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude models for chat, agents and Brain.', cat: 'AI', connected: true, fields: ['API key'], detail: 'Key ending ••7Qf' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT models and embeddings for Brain search.', cat: 'AI', connected: true, fields: ['API key'], detail: 'Key ending ••x2A' },
  { id: 'openrouter', name: 'OpenRouter', desc: 'Image generation and extra models.', cat: 'AI', connected: false, fields: ['API key'] },
  { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Voice for Jarvis.', cat: 'Voice', connected: false, fields: ['API key', 'Voice ID'] },
  { id: 'apify', name: 'Apify', desc: 'Public social research for the Content module.', cat: 'Research', connected: false, fields: ['API token'] },
  { id: 'youtube', name: 'YouTube', desc: 'Public channel stats for research.', cat: 'Research', connected: false, fields: ['API key'] },
  { id: 'mcp', name: 'Custom MCP server', desc: 'Connect another MCP server, or let Claude Code and Codex work inside the OS.', cat: 'MCP', connected: false, fields: ['Server URL', 'Token'] },
];

export const writeLog = [
  { when: 'Nov 19, 4:12 PM', action: 'Social draft', target: 'Social Planner (draft)', status: 'Sent' },
  { when: 'Nov 18, 11:03 AM', action: 'Pipeline move', target: 'Fatima Haddad → Appointment Booked', status: 'Sent' },
  { when: 'Nov 15, 2:40 PM', action: 'Email template', target: 'Call reminder 24h', status: 'Sent' },
];
