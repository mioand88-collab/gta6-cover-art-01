// A working gta6-cover-art-01 entry (Node 22, standard library only): the app is this directory's app/ folder, plain
// static files a desktop browser loads offline (app/index.html and its ES modules, no library and no network
// request), and the program hands it in. It copies app/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library. Only the plumbing, not the
// cover art the bounty asks for: Cover Snap, a plain one-photo square cover with a sunset tint and a bold caption,
// exported as a 1080 x 1080 PNG. Its two sample photos (app/samples/) were made for make.fun with an image model and
// are free to use. Build your own GTA-style cover maker in its place, put your 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Round 2 validation: refuse to hand in an empty or missing app/ or
// screenshots/ instead of silently copying nothing. Both directories must
// exist beside this file and hold at least one entry each.
import { readdirSync } from 'node:fs';
function requireNonEmptyDir(label, dir) {
  if (!existsSync(dir)) throw new Error(`missing ${label} directory: ${dir}`);
  const names = readdirSync(dir);
  if (names.length === 0) throw new Error(`empty ${label} directory: ${dir}`);
  return names.length;
}
const appEntries = requireNonEmptyDir('app', join(here, 'app'));
const shotEntries = requireNonEmptyDir('screenshots', join(here, 'screenshots'));
console.log(`checked app/ (${appEntries} entries) and screenshots/ (${shotEntries} entries)`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

// Round 2 verification: rebuild the dossier from the output just written and
// compare it byte for byte with the file on disk, then print a short summary.
import { readFileSync } from 'node:fs';
const dossierPath = join(out, 'dossier.json');
const writtenDossier = readFileSync(dossierPath);
const rebuiltDossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
if (!writtenDossier.equals(Buffer.from(rebuiltDossier))) {
  throw new Error('dossier.json does not match a fresh rebuild');
}
function countFiles(dir) {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    total += name.isDirectory() ? countFiles(join(dir, name)) : 1;
  }
  return total;
}
const copiedFiles = countFiles(join(out, 'app')) + countFiles(join(out, 'screenshots'));
console.log(`handed in ${copiedFiles} files; dossier.json is ${writtenDossier.length} bytes and matches its rebuild`);
