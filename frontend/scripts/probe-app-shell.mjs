/**
 * Ad-hoc shell probe: asserts the shell's own structure and computed styles in a
 * real browser at three widths. Not part of the E2E suites.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const PASSWORD = "SmartCampus@2026";

const ACCOUNTS = {
  STUDENT: { email: "aarav.sharma@smartcampus.edu", home: "/dashboard" },
  FACULTY: { email: "ananya.sharma@smartcampus.edu", home: "/faculty" },
  ADMIN: { email: "admin@smartcampus.edu", home: "/admin" },
  PARENT: { email: "farah.khan@smartcampus.edu", home: "/parent" },
  ALUMNI: { email: "arjun.menon@alumni.smartcampus.edu", home: "/alumni" },
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
};

async function signIn(email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}

const navInfo = () =>
  page.evaluate(() => {
    const links = [...document.querySelectorAll("nav.sidebar-nav a")];
    const groups = [...document.querySelectorAll("nav.sidebar-nav .nav-group__label")].map((n) => n.textContent);
    const active = links
      .filter((a) => a.getAttribute("aria-current"))
      .map((a) => `${a.textContent.trim()}[${a.getAttribute("aria-current")}]`);
    return { labels: links.map((a) => a.textContent.trim()), groups, active, count: links.length };
  });

const visible = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return "missing";
    const cs = getComputedStyle(el);
    return `${cs.display}/${cs.visibility}`;
  }, selector);

for (const [role, account] of Object.entries(ACCOUNTS)) {
  await signIn(account.email);
  await page.goto(`${BASE}${account.home}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const nav = await navInfo();
  record(`${role}: shell renders`, (await page.$(".app-shell")) !== null);
  record(`${role}: lands on ${account.home}`, page.url().includes(account.home), page.url());
  if (role !== "ADMIN") {
    record(`${role}: no admin chrome`, !nav.labels.includes("Parents"), JSON.stringify(nav.labels));
  } else {
    record("ADMIN: admin chrome present", nav.labels.includes("Parents"), JSON.stringify(nav.labels));
  }
  record(`${role}: home link is current`, nav.active.some((a) => a.startsWith("Dashboard")), JSON.stringify(nav.active));
  record(`${role}: role surfaced`, (await page.evaluate(() => document.body.innerText)).includes(role));
  console.log(`      nav(${nav.count}) groups=${JSON.stringify(nav.groups)}`);
  console.log(`      labels=${JSON.stringify(nav.labels)}`);
}

/* --- shell mechanics --- */
await page.setViewport({ width: 1500, height: 1000 });
await signIn(ACCOUNTS.STUDENT.email);
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 600));

record("desktop: mobile menu button hidden", (await visible(".mobile-menu-trigger")).startsWith("none"), await visible(".mobile-menu-trigger"));
record("desktop: drawer close button hidden", (await visible(".sidebar-mobile-close")).startsWith("none"), await visible(".sidebar-mobile-close"));
record("desktop: collapse button shown", (await visible(".sidebar-collapse")) === "grid/visible", await visible(".sidebar-collapse"));

// Nested route activation.
for (const [route, expect] of [
  ["/transport", "Transport"],
  ["/alumni/events", "Events"],
  ["/admin/transport", "Transport"],
  ["/faculty/risk", "Risk Indicators"],
  ["/certificates", "Certificates"],
]) {
  await signIn(route.startsWith("/admin") ? ACCOUNTS.ADMIN.email : route.startsWith("/faculty") ? ACCOUNTS.FACULTY.email : ACCOUNTS.STUDENT.email);
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const nav = await navInfo();
  const activeLabels = nav.active.map((a) => a.split("[")[0]);
  const current = nav.active.filter((a) => a.endsWith("[page]")).length;
  record(`${route} activates ${expect}`, activeLabels.includes(expect) && current === 1, JSON.stringify(nav.active));
}

// Command palette.
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 500));
await page.click(".search-trigger");
await new Promise((r) => setTimeout(r, 300));
const paletteOpen = await page.evaluate(() => {
  const dialog = document.querySelector(".command-palette__panel");
  if (!dialog) return null;
  return { role: dialog.getAttribute("role"), options: dialog.querySelectorAll("[role='option']").length, focused: document.activeElement?.className };
});
record("command palette opens with options", Boolean(paletteOpen && paletteOpen.options > 5), JSON.stringify(paletteOpen));
await page.type(".command-palette__input", "mess");
await new Promise((r) => setTimeout(r, 250));
const filtered = await page.evaluate(() => [...document.querySelectorAll(".command-palette__item")].map((n) => n.textContent.trim()));
record("command palette filters", filtered.length === 1 && filtered[0].includes("Mess & Canteen"), JSON.stringify(filtered));
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 900));
record("command palette navigates", page.url().includes("/mess"), page.url());
record("command palette closed after navigation", (await page.$(".command-palette__panel")) === null);

// Account menu + logout.
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 500));
await page.click(".profile-button");
await new Promise((r) => setTimeout(r, 250));
const menu = await page.evaluate(() => {
  const el = document.querySelector(".profile-menu");
  return el ? { role: el.getAttribute("role"), items: [...el.querySelectorAll("[role='menuitem']")].map((n) => n.textContent.trim()) } : null;
});
record("account menu is a menu with items", Boolean(menu && menu.role === "menu" && menu.items.length === 2), JSON.stringify(menu));
await page.screenshot({ path: "artifacts/shell-account-menu.png" });
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 200));
record("account menu closes on Escape", (await page.$(".profile-menu")) === null);

// Compact sidebar.
await page.click(".sidebar-collapse");
await new Promise((r) => setTimeout(r, 400));
const compact = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  return { width: Math.round(sidebar.getBoundingClientRect().width), compact: sidebar.classList.contains("sidebar--compact"), labelHidden: getComputedStyle(document.querySelector(".nav-label")).display };
});
record("sidebar collapses to icons", compact.compact && compact.width < 100 && compact.labelHidden === "none", JSON.stringify(compact));
await page.screenshot({ path: "artifacts/shell-compact.png" });
await page.click(".sidebar-collapse");
await new Promise((r) => setTimeout(r, 400));

// Mobile.
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 700));
const mobileClosed = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  return {
    visibility: getComputedStyle(sidebar).visibility,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    trigger: getComputedStyle(document.querySelector(".mobile-menu-trigger")).display,
  };
});
record("mobile: drawer closed and off the tab order", mobileClosed.visibility === "hidden", JSON.stringify(mobileClosed));
record("mobile: no horizontal overflow", mobileClosed.overflow <= 1, `overflow=${mobileClosed.overflow}px`);
record("mobile: menu trigger visible", mobileClosed.trigger === "grid", mobileClosed.trigger);

await page.click(".mobile-menu-trigger");
await new Promise((r) => setTimeout(r, 500));
const mobileOpen = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  return {
    visibility: getComputedStyle(sidebar).visibility,
    left: Math.round(sidebar.getBoundingClientRect().left),
    focused: document.activeElement?.getAttribute("aria-label"),
    hasAi: document.body.innerText.includes("AI Assistant"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
record("mobile: drawer opens on screen", mobileOpen.visibility === "visible" && mobileOpen.left === 0, JSON.stringify(mobileOpen));
record("mobile: focus moves into the drawer", mobileOpen.focused === "Close navigation", String(mobileOpen.focused));
record("mobile: drawer lists the navigation", mobileOpen.hasAi);
record("mobile: still no horizontal overflow with drawer open", mobileOpen.overflow <= 1, `overflow=${mobileOpen.overflow}px`);
await page.screenshot({ path: "artifacts/shell-mobile-drawer.png" });
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 400));
record("mobile: Escape closes the drawer", (await page.evaluate(() => getComputedStyle(document.querySelector(".sidebar")).visibility)) === "hidden");
record("mobile: focus returns to the trigger", (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Open menu");

// Tab order sanity: the closed drawer must not be reachable.
const reachable = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  return sidebar.contains(document.activeElement);
});
record("mobile: focus is not trapped in the closed drawer", !reachable);

await page.screenshot({ path: "artifacts/shell-mobile.png", fullPage: true });

/* --- overflow sweep across roles and routes --- */
await page.setViewport({ width: 1500, height: 1000 });
const ROUTES = [
  [ACCOUNTS.STUDENT.email, ["/dashboard", "/attendance", "/timetable", "/recommendations", "/fees", "/hostel", "/transport", "/certificates", "/library", "/placements", "/mess", "/alumni", "/ai", "/profile"]],
  [ACCOUNTS.FACULTY.email, ["/faculty", "/faculty/timetable", "/faculty/risk", "/library", "/placements", "/alumni", "/ai"]],
  [ACCOUNTS.ADMIN.email, ["/admin", "/admin/timetable", "/admin/risk", "/admin/parents", "/admin/hostel", "/admin/transport", "/admin/certificates", "/admin/library", "/admin/placements", "/admin/mess", "/admin/alumni"]],
  [ACCOUNTS.PARENT.email, ["/parent", "/ai", "/profile"]],
  [ACCOUNTS.ALUMNI.email, ["/alumni", "/alumni/events", "/alumni/campaigns", "/alumni/mentorship", "/alumni/profile"]],
];
for (const [email, routes] of ROUTES) {
  await signIn(email);
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 450));
    const probe = await page.evaluate(() => {
      const root = document.querySelector(".app-shell");
      const light = [];
      for (const el of document.querySelectorAll(".page-surface *")) {
        const bg = getComputedStyle(el).backgroundColor;
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
        if (!m) continue;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (r > 200 && g > 200 && b > 200) light.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}=${bg}`);
      }
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        hasShell: Boolean(root),
        light: [...new Set(light)].slice(0, 4),
        heading: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
      };
    });
    record(
      `${route} renders in the shell`,
      probe.hasShell && probe.overflow <= 1 && probe.light.length === 0,
      `h1="${probe.heading}" overflow=${probe.overflow} light=${JSON.stringify(probe.light)}`,
    );
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== SHELL PROBE SUMMARY ===`);
console.log(`PASS: ${results.length - failed.length}`);
console.log(`FAIL: ${failed.length}`);
console.log(`TOTAL: ${results.length}`);
if (failed.length) process.exit(1);
