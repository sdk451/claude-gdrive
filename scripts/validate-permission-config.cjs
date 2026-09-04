#!/usr/bin/env node
'use strict';

/**
 * Warn about likely-mistyped MCP server names in the permission allow-list.
 *
 * The MCP matcher (evaluateMcp) is deliberately exact and case-sensitive: a
 * server not exactly on `mcpServers.allow` fails closed to a prompt. That is the
 * correct security behaviour - loosening the match to be case-insensitive would
 * let GITHUB through when someone meant to block it. But it means a typo in the
 * allow-list (GitHub for github, a trailing space, a wrong separator) silently
 * prompts forever, with no signal that the config is the problem.
 *
 * This validator is that signal. It runs OUTSIDE the permission hot path - at
 * session start or on demand, never per tool call - and only WARNS; it never
 * changes a decision. It cross-checks each allow-list entry against the MCP
 * server names actually referenced in .claude/settings.json hook matchers
 * (mcp__<server>__...), and flags an allow-list entry that matches none of them
 * except by case or whitespace - the signature of a typo.
 *
 * Exit code is always 0: this is advice, not a gate. A wrong warning must never
 * block a session.
 */

const fs = require('node:fs');
const path = require('node:path');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Pull every server name referenced in settings.json hook matchers: the tokens
// between the first and second __ in an mcp__<server>__ pattern.
function referencedServers(settings) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      const m = v.match(/mcp__([A-Za-z0-9_.-]+?)__/g) || [];
      for (const hit of m) {
        const name = hit.replace(/^mcp__/, '').replace(/__$/, '');
        if (name && name !== '.*' && !name.includes('*')) found.add(name);
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(settings);
  return found;
}

function norm(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

function main() {
  const root = process.argv[2] || process.cwd();
  const policy = readJson(path.join(root, '.claude', 'permissions-policy.json'));
  if (!policy || !policy.mcpServers || !Array.isArray(policy.mcpServers.allow)) {
    // Nothing to validate - not an error.
    return 0;
  }
  const allow = policy.mcpServers.allow;
  const settings = readJson(path.join(root, '.claude', 'settings.json')) || {};
  const referenced = referencedServers(settings);

  if (referenced.size === 0) {
    // No hook references to cross-check against - cannot judge typos, stay quiet.
    return 0;
  }

  const referencedNorm = new Map();
  for (const r of referenced) referencedNorm.set(norm(r), r);

  const warnings = [];
  for (const entry of allow) {
    if (referenced.has(entry)) continue; // exact match - fine
    const hit = referencedNorm.get(norm(entry));
    if (hit) {
      // Matches a real server only after normalising case/whitespace: a typo.
      warnings.push(
        `  allow-list entry "${entry}" does not exactly match any connected server, ` +
        `but matches "${hit}" ignoring case/whitespace. The MCP matcher is exact, so ` +
        `"${entry}" will silently prompt every time. Did you mean "${hit}"?`);
    }
    // An entry that matches nothing at all is left alone: it may be a server not
    // wired via a settings hook, and warning on it would be noise.
  }

  if (warnings.length) {
    process.stderr.write(
      'permission-config: likely MCP allow-list typos (these will silently prompt):\n' +
      warnings.join('\n') + '\n');
  }
  return 0;
}

process.exit(main());