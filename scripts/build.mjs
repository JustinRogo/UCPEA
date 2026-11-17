// Build the static site into dist/ for GitHub Pages.
// Copies the Supabase browser library into vendor/, then publishes the app
// files without the backend source, SQL, docs, Node scripts or backups.
import { copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises';
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
  console.log('UCPEA dashboard prepared in dist/.');
}
