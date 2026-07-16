// build-data.js — parse cohort-data markdown + yml into one static JSON bundle.
// No runtime GitHub fetching: everything the app needs is baked at build time.
//
// Reads: ../../source/cohort-data/{teams,people,clusters,dependencies}/*.md,
//        program/*.md, calendar.json, awards.yml, timeline.yml
// Writes: ../src/data/cohort.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOCAL_DATA = path.resolve(ROOT, 'cohort-data');
const SRC = fs.existsSync(LOCAL_DATA) ? LOCAL_DATA : path.resolve(ROOT, '../source/cohort-data');
const OUT_DIR = path.resolve(ROOT, 'src/data');
const OUT = path.join(OUT_DIR, 'cohort.json');

function readDir(rel) {
  const dir = path.join(SRC, rel);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data, content } = matter(raw);
      return { ...data, _slug: f.replace(/\.md$/, ''), _about: content.trim() };
    });
}

function readYaml(rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function readJson(rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readMd(rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) return null;
  const { data, content } = matter(fs.readFileSync(p, 'utf8'));
  return { ...data, body: content.trim() };
}

// strip about-surface placeholder noise
function cleanAbout(s) {
  if (!s) return '';
  const t = s
    .replace(/^##\s*about\s*/i, '')
    .replace(/_\(public surface[^)]*\)_?/gi, '')
    .replace(/\(public surface[^)]*\)/gi, '')
    .trim();
  return t;
}

// ── teams ────────────────────────────────────────────────────────────────
const rawTeams = readDir('teams');
const teams = rawTeams.map((t) => ({
  id: t.record_id || t._slug,
  slug: t._slug,
  name: String(t.name || t._slug).replace(/^"|"$/g, ''),
  focus: t.focus || '',
  shape: t.shape && t.shape !== 'null' ? t.shape : null,
  domain: t.domain || 'other',
  geo: t.geo || '',
  members: t.members_count ?? null,
  isMentor: !!t.is_mentor,
  traction: t.traction || '',
  now: t.now || '',
  seeking: t.seeking || [],
  offering: t.offering || [],
  skillAreas: t.skill_areas || [],
  dependencies: t.dependencies || [],
  paperBasis: t.paper_basis || [],
  priorShipping: t.prior_shipping || [],
  successDimensions: t.success_dimensions || [],
  links: t.links && typeof t.links === 'object'
    ? Object.fromEntries(Object.entries(t.links).filter(([, v]) => v && v !== 'null'))
    : {},
  journey: t.journey
    ? {
        stage: t.journey.stage ?? null,
        companyType: t.journey.company_type || '',
        bottleneck: t.journey.primary_bottleneck || '',
        icp: t.journey.icp || '',
        problem: t.journey.problem || '',
        solution: t.journey.solution || '',
        nextMilestone: t.journey.next_milestone || '',
        marketUpside: t.journey.market_upside ?? null,
        evidenceQuality: t.journey.evidence_quality ?? null,
      }
    : null,
  about: cleanAbout(t._about),
}));
const teamIds = new Set(teams.map((t) => t.id));

// ── people ───────────────────────────────────────────────────────────────
const rawPeople = readDir('people');
const people = rawPeople
  .map((p) => ({
    id: p.record_id || p._slug,
    name: p.name || p._slug,
    team: p.team || null,
    role: p.role || '',
    geo: p.geo || '',
    domain: p.domain || '',
    skillAreas: p.skill_areas || [],
    goToThemFor: p.go_to_them_for || [],
    now: p.now || '',
    workingStyle: p.working_style || '',
    links: p.links && typeof p.links === 'object'
      ? Object.fromEntries(Object.entries(p.links).filter(([, v]) => v && v !== 'null'))
      : {},
    about: cleanAbout(p._about),
  }));

// ── clusters ─────────────────────────────────────────────────────────────
const rawClusters = readDir('clusters');
const clusters = rawClusters.map((c) => ({
  id: c.record_id || c._slug,
  name: c.name || c._slug,
  label: c.label || c.name || c._slug,
  description: c.description || '',
  teams: (c.teams || []).filter((id) => teamIds.has(id)),
}));

// annotate each team with every relevant cluster (and a primary cluster)
const teamClusters = {};
clusters.forEach((c) => c.teams.forEach((tid) => {
  (teamClusters[tid] ||= []).push(c.id);
}));
teams.forEach((t) => {
  t.clusters = teamClusters[t.id] || [];
  t.cluster = t.clusters[0] || null;
});

// ── dependencies ─────────────────────────────────────────────────────────
const rawDeps = readDir('dependencies');
const dependencies = rawDeps
  .filter((d) => teamIds.has(d.source) && teamIds.has(d.target))
  .map((d) => ({
    id: d.record_id || d._slug,
    source: d.source,
    target: d.target,
    relation: d.relation || 'depends_on',
    status: d.status || '',
    reason: d.reason || '',
  }));

// also fold in team.dependencies arrays as edges (dedup)
const edgeKey = (a, b) => `${a}->${b}`;
const seen = new Set(dependencies.map((d) => edgeKey(d.source, d.target)));
teams.forEach((t) => {
  (t.dependencies || []).forEach((dep) => {
    if (teamIds.has(dep) && !seen.has(edgeKey(t.id, dep))) {
      seen.add(edgeKey(t.id, dep));
      dependencies.push({
        id: `${t.id}-${dep}`,
        source: t.id,
        target: dep,
        relation: 'depends_on',
        status: 'declared',
        reason: '',
      });
    }
  });
});

// ── program ──────────────────────────────────────────────────────────────
const overview = readMd('program/overview.md');
const success = readMd('program/success.md');

// ── calendar → flatten demo-day-relevant events ──────────────────────────
const calendar = readJson('calendar.json');
const awards = readYaml('awards.yml');
const timeline = readYaml('timeline.yml');

// Extract a tidy schedule: pull the final-week / demo-day cells from calendar.
function extractSchedule(cal) {
  if (!cal || !cal.tabs) return [];
  const out = [];
  for (const [tab, rows] of Object.entries(cal.tabs)) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const week = row[0];
      const dates = row[1];
      // day cells are indices 2..8 (Mon..Sun)
      const days = row.slice(2, 9);
      const hasContent = days.some((d) => d && String(d).trim().length > 8);
      if (!hasContent) continue;
      out.push({ tab, week: String(week || '').trim(), dates: String(dates || '').trim(), days });
    }
  }
  return out;
}
const scheduleRows = extractSchedule(calendar);

// Award categories (public-safe editorial slots only)
const awardCategories = (awards?.editorial_categories || []).map((a) => ({
  id: a.id,
  label: a.label,
  description: (a.description || '').trim(),
}));

const bundle = {
  meta: {
    generatedAt: new Date().toISOString(),
    program: 'Shape Rotator Accelerator — Cohort 01',
    demoDay: 'Final Demo Day #2 + Graduation · Jul 23–24, 2026 · NYC (the convent)',
    tagline: overview?.body?.match(/a 10-week program[^.]*\./i)?.[0] ||
      'A 10-week program turning cryptography and AI research into products people can use.',
    runBy: 'IC3 × Flashbots × the convent × blockchain builders fund',
  },
  teams,
  people,
  clusters,
  dependencies,
  scheduleRows,
  awardCategories,
  counts: {
    teams: teams.length,
    people: people.length,
    clusters: clusters.length,
    dependencies: dependencies.length,
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
console.log(
  `[build-data] wrote ${OUT}\n  teams=${teams.length} people=${people.length} clusters=${clusters.length} deps=${dependencies.length} schedRows=${scheduleRows.length} awards=${awardCategories.length}`
);
