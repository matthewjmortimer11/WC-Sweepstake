#!/usr/bin/env node
/**
 * Build the live app's JS bundle.
 *
 * The app has no module system: all 24 source files share one global scope, the
 * way sibling <script> tags do. So this does NOT bundle in the ESM sense — it
 * transpiles each .jsx ahead of time and concatenates in manifest order, which
 * is semantically identical to what the browser does today. Zero source changes.
 *
 * What it replaces: React *development* builds + @babel/standalone fetched from
 * unpkg, transpiling ~576KB of JSX in the browser on every page load.
 *
 * Outputs (all gitignored, regenerate with `npm run build`):
 *   static/app/bundle.<hash>.js      — transpiled + minified app code
 *   static/vendor/react*.min.js      — production React, self-hosted
 *   static/app/build-manifest.json   — hashed filenames for the template
 *
 * Run:  npm run build        (or `npm run build:watch` while developing)
 */

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(ROOT, 'static');
const APP = join(STATIC, 'app');
// Inside static/app/ so the existing /app/{path} route serves it — no new route.
const VENDOR_OUT = join(APP, 'vendor');

const WATCH = process.argv.includes('--watch');

/** React UMD production builds, copied out of node_modules so we self-host. */
const VENDOR = [
  ['react', 'umd/react.production.min.js', 'react.production.min.js'],
  ['react-dom', 'umd/react-dom.production.min.js', 'react-dom.production.min.js'],
];

function loadManifest() {
  const raw = JSON.parse(readFileSync(join(APP, 'manifest.json'), 'utf8'));
  if (!Array.isArray(raw.scripts) || !raw.scripts.length) {
    throw new Error('manifest.json has no "scripts" array');
  }
  return raw.scripts;
}

/**
 * Transpile one source file. JSX goes through esbuild's JSX loader; plain JS is
 * passed straight through. Nothing is wrapped in a module scope — top-level
 * declarations must stay global for the next file in the list to see them.
 */
async function transpile(relPath) {
  const abs = join(STATIC, relPath);
  const source = readFileSync(abs, 'utf8');
  if (!relPath.endsWith('.jsx')) return source;

  const result = await esbuild.transform(source, {
    loader: 'jsx',
    jsx: 'transform',           // classic runtime — React must be a global
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: relPath,
    format: undefined,          // script, NOT esm — keeps top level global
  });
  return result.code;
}

function copyVendor() {
  mkdirSync(VENDOR_OUT, { recursive: true });
  for (const [pkg, from, to] of VENDOR) {
    const src = join(ROOT, 'node_modules', pkg, from);
    try {
      copyFileSync(src, join(VENDOR_OUT, to));
    } catch (err) {
      throw new Error(`Missing ${pkg} UMD build (${src}). Run \`npm install\` first.`);
    }
  }
}

/** Drop previously hashed bundles so stale ones don't pile up in static/. */
function cleanOldBundles(keep) {
  for (const name of readdirSync(APP)) {
    if (/^bundle\.[0-9a-f]{8,}\.js$/.test(name) && name !== keep) {
      rmSync(join(APP, name), { force: true });
    }
  }
}

async function build() {
  const started = Date.now();
  const files = loadManifest();

  const parts = [];
  for (const rel of files) {
    // A banner per file keeps stack traces and devtools readable without
    // needing a merged source map.
    parts.push(`/* ---- ${rel} ---- */`);
    parts.push(await transpile(rel));
  }
  const joined = parts.join('\n');

  // Minify the concatenated script. Top-level names stay untouched because this
  // is script (not module) format — esbuild can't safely rename globals.
  const { code } = await esbuild.transform(joined, {
    minify: true,
    target: ['es2019'],
    legalComments: 'none',
  });

  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const bundleName = `bundle.${hash}.js`;
  writeFileSync(join(APP, bundleName), code, 'utf8');
  cleanOldBundles(bundleName);

  copyVendor();

  writeFileSync(
    join(APP, 'build-manifest.json'),
    JSON.stringify({ bundle: `app/${bundleName}`, builtAt: new Date().toISOString() }, null, 2),
    'utf8',
  );

  const rawKB = Math.round(Buffer.byteLength(joined) / 1024);
  const minKB = Math.round(Buffer.byteLength(code) / 1024);
  console.log(
    `built ${bundleName} — ${files.length} files, ${rawKB}KB → ${minKB}KB minified ` +
    `(${Date.now() - started}ms)`,
  );
}

await build();

if (WATCH) {
  const { watch } = await import('node:fs');
  console.log('watching static/ for changes…');
  let timer = null;
  watch(APP, { recursive: true }, (_evt, name) => {
    if (!name || /^bundle\.|build-manifest\.json$/.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 60);
  });
}
