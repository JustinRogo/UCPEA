// Build the static site into dist/ for GitHub Pages.
// Copies the Supabase browser library into vendor/, then publishes the app
// files without the backend source, SQL, docs, Node scripts or backups.
import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

export async function vendorLibraries() {
  const output = path.join(root, 'vendor');
  await mkdir(output, { recursive: true });
  for (const [source, target] of [
    ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
    ['@supabase/supabase-js/LICENSE', 'supabase-LICENSE'],
  ]) await copyFile(path.join(root, 'node_modules', source), path.join(output, target));
}

// Top-level entries that never belong in the published site.
const excludedEntries = new Set([
  '.git', '.github', '.gitignore', 'dist', 'node_modules', 'scripts', 'supabase', 'tests',
  'package.json', 'package-lock.json', 'LICENSE',
]);
const excludedFiles = /\.(?:bak(?:\.html)?|sql|md|mjs|tmp)$/i;

// The version shown in the account menu: v1. followed by the number of commits,
// padded to three digits (58 commits → v1.058). A shallow clone only holds part
// of the history, so it gets no version rather than a wrong one.
export function versionLabel(commits) {
  return `v1.${String(commits).padStart(3, '0')}`;
}

function commitCount() {
  try {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      console.warn('Shallow clone: the version is left out. Fetch the full history to include it.');
      return null;
    }
    const count = Number(git(['rev-list', '--count', 'HEAD']));
    return Number.isInteger(count) && count > 0 ? count : null;
  } catch {
    console.warn('Git is unavailable: the version is left out.');
    return null;
  }
}

async function stampVersion() {
  const commits = commitCount();
  if (!commits) return;
  const file = path.join(dist, 'index.html');
  const html = await readFile(file, 'utf8');
  const placeholder = '<p class="account-menu__version" id="app-version" hidden></p>';
  if (!html.includes(placeholder)) throw new Error('The version placeholder is missing from index.html.');
  await writeFile(file, html.replace(placeholder,
    `<p class="account-menu__version" id="app-version">Version ${versionLabel(commits)}</p>`));
  console.log(`Version ${versionLabel(commits)}.`);
}

export async function buildSite() {
  await vendorLibraries();
  if (path.relative(root, dist) !== 'dist') throw new Error('Unexpected build output path.');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const entry of await readdir(root)) {
    if (excludedEntries.has(entry) || entry.startsWith('.')) continue;
    await cp(path.join(root, entry), path.join(dist, entry), {
      recursive: true,
      filter: source => {
        const name = path.basename(source);
        return !name.startsWith('.') && !excludedFiles.test(name);
      },
    });
  }
  await stampVersion();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
  console.log('UCPEA dashboard prepared in dist/.');
}
