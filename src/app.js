import data from './data/cohort.json';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const state = {
  view: 'teams', filter: 'all', search: '', personSearch: '',
  saved: new Set(JSON.parse(localStorage.getItem('sr-saved') || '[]')),
  visitorShape: localStorage.getItem('sr-shape') || 'prism'
};
const teamById = new Map(data.teams.map(t => [t.id, t]));
const clusterById = new Map(data.clusters.map(c => [c.id, c]));

function shapeSVG(shape = 'prism', className = '') {
  const common = `viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true" class="${className}"`;
  if (shape === 'hex') return `<svg ${common}><path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z"/><path d="m6 13.5 18 10.6 18-10.6M24 24v21"/></svg>`;
  if (shape === 'torus') return `<svg ${common}><ellipse cx="24" cy="24" rx="20" ry="12"/><ellipse cx="24" cy="24" rx="8" ry="4.5"/><path d="M10 15.5c2.2 6 5.2 10.2 14 13 8.8-2.8 11.8-7 14-13M10 32.5c2.2-6 5.2-10.2 14-13 8.8 2.8 11.8 7 14 13"/></svg>`;
  if (shape === 'prism') return `<svg ${common}><path d="M24 3 43 37 24 45 5 37Z"/><path d="m24 3 0 42M5 37l19-12 19 12"/></svg>`;
  return `<svg ${common}><circle cx="24" cy="24" r="19"/><path d="M5 24h38M24 5v38"/></svg>`;
}

function saveState() {
  localStorage.setItem('sr-saved', JSON.stringify([...state.saved]));
  $('#saved-count').textContent = state.saved.size;
}

function setView(view) {
  state.view = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'saved') renderSaved();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  history.replaceState(null, '', `#${view}`);
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

function cardHTML(t, reason = '') {
  const cluster = t.cluster ? clusterById.get(t.cluster) : null;
  const now = t.now || t.traction || 'Building toward the final demo.';
  return `<article class="team-card" data-team="${esc(t.id)}" tabindex="0" aria-label="Open ${esc(t.name)} details">
    <div class="card-top"><span class="shape-glyph">${shapeSVG(t.shape)}</span><button class="save-button ${state.saved.has(t.id) ? 'saved' : ''}" data-save="${esc(t.id)}" aria-label="${state.saved.has(t.id) ? 'Remove' : 'Save'} ${esc(t.name)}"></button></div>
    <h3>${esc(t.name)}</h3><div class="team-focus">${esc(t.focus || t.domain)}</div>
    ${reason ? `<p class="reason">${esc(reason)}</p>` : `<p class="team-now">${esc(now)}</p>`}
    <div class="card-meta"><span>${esc(t.geo || 'NYC')}</span><span>${esc(cluster?.label || t.domain || 'cohort')}</span></div>
  </article>`;
}

function bindCards(root = document) {
  $$('[data-team]', root).forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('[data-save]')) openTeam(card.dataset.team); });
    card.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-save]')) { e.preventDefault(); openTeam(card.dataset.team); } });
  });
  $$('[data-save]', root).forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation(); const id = btn.dataset.save;
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    saveState(); renderTeams(); if (state.view === 'saved') renderSaved();
    $$('[data-save]').filter(candidate => candidate.dataset.save === id).forEach(candidate => {
      candidate.classList.toggle('saved', state.saved.has(id));
      candidate.setAttribute('aria-label', `${state.saved.has(id) ? 'Remove' : 'Save'} ${teamById.get(id)?.name || 'team'}`);
    });
  }));
}

function renderFilters() {
  const filters = [
    ['all','All teams'], ['ai','AI'], ['tee','Private compute'], ['crypto','Cryptography'], ['app-ux','Consumer'],
    ['agents','Agent systems'], ['local-first-networking','Local-first']
  ];
  $('#team-filters').innerHTML = filters.map(([id,label]) => `<button class="${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('');
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderFilters(); renderTeams(); }));
}
function renderTeams() {
  const q = state.search.trim().toLowerCase();
  const filtered = data.teams.filter(t => {
    const inFilter = state.filter === 'all' || t.domain === state.filter || (t.clusters || []).includes(state.filter);
    const hay = [t.name,t.focus,t.now,t.traction,t.domain,...t.seeking,...t.offering,...t.skillAreas].join(' ').toLowerCase();
    return inFilter && (!q || hay.includes(q));
  });
  $('#team-result-count').textContent = `${filtered.length} OF ${data.teams.length} TEAMS`;
  $('#team-grid').innerHTML = filtered.length ? filtered.map(t => cardHTML(t)).join('') : `<div class="empty-state"><h3>No shape fits that signal.</h3><p>Try a broader search or another cluster.</p></div>`;
  bindCards($('#team-grid'));
}
$('#team-search').addEventListener('input', e => { state.search = e.target.value; renderTeams(); });

function openTeam(id) {
  const t = teamById.get(id); if (!t) return;
  const deps = [...new Set([...(t.dependencies || []), ...data.dependencies.filter(d => d.source === id).map(d => d.target)])].filter(x => teamById.has(x));
  const links = Object.entries(t.links || {}).filter(([,v]) => v).map(([k,v]) => {
    let href = String(v); if (!/^https?:\/\//.test(href)) href = k === 'github' || k === 'repo' ? `https://github.com/${href}` : k === 'x' ? `https://x.com/${href.replace('@','')}` : `https://${href}`;
    return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(k)}</a>`;
  }).join('');
  const stage = t.journey?.stage || 0;
  $('#dialog-content').innerHTML = `<div class="dialog-inner"><button class="dialog-close" aria-label="Close details"></button>
    <div class="dialog-title-row"><span class="shape-glyph">${shapeSVG(t.shape)}</span><div><h2>${esc(t.name)}</h2><div class="dialog-focus">${esc(t.focus || t.domain)}</div></div></div>
    <p class="dialog-summary">${esc(t.now || t.traction || t.about || 'Building toward the final demo.')}</p>
    <div class="dialog-columns">
      <section class="dialog-section"><h3>Seeking</h3><ul>${(t.seeking.length ? t.seeking : ['Open conversation and useful feedback']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="dialog-section"><h3>Offering</h3><ul>${(t.offering.length ? t.offering : t.skillAreas).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="dialog-section"><h3>Journey / stage ${stage || 'open'}</h3><p>${esc(t.journey?.bottleneck || 'In active rotation')}</p><div class="stage-meter">${[1,2,3,4,5,6,7].map(n => `<i class="${n <= stage ? 'on' : ''}"></i>`).join('')}</div></section>
      <section class="dialog-section"><h3>Connected teams</h3><div class="dependency-links">${deps.length ? deps.map(d => `<button data-dependency="${d}">${esc(teamById.get(d).name)}</button>`).join('') : '<span>Independent node</span>'}</div></section>
    </div><div class="external-links">${links}</div></div>`;
  const dialog = $('#team-dialog');
  if (!dialog.open) dialog.showModal();
  $('.dialog-close', dialog).addEventListener('click', () => dialog.close());
  $$('[data-dependency]', dialog).forEach(b => b.addEventListener('click', () => openTeam(b.dataset.dependency)));
}
$('#team-dialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

function renderPeople() {
  const q = state.personSearch.toLowerCase();
  const people = data.people.filter(p => !q || [p.name,p.team,p.role,p.domain,...p.skillAreas,...p.goToThemFor].join(' ').toLowerCase().includes(q));
  $('#people-grid').innerHTML = people.map(p => {
    const team = teamById.get(p.team);
    const initials = p.name.split(/\s+/).slice(0,2).map(x => x[0]).join('');
    return `<article class="person-card"><span class="person-initial">${esc(initials)}</span><h3>${esc(p.name)}</h3><div class="person-team">${esc(team?.name || p.role || 'cohort')}</div><p class="person-skills">${esc((p.skillAreas || []).slice(0,3).join(' · ') || p.now || p.domain)}</p></article>`;
  }).join('');
}
$('#people-search').addEventListener('input', e => { state.personSearch = e.target.value; renderPeople(); });

function renderSchedule() {
  $('#awards-list').innerHTML = data.awardCategories.map(a => `<article><h3>${esc(a.label)}</h3><p>${esc(a.description)}</p></article>`).join('');
}
function renderSaved() {
  const teams = data.teams.filter(t => state.saved.has(t.id));
  $('#saved-grid').innerHTML = teams.length ? teams.map(t => cardHTML(t)).join('') : `<div class="empty-state"><h3>No teams saved yet.</h3><p>Use the diamond marker on any team to build your conversation list.</p><button class="text-link" data-empty-teams>Browse the cohort</button></div>`;
  bindCards($('#saved-grid')); $('[data-empty-teams]')?.addEventListener('click', () => setView('teams'));
}

const topics = [['agents','Agents + memory'],['privacy','Privacy + TEEs'],['consumer','Consumer products'],['crypto','Cryptography'],['infra','Developer infrastructure'],['mechanism','Markets + mechanisms']];
const offers = [['funding','Funding'],['design','Product + design'],['engineering','Engineering'],['distribution','Distribution'],['research','Research'],['partnerships','Partnerships']];
const intents = [['invest','Invest'],['collaborate','Collaborate'],['learn','Learn']];
function choicesHTML(items, name) { return items.map(([v,l]) => `<div class="choice"><input type="checkbox" id="${name}-${v}" name="${name}" value="${v}"><label for="${name}-${v}">${l}</label></div>`).join(''); }
$('#interest-choices').innerHTML = choicesHTML(topics,'interest'); $('#offer-choices').innerHTML = choicesHTML(offers,'offer'); $('#intent-choices').innerHTML = choicesHTML(intents,'intent');

function scoreTeam(t, interests, offersSelected, intentsSelected) {
  const text = [t.domain,t.focus,t.now,t.traction,...t.skillAreas,...t.seeking,...t.offering,(clusterById.get(t.cluster)?.label || '')].join(' ').toLowerCase();
  const maps = {
    agents:['agent','memory','inference','eliza','context'], privacy:['tee','privacy','confidential','attest','secure'], consumer:['consumer','social','speech','creative','feedback','app'], crypto:['crypto','identity','proof','lattice','mechanism'], infra:['infra','developer','runtime','database','router','local-first','network'], mechanism:['market','mechanism','fund','incentive','negotiation']
  };
  const offerMaps = { funding:['fund','invest','capital','fundraising'], design:['design','ux','product'], engineering:['engineer','rust','build','developer','technical'], distribution:['distribution','growth','gtm','users','marketing'], research:['research','paper','verification','cryptograph'], partnerships:['partner','pilot','customer','bd'] };
  let score = 0; const reasons = [];
  interests.forEach(i => { const hit = maps[i].some(k => text.includes(k)); if (hit) { score += 5; reasons.push(topics.find(x=>x[0]===i)[1]); } });
  offersSelected.forEach(o => { const seeking = (t.seeking || []).join(' ').toLowerCase(); if (offerMaps[o].some(k => seeking.includes(k))) { score += 4; reasons.push(`seeking ${offers.find(x=>x[0]===o)[1].toLowerCase()}`); } else if (offerMaps[o].some(k => text.includes(k))) score += 1; });
  if (intentsSelected.includes('invest') && /fund|market|commercial|customer|revenue|growth/.test(text)) score += 2;
  if (intentsSelected.includes('collaborate') && t.dependencies.length) score += 2;
  if (intentsSelected.includes('learn') && (t.isMentor || t.offering.length)) score += 2;
  return { score, reason: [...new Set(reasons)].slice(0,2).join(' · ') || 'Strong cross-cohort connection' };
}
$('#matcher-form').addEventListener('submit', e => {
  e.preventDefault(); const fd = new FormData(e.currentTarget);
  const interests = fd.getAll('interest'), offerSel = fd.getAll('offer'), intentSel = fd.getAll('intent');
  const ranked = data.teams.map(t => ({t,...scoreTeam(t,interests,offerSel,intentSel)})).sort((a,b) => b.score-a.score || a.t.name.localeCompare(b.t.name)).slice(0,5);
  const root = $('#match-results'); root.hidden = false; root.innerHTML = `<div class="results-head"><div><p class="eyebrow">YOUR ROUTE</p><h2>Start with these conversations.</h2></div></div><div class="team-grid">${ranked.map(x => cardHTML(x.t,x.reason)).join('')}</div>`; bindCards(root); root.scrollIntoView({behavior:'smooth'});
});

function initGraph() {
  const stage = $('#graph-stage');
  const centers = [[150,130],[450,130],[750,130],[1050,130],[150,350],[450,350],[750,350],[1050,350],[150,570],[450,570],[750,570],[1050,570]];
  const groups = new Map(); data.teams.forEach(t => { const key=t.cluster || t.domain; if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(t); });
  const pos = new Map(); let markup = '';
  [...groups.entries()].forEach(([key,teams], gi) => { const [cx,cy]=centers[gi]; markup += `<text class="cluster-label" x="${cx}" y="${cy-75}">${esc((clusterById.get(key)?.label || key).toUpperCase())}</text>`; teams.forEach((t,i) => { const a=(i/teams.length)*Math.PI*2-.7; const r=teams.length===1?0:52+teams.length*4; pos.set(t.id,{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r}); }); });
  const uniqueEdges = []; const seen = new Set(); data.dependencies.forEach(d => { const k=[d.source,d.target].sort().join('|'); if(!seen.has(k)&&pos.has(d.source)&&pos.has(d.target)){seen.add(k);uniqueEdges.push(d);} });
  markup += uniqueEdges.map(d => {const a=pos.get(d.source),b=pos.get(d.target); return `<line class="graph-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;}).join('');
  markup += data.teams.map(t => {const p=pos.get(t.id); return `<g class="graph-node" data-graph-team="${t.id}" tabindex="0"><circle cx="${p.x}" cy="${p.y}" r="25"/><text x="${p.x}" y="${p.y+4}">${esc(t.name.length>12?t.name.slice(0,11)+'…':t.name)}</text></g>`;}).join(''); stage.innerHTML=markup;
  $$('[data-graph-team]').forEach(n=>{n.addEventListener('click',()=>openTeam(n.dataset.graphTeam));n.addEventListener('keydown',e=>{if(e.key==='Enter')openTeam(n.dataset.graphTeam)});});
  let tx=0,ty=0,scale=1,drag=null;
  const apply=()=>stage.setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);
  $('#zoom-in').onclick=()=>{scale=Math.min(2.2,scale+.18);apply()}; $('#zoom-out').onclick=()=>{scale=Math.max(.55,scale-.18);apply()}; $('#zoom-reset').onclick=()=>{tx=ty=0;scale=1;apply()};
  const svg=$('#constellation'); svg.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.55,Math.min(2.2,scale*(e.deltaY<0?1.1:.9)));apply()},{passive:false});
  svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,tx,ty};svg.setPointerCapture(e.pointerId)}); svg.addEventListener('pointermove',e=>{if(!drag)return;tx=drag.tx+(e.clientX-drag.x);ty=drag.ty+(e.clientY-drag.y);apply()}); svg.addEventListener('pointerup',()=>drag=null);
}

function renderOnboarding(step=0) {
  const root=$('#onboarding'); const content=[
    {k:'ORIENTATION / 01',h:'You crossed into a strange machine.',p:'Shape Rotator is a 10-week program turning cryptography and AI research into products people can use.',visual:`<svg viewBox="0 0 300 300" fill="none"><circle cx="150" cy="150" r="96" fill="#8f220e"/><g stroke="#f1ece7" stroke-opacity=".6"><ellipse cx="150" cy="150" rx="96" ry="35"/><ellipse cx="150" cy="150" rx="35" ry="96"/><circle cx="150" cy="150" r="96"/></g></svg>`},
    {k:'ORIENTATION / 02',h:'Pick a shape for the day.',p:'No personality test. Just a small identity mark that follows you through the field.',visual:`<div class="shape-picker">${['hex','prism','torus'].map(s=>`<button class="shape-choice ${state.visitorShape===s?'selected':''}" data-pick-shape="${s}" aria-label="Choose ${s}">${shapeSVG(s)}</button>`).join('')}</div>`},
    {k:'ORIENTATION / 03',h:'Follow what can become useful.',p:'Browse teams, inspect the dependency field, or answer three signals to route toward the right conversations.',visual:`<svg viewBox="0 0 300 300" fill="none" stroke="#f1ece7"><circle cx="60" cy="90" r="18"/><circle cx="230" cy="70" r="25"/><circle cx="155" cy="220" r="31"/><path d="M78 88 205 72M72 105l65 92m40 2 42-106" stroke-opacity=".45"/><circle cx="155" cy="220" r="4" fill="#8f220e" stroke="none"/></svg>`}
  ][step];
  root.hidden=false; root.innerHTML=`<div class="onboard-panel"><div class="onboard-copy"><span class="onboard-step">${content.k}</span><h2>${content.h}</h2><p>${content.p}</p><div class="onboard-actions"><button data-skip>Skip intro</button>${step?'<button data-prev>Back</button>':''}<button class="next" data-next>${step===2?'Enter the field':'Continue'}</button></div></div><div class="onboard-visual">${content.visual}</div></div>`;
  $$('[data-pick-shape]',root).forEach(b=>b.onclick=()=>{state.visitorShape=b.dataset.pickShape;localStorage.setItem('sr-shape',state.visitorShape);renderOnboarding(step)});
  $('[data-skip]',root).onclick=finishOnboarding; $('[data-prev]',root)?.addEventListener('click',()=>renderOnboarding(step-1)); $('[data-next]',root).onclick=()=>step===2?finishOnboarding():renderOnboarding(step+1);
}
function finishOnboarding(){localStorage.setItem('sr-onboarded','1');$('#onboarding').hidden=true;}

renderFilters(); renderTeams(); renderPeople(); renderSchedule(); initGraph(); saveState();
const initial=location.hash.slice(1); if(['teams','constellation','schedule','people','match','saved'].includes(initial)) setView(initial);
if(!localStorage.getItem('sr-onboarded')) renderOnboarding();
