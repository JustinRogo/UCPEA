import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textOnly } from './update-union-wire.mjs';

// UCPEA's website lists the Executive Board and every committee roster as
// plain tables. The office keeps those pages current; this copies them.
export const COMMITTEES_URL = 'https://ucpea.ct.aft.org/committees-and-chairs/committees';
export const EXECUTIVE_BOARD_URL = 'https://ucpea.ct.aft.org/executive-board';
const OUTPUT = fileURLToPath(new URL('./committees-feed.js', import.meta.url));
const USER_AGENT = 'justinrogo.github.io UCPEA committees feed/1.0';

// Below these counts the page has probably changed shape, so the refresh
// keeps the last good snapshot instead of publishing a half-empty roster.
const MIN_COMMITTEES = 5;
const MIN_COMMITTEE_ROWS = 30;
const MIN_OFFICERS = 5;

const chairMark = /\s*\((?:co-?)?chair\)\s*/i;

function tableRows(html) {
  const table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error('No table found');
  return Array.from(table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi), ([row]) => ({
    html: row,
    cells: Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), ([, cell]) => cell),
  }));
}

// "Yesenia "Jess" Darling" → "Yesenia “Jess” Darling", matching the dashboard's typography.
function tidyName(value) {
  return value.replace(/"([^"]+)"/g, '“$1”').replace(/\s+/g, ' ').trim();
}

export function parseCommittees(html) {
  const rows = tableRows(html);
  const headerIndex = rows.findIndex(row => row.cells.some(cell => /^committee$/i.test(textOnly(cell))));
  if (headerIndex < 0) throw new Error('Committee table header not found');
  const header = rows[headerIndex].cells.map(cell => textOnly(cell).toLowerCase());
  const column = label => header.findIndex(text => text === label);
  const first = column('first name');
  const last = column('last name');
  const committee = column('committee');
  if ([first, last, committee].includes(-1)) throw new Error('Committee table columns changed');

  const byName = new Map();
  for (const { cells } of rows.slice(headerIndex + 1)) {
    const name = textOnly(cells[committee] ?? '');
    const firstName = textOnly(cells[first] ?? '');
    const lastName = textOnly(cells[last] ?? '');
    if (!name || !(firstName || lastName)) continue;
    const isChair = chairMark.test(firstName) || chairMark.test(lastName);
    const person = tidyName([firstName, lastName].map(part => part.replace(chairMark, ' ')).join(' '));
    if (!byName.has(name)) byName.set(name, { name, chairs: [], members: [] });
    // The site marks a vacant seat with a placeholder row such as "-- (chair)".
    if (!/\p{L}/u.test(person)) continue;
    const entry = byName.get(name);
    if (entry.chairs.includes(person) || entry.members.includes(person)) continue;
    (isChair ? entry.chairs : entry.members).push(person);
  }
  // Only names reach the dashboard: the website's member email addresses are left out.
  return Array.from(byName.values());
}

export function parseExecutiveBoard(html) {
  const officers = [];
  for (const { html: row, cells } of tableRows(html)) {
    if (cells.length < 3) continue;
    const email = row.match(/mailto:([^"'?\s>]+)/i)?.[1] ?? textOnly(cells[2]);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) continue;
    const name = tidyName(textOnly(cells[0]));
    const title = textOnly(cells[1]).replace(/^VP\b/, 'Vice President');
    if (name && title) officers.push({ title, name, email: email.toLowerCase() });
  }
  return officers;
}

async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
  return response.text();
}

export function readSnapshot(script) {
  return JSON.parse(script.match(/^const UCPEACommitteesFeed = ([\s\S]+);\s*$/m)?.[1] ?? '{}');
}

export function checkCommittees(committees) {
  const rows = committees.reduce((total, entry) => total + entry.chairs.length + entry.members.length, 0);
  if (committees.length < MIN_COMMITTEES || rows < MIN_COMMITTEE_ROWS) {
    throw new Error(`Only ${committees.length} committees and ${rows} people found`);
  }
}

export function checkOfficers(officers) {
  if (officers.length < MIN_OFFICERS) throw new Error(`Only ${officers.length} officers found`);
}

async function refreshCommittees() {
  let previous = {};
  try {
    previous = readSnapshot(await readFile(OUTPUT, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Each page is checked on its own, so one failing keeps its last good copy
  // while the other still updates.
  const [committees, officers] = await Promise.allSettled([
    fetchHTML(COMMITTEES_URL).then(parseCommittees).then(list => (checkCommittees(list), list)),
    fetchHTML(EXECUTIVE_BOARD_URL).then(parseExecutiveBoard).then(list => (checkOfficers(list), list)),
  ]);

  const snapshot = { ...previous };
  let updated = false;
  if (committees.status === 'fulfilled') {
    Object.assign(snapshot, { committees: committees.value, committeesCheckedAt: new Date().toISOString() });
    updated = true;
  } else if (previous.committees?.length) {
    console.warn('Committee refresh failed; preserving the existing roster:', committees.reason.message);
  } else {
    throw committees.reason;
  }
  if (officers.status === 'fulfilled') {
    Object.assign(snapshot, { officers: officers.value, officersCheckedAt: new Date().toISOString() });
    updated = true;
  } else if (previous.officers?.length) {
    console.warn('Executive Board refresh failed; preserving the existing list:', officers.reason.message);
  } else {
    throw officers.reason;
  }
  if (!updated) return;

  const ordered = {
    source: { committees: COMMITTEES_URL, executiveBoard: EXECUTIVE_BOARD_URL },
    committeesCheckedAt: snapshot.committeesCheckedAt,
    officersCheckedAt: snapshot.officersCheckedAt,
    officers: snapshot.officers,
    committees: snapshot.committees,
  };
  await writeFile(OUTPUT, '// Generated by update-committees.mjs.\nconst UCPEACommitteesFeed = ' +
    JSON.stringify(ordered, null, 2) + ';\n', 'utf8');
  console.log(`Wrote ${ordered.officers.length} officers and ${ordered.committees.length} committees to ${OUTPUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await refreshCommittees();
}
