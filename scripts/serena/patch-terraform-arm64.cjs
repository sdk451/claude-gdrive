'use strict';

// Teach the installed solidlsp that Windows-on-ARM can run the amd64 terraform-ls.
//
// solidlsp declares terraform-ls runtime dependencies for osx-arm64, osx-x64,
// linux-arm64, linux-x64 and win-x64. There is no win-arm64 entry, so on a
// Windows ARM host get_single_dep_for_current_platform() raises:
//
//   RuntimeError: Expected exactly one runtime dependency for
//   platform-win-arm64 and dependency_id=None, found 0
//
// That throw happens before any "is it already installed" check, so dropping a
// binary in place does not help. Observed impact is intermittent rather than
// total: sometimes the manager aggregates the failure into
// LanguageServerManagerInitialisationError and aborts LSP init entirely, taking
// working TypeScript and Python servers down with it; sometimes the session
// continues. Identical config, different outcome, which is worse than a clean
// failure.
//
// Windows on ARM runs x64 binaries under emulation, and the existing win-x64
// entry already points at terraform-ls_<version>_windows_amd64.zip. So the fix is
// only to declare that the same artefact serves win-arm64.
//
// Idempotent and self-verifying. Safe to run on every bridge start. On any
// platform other than Windows ARM it does nothing.
//
// This mutates a third-party package inside a uv tool install, so it will be
// undone whenever that install is rebuilt - which is exactly why it re-runs at
// boot rather than being applied once by hand. ADR-0003 records this class of
// problem as an argument for the container substrate: terraform-ls has a
// linux/amd64 build, and none of this exists there.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARKER = 'platform_id="win-arm64"';

function terraformLsPath() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'uv', 'tools', 'serena-agent',
      'Lib', 'site-packages', 'solidlsp', 'language_servers', 'terraform_ls.py'),
    path.join(os.homedir(), '.local', 'share', 'uv', 'tools', 'serena-agent',
      'lib', 'python3.11', 'site-packages', 'solidlsp', 'language_servers', 'terraform_ls.py'),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

// Deliberately NOT an ARM check. Node on a Windows ARM host is commonly an x64
// build running under emulation: it reports process.arch 'x64',
// PROCESSOR_ARCHITECTURE 'AMD64' and no PROCESSOR_ARCHITEW6432, so it cannot see
// that the host is ARM. Serena's own Python does see it, which is how the two
// disagree and why an arch check here would silently skip the patch on exactly
// the machines that need it.
//
// The win-arm64 entry is inert on a genuine x64 host - it simply never matches -
// so ensuring it on all Windows hosts is both correct and cheaper than trying to
// out-detect the emulation layer.
function shouldPatch() {
  return process.platform === 'win32';
}
function apply({ quiet = false } = {}) {
  const log = (m) => { if (!quiet) process.stderr.write('[serena-tf] ' + m + '\n'); };

  if (!shouldPatch()) return { ok: true, changed: false, reason: 'not a Windows host' };

  const file = terraformLsPath();
  if (!file) return { ok: false, reason: 'solidlsp terraform_ls.py not found; is serena installed?' };

  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return { ok: false, reason: e.message }; }
  if (src.includes(MARKER)) return { ok: true, changed: false, reason: 'already patched' };

  // Clone the win-x64 entry. Done line-wise, not with a regex: a lazy regex
  // anchored on platform_id="win-x64" still starts at the FIRST RuntimeDependency
  // in the list, so it captures all five blocks and clones every one of them.
  // That produced `Duplicate runtime dependency with id 'TerraformLS'` and is why
  // this walks outward from the marker line instead.
  const lines = src.split('\n');
  const marker = lines.findIndex((l) => l.includes('platform_id="win-x64"'));
  if (marker === -1) return { ok: false, reason: 'no win-x64 entry; solidlsp layout changed' };

  let open = -1;
  for (let i = marker; i >= 0; i--) {
    if (lines[i].trim().startsWith('RuntimeDependency(')) { open = i; break; }
  }
  const indent = open >= 0 ? lines[open].match(/^\s*/)[0] : null;
  let close = -1;
  for (let i = marker; i < lines.length; i++) {
    if (lines[i] === indent + '),') { close = i; break; }
  }
  if (open === -1 || close === -1) return { ok: false, reason: 'could not bound the win-x64 block' };

  const block = lines.slice(open, close + 1);
  if (block.filter((l) => l.includes('RuntimeDependency(')).length !== 1) {
    return { ok: false, reason: 'block bounding captured more than one dependency' };
  }

  const clone = block.map((l) => l
    .replace('platform_id="win-x64"', 'platform_id="win-arm64"')
    .replace('description="terraform-ls for Windows (x64)"',
             'description="terraform-ls for Windows on ARM (amd64 binary, x64 emulation)"'));

  const out = lines.slice(0, close + 1).concat(clone, lines.slice(close + 1));
  const patched = out.join('\n');

  if (!patched.includes(MARKER)) return { ok: false, reason: 'patch produced no win-arm64 entry' };
  const ids = (patched.match(/platform_id="[^"]+"/g) || []);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'patch would create duplicate platform ids: ' + ids.join(', ') };
  }

  try {
    if (!fs.existsSync(file + '.orig')) fs.copyFileSync(file, file + '.orig');
    fs.writeFileSync(file, patched, 'utf8');
  } catch (e) {
    return { ok: false, reason: 'write failed: ' + e.message };
  }

  log('declared win-arm64 -> windows_amd64 terraform-ls in ' + file);
  return { ok: true, changed: true, file };
}

function status() {
  const file = terraformLsPath();
  return {
    applicable: shouldPatch(),
    file,
    patched: file ? fs.readFileSync(file, 'utf8').includes(MARKER) : false,
  };
}

if (require.main === module) {
  const cmd = process.argv[2] || 'apply';
  if (cmd === 'status') {
    const s = status();
    console.log('applicable: ' + s.applicable);
    console.log('file:        ' + (s.file || '(not found)'));
    console.log('patched:     ' + s.patched);
  } else {
    const r = apply();
    if (!r.ok) { console.error('patch-terraform-arm64: ' + r.reason); process.exit(1); }
    console.log(r.changed ? 'PATCHED  ' + r.file : 'OK       ' + (r.reason || 'no change needed'));
  }
}

module.exports = { apply, status, shouldPatch, terraformLsPath };