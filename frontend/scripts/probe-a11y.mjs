/**
 * Ad-hoc check for the two accessibility promises the shell makes that the E2E
 * suites do not cover: reduced motion, and a visible focus ring.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const PASSWORD = "SmartCampus@2026";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
page.setDefaultTimeout(20000);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.waitForSelector("#email");
await page.type("#email", "aarav.sharma@smartcampus.edu");
await page.type("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 800));

const durations = async (label) => {
  const out = await page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, animation: cs.animationDuration };
    };
    return { nav: read(".nav-link"), topbar: read(".topbar"), palette: read(".command-palette") };
  });
  console.log(`${label}: nav=${JSON.stringify(out.nav)} topbar=${JSON.stringify(out.topbar)}`);
  return out;
};

const normal = await durations("motion allowed ");
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await new Promise((r) => setTimeout(r, 300));
const reduced = await durations("reduced motion ");

// Focus ring: tab to the first nav link and read the outline.
await page.keyboard.press("Tab");
await page.keyboard.press("Tab");
await page.keyboard.press("Tab");
const focus = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, cls: String(el.className).slice(0, 40), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
});
console.log("focused element:", JSON.stringify(focus));

// Chrome reports the collapsed duration as "1e-05s"; compare numerically.
const collapsed = (value) => (value ?? "").split(",").every((d) => parseFloat(d) <= 0.001);

const ok =
  normal.nav.transition !== reduced.nav.transition &&
  collapsed(reduced.nav.transition) &&
  collapsed(reduced.topbar.transition) &&
  focus !== null &&
  focus.outline.startsWith("solid");

console.log(`\nreduced motion collapses transitions: ${ok ? "PASS" : "FAIL"}`);
console.log(`focus ring present: ${focus && focus.outline.startsWith("solid") ? "PASS" : "FAIL"} (${focus?.outline})`);

await browser.close();
process.exit(ok ? 0 : 1);
