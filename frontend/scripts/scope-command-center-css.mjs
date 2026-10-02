/**
 * Prototype stylesheet adapter.
 *
 * The visual prototype is a standalone Tailwind v3 app whose stylesheet sets
 * document-level styles (`html`, `body`, `*`, `button`, `input`) and declares
 * its palette on `:root`. Imported verbatim into the host app it would reset the
 * whole application and repaint it dark in a way that also destroys the host's
 * own typography (`* { font: inherit }` would beat every `text-sm` utility).
 *
 * This script therefore generates two stylesheets from the one prototype source:
 *
 *   src/styles/command-center.css
 *     Every rule, verbatim, with only the document-level selectors re-anchored
 *     onto `.command-center-surface` (and the prototype's Tailwind v3
 *     directives dropped - the host is on v4). This is the student Command
 *     Center surface.
 *
 *   src/styles/app-shell.css
 *     Only the *shell* rules - sidebar, navigation, topbar, mobile drawer,
 *     profile menu, footer, brand, page container - verbatim, left unanchored
 *     so the prototype's own selectors keep working, plus the prototype palette
 *     re-declared on `.app-shell`. The prototype's document-level resets
 *     (`*`, `a`, `button`, `input`, `html`, `body`) are deliberately NOT
 *     included: they are a prototype-wide concern, and applying them to the
 *     shell would re-break host typography.
 *
 * Run: node scripts/scope-command-center-css.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The visual prototype lives outside the repo; override with PROTOTYPE_ROOT. */
const PROTOTYPE_ROOT = process.env.PROTOTYPE_ROOT ?? path.resolve(ROOT, "..", "..", "frontend");
const SOURCE = path.resolve(PROTOTYPE_ROOT, "app", "globals.css");
const COMMAND_CENTER_TARGET = path.resolve(ROOT, "src", "styles", "command-center.css");
const SHELL_TARGET = path.resolve(ROOT, "src", "styles", "app-shell.css");
const SCOPE = ".command-center-surface";
const SHELL_ROOT = ".app-shell";

/**
 * Document-level selectors, mapped to their in-scope equivalent.
 * `:root`, `html`, `body` and `::selection` collapse onto the scope root;
 * `*`, `a`, `button` and `input` become descendants of it.
 *
 * Order matters: the pseudo-element forms are handled before the bare `*`.
 * Patterns allow leading whitespace and are global, because these selectors
 * appear both at the top level and indented inside media queries, and some
 * appear more than once (a second `button` rule, a `*` list).
 */
const SELECTOR_REWRITES = [
  { from: /^[ \t]*:root\b/gm, to: SCOPE },
  { from: /^[ \t]*html\b/gm, to: SCOPE },
  { from: /^[ \t]*body\b/gm, to: SCOPE },
  { from: /^[ \t]*::selection\b/gm, to: `${SCOPE} ::selection` },
  { from: /^[ \t]*\*::?before\b/gm, to: `${SHELL_ROOT} *::before` },
  { from: /^[ \t]*\*::?after\b/gm, to: `${SHELL_ROOT} *::after` },
  { from: /^[ \t]*\*(?=[ ,{])/gm, to: `${SCOPE} *` },
  { from: /^[ \t]*a\b/gm, to: `${SCOPE} a` },
  { from: /^[ \t]*button\b/gm, to: `${SCOPE} button` },
  { from: /^[ \t]*input\b/gm, to: `${SCOPE} input` },
];

/**
 * The shell's own class vocabulary. A prototype rule belongs in
 * `app-shell.css` when its first class in every selector of the list is one of
 * these. Everything else is Command Center content and stays behind
 * `.command-center-surface`.
 */
const SHELL_CLASSES = new Set([
  "app-shell",
  "app-footer",
  "footer-separator",
  "sidebar",
  "sidebar-brand-row",
  "sidebar-brand-link",
  "sidebar-collapse",
  "sidebar-mobile-close",
  "sidebar-group-label",
  "sidebar-nav",
  "sidebar-spacer",
  "sidebar-status",
  "sidebar-status__icon",
  "sidebar-status__copy",
  "sidebar-footer",
  "sidebar--compact",
  "sidebar--mobile-open",
  "nav-row",
  "nav-link",
  "nav-link--active",
  "nav-label",
  "nav-active-mark",
  "main-panel",
  "topbar",
  "topbar-left",
  "topbar-tools",
  "topbar-context",
  "topbar-context__eyebrow",
  "topbar-context__title",
  "search-trigger",
  "icon-button",
  "profile-wrap",
  "profile-button",
  "profile-avatar",
  "profile-copy",
  "profile-chevron",
  "profile-menu",
  "profile-menu__heading",
  "page-main",
  "mobile-scrim",
  "mobile-menu-trigger",
  "brand-lockup",
  "brand-mark",
  "brand-wordmark",
  "brand-wordmark__accent",
  "brand-wordmark__ai",
  "sr-only",
  "status-indicator",
]);

/** Palette tokens the scoped palettes must not re-declare. */
const SHELL_PALETTE_SKIP = /^--(radius-)/;

/**
 * The prototype's `--accent*` scale collides by name with shadcn's `--accent`
 * (a subtle hover surface, not a brand colour). If the prototype palette were
 * declared on the shell root, `hover:bg-accent` would resolve to full-strength
 * aqua. The prototype's own accent scale is therefore renamed to `--sc-*` in
 * both generated stylesheets - the only edit made to a rule body.
 */
const TOKEN_RENAMES = [
  ["--accent-strong", "--sc-accent-strong"],
  ["--accent-soft", "--sc-accent-soft"],
  ["--accent", "--sc-accent"],
];

/** Apply the token renames to a declaration block. */
function renameTokens(body) {
  let out = body;
  for (const [from, to] of TOKEN_RENAMES) {
    out = out.replace(new RegExp(`(?<![\\w-])${from}(?![\\w-])`, "g"), to);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * A small, exact CSS scanner.
 *
 * The prototype stylesheet is flat (no nesting, no braces inside strings or
 * comments), but a naive regex rewrite cannot tell a declaration block from a
 * nested rule, so the file is split with a brace-depth scanner that tracks
 * comments and string literals instead of guessing.
 * ------------------------------------------------------------------ */

/** Split a stylesheet into top-level chunks, each ending at its matching `}`. */
function topLevelChunks(css) {
  const chunks = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  let comment = false;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (comment) {
      if (ch === "*" && css[i + 1] === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        chunks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }

  const tail = css.slice(start);
  if (tail.trim()) chunks.push(tail);
  return chunks;
}

/** Split a selector list on top-level commas. */
function splitSelectors(prelude) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of prelude) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The first class name in a selector, or null if it is not class-led. */
function leadingClass(selector) {
  const match = /^\.([A-Za-z0-9_-]+)/.exec(selector);
  return match ? match[1] : null;
}

/** Keep declarations, dropping any whose property matches `skip`. */
function filterDeclarations(body, skip) {
  return body
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !skip.test(part.split(":")[0].trim()))
    .map((part) => `  ${part};`)
    .join("\n");
}

const stats = { shell: 0, dropped: 0, media: 0, declarations: 0 };

/**
 * Extract the shell rules from the prototype stylesheet.
 * Media queries are re-emitted only when at least one rule inside survives.
 */
function buildShell(css) {
  const out = [];

  for (const chunk of topLevelChunks(css)) {
    const text = chunk.trim();
    if (!text) continue;

    if (!text.includes("{")) {
      // Statement at-rule (`@tailwind base;`) or a stray declaration: dropped.
      stats.dropped += 1;
      continue;
    }

    const open = text.indexOf("{");
    const prelude = text.slice(0, open).trim();
    const body = text.slice(open + 1, text.lastIndexOf("}"));

    if (prelude.startsWith("@")) {
      if (/^@(media|supports)\b/.test(prelude)) {
        const inner = buildShell(body);
        if (inner.trim()) {
          out.push(`${prelude} {\n${inner}\n}`);
          stats.media += 1;
        }
      } else if (/^@keyframes\b/.test(prelude)) {
        out.push(text);
      }
      continue;
    }

    const selectors = splitSelectors(prelude);

    // The prototype palette becomes the shell's palette. `--radius-*` is
    // Tailwind's own namespace and must not be shadowed here.
    if (selectors.length === 1 && selectors[0] === ":root") {
      const declarations = filterDeclarations(body, SHELL_PALETTE_SKIP);
      stats.shell += 1;
      out.push(`${SHELL_ROOT} {\n${renameTokens(declarations)}\n}`);
      continue;
    }

    const kept = selectors.filter((selector) => {
      const name = leadingClass(selector);
      return name !== null && SHELL_CLASSES.has(name);
    });

    // All-or-nothing: a partially rewritten selector list would silently drop
    // or leak half a rule.
    if (kept.length === 0 || kept.length !== selectors.length) {
      stats.dropped += 1;
      continue;
    }

    stats.shell += 1;
    stats.declarations += body.split(";").filter((part) => part.trim()).length;
    out.push(`${kept.join(",\n")} {${renameTokens(body)}}`);
  }

  return out.join("\n\n");
}

const original = readFileSync(SOURCE, "utf8");

/**
 * Statement at-rules carry no braces, so leaving them in place would fuse the
 * following style rule into the same chunk and hide it. Drop them first - the
 * host is on Tailwind v4 and imports its own layers.
 */
const withoutTailwind = original.replace(/^[ \t]*@tailwind[^\n]*\n/gm, "");

/* ---------------------------------------------------------------- *
 * Output 1: the Command Center surface - every rule, verbatim.
 * ---------------------------------------------------------------- */
let commandCenter = withoutTailwind;
for (const { from, to } of SELECTOR_REWRITES) {
  commandCenter = commandCenter.replace(from, to);
}
commandCenter = renameTokens(commandCenter);

const commandCenterHeader = `/**
 * Command Center design layer.
 *
 * Adapted from the visual prototype at ${path.resolve(PROTOTYPE_ROOT, "app", "globals.css")}.
 *
 * Only the document-level selectors were re-anchored onto ${SCOPE} (and the
 * prototype's Tailwind v3 directives dropped), so the dark palette and resets
 * apply inside the Command Center and never leak into the rest of the app.
 * Everything else is the prototype's CSS verbatim.
 *
 * Generated by scripts/scope-command-center-css.mjs - edit the prototype, not this file.
 */

`;

/* ---------------------------------------------------------------- *
 * Output 2: the global shell - shell rules only, unanchored.
 * ---------------------------------------------------------------- */
const shell = buildShell(withoutTailwind);

const shellHeader = `/**
 * Global application shell.
 *
 * Adapted from the visual prototype at ${path.resolve(PROTOTYPE_ROOT, "app", "globals.css")}.
 *
 * Only the shell's own rules (sidebar, navigation, topbar, mobile drawer,
 * profile menu, page container, footer, brand) are emitted, verbatim, with the
 * prototype palette re-declared on ${SHELL_ROOT}. The prototype's document-level
 * resets are intentionally excluded - ${SHELL_ROOT} * { font: inherit } and
 * friends would override the host's Tailwind typography utilities.
 *
 * Integration-specific additions live in app-shell-overrides.css.
 *
 * Generated by scripts/scope-command-center-css.mjs - edit the prototype, not this file.
 */

`;

mkdirSync(path.dirname(COMMAND_CENTER_TARGET), { recursive: true });
writeFileSync(COMMAND_CENTER_TARGET, commandCenterHeader + commandCenter, "utf8");
writeFileSync(SHELL_TARGET, shellHeader + shell, "utf8");

/* ---------------------------------------------------------------- *
 * Verification.
 * ---------------------------------------------------------------- */

// 1. No document-level selector may remain unscoped in the Command Center file.
const ccBody = (commandCenterHeader + commandCenter).replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const leaked = [];
for (const name of [":root", "html", "body", "*", "button", "input", "::selection"]) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^[ \\t]*${escaped}(?=[ .:,{\\-])`, "m").test(ccBody)) leaked.push(name);
}

// 2. The shell file must contain no prototype document-level selector at all,
//    and every surviving rule must have a shell class as its leading token.
const shellBody = (shellHeader + shell).replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const shellLeaks = [];
for (const name of [":root", "html", "body", "*", "button", "input", "a"]) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^[ \\t]*${escaped}(?=[ .:,{\\-])`, "m").test(shellBody)) shellLeaks.push(name);
}
for (const chunk of topLevelChunks(shellBody)) {
  const text = chunk.trim();
  if (!text.includes("{")) continue;
  const prelude = text.slice(0, text.indexOf("{")).trim();
  if (prelude.startsWith("@")) continue;
  for (const selector of splitSelectors(prelude)) {
    const name = leadingClass(selector);
    if (name === null || !SHELL_CLASSES.has(name)) shellLeaks.push(selector);
  }
}

// 3. The shell must carry the prototype palette (minus the Tailwind-owned
//    radius scale), or the shell would render with no tokens at all.
const paletteTokens = (shellBody.match(/^\s*--(?!radius-)[a-z0-9-]+(?=:)/gm) ?? []).map((t) => t.trim());
for (const token of ["--ink-950", "--surface", "--text-primary", "--sc-accent", "--ease-out", "--focus-ring"]) {
  if (!paletteTokens.includes(token)) shellLeaks.push(`missing palette token ${token}`);
}
if (/^\s*--radius-/m.test(shellBody)) shellLeaks.push("--radius-* leaked into the shell scope");
if (/(?<![\w-])--(?!sc-)(accent|accent-soft|accent-strong)\b/.test(shellBody)) {
  shellLeaks.push("un-renamed --accent* reference");
}

// 4. Every shell rule must survive byte-identically apart from the documented
//    token rename: the generator only ever re-emits `selector { <body> }`.
const sourceBlocks = topLevelChunks(withoutTailwind).filter((c) => c.includes("{"));
const sourceBodies = new Set(sourceBlocks.map((b) => `{${b.slice(b.indexOf("{") + 1, b.lastIndexOf("}"))}`));
const renamedBodies = new Set([...sourceBodies].map((b) => `{${renameTokens(b.slice(1))}`));
const shellBlocks = topLevelChunks(shell).filter((c) => c.includes("{"));
let verbatim = 0;
for (const block of shellBlocks) {
  if (block.trim().startsWith("@")) continue;
  const body = `{${block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"))}`;
  if (sourceBodies.has(body) || renamedBodies.has(body)) verbatim += 1;
}

const ccDescendantRules = (ccBody.match(new RegExp(`${SCOPE} `, "g")) ?? []).length;
const ccRootRules = (ccBody.match(new RegExp(`^${SCOPE.replace(".", "\\.")} \\{`, "gm")) ?? []).length;

console.log("command-center.css");
console.log(`  bytes            ${(commandCenterHeader + commandCenter).length} (prototype ${original.length})`);
console.log(`  scoped           ${ccRootRules} roots, ${ccDescendantRules} descendant selectors`);
console.log(`  @tailwind left   ${/@tailwind\b/.test(commandCenterHeader + commandCenter)}`);
console.log(`  leaked           ${leaked.length === 0 ? "none" : leaked.join(", ")}`);
console.log("app-shell.css");
console.log(`  bytes            ${(shellHeader + shell).length}`);
console.log(`  rules            ${stats.shell} style rules in ${stats.media} media queries (${stats.declarations} declarations)`);
console.log(`  dropped          ${stats.dropped} non-shell rules`);
console.log(`  palette tokens   ${paletteTokens.length}`);
console.log(`  verbatim bodies  ${verbatim}/${shellBlocks.length - stats.media}`);
console.log(`  leaked           ${shellLeaks.length === 0 ? "none" : [...new Set(shellLeaks)].join(", ")}`);

if (leaked.length || shellLeaks.length) process.exit(1);
