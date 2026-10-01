// render.js — pixel-perfect report image. Uses the real Canva artwork as a
// 1920x4300 background (public/assets/report-bg.png, exported text-free) and
// overlays the daily text at each element's exact Canva coordinates. Rendered
// to PNG with a system Chrome/Edge via puppeteer-core.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "..", "public", "assets");

// The design uses Gilroy. The .ttf files are embedded via @font-face (see
// fontFaceCss) so the headless browser renders the exact strokes.
const FONT = "'Gilroy', 'Segoe UI', Arial, sans-serif";
const FONT_DIR = path.join(__dirname, "..", "public", "assets", "fonts");
const FONT_FILES = [
  { file: "Gilroy-Regular.ttf", weight: 400 },
  { file: "Gilroy-Medium.ttf", weight: 500 },
  { file: "Gilroy-Bold.ttf", weight: 700 },
];

function fontFaceCss() {
  const faces = FONT_FILES.map(({ file, weight }) => {
    const p = path.join(FONT_DIR, file);
    if (!fs.existsSync(p)) return "";
    const b64 = fs.readFileSync(p).toString("base64");
    return `@font-face{font-family:'Gilroy';font-weight:${weight};font-style:normal;` +
      `src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  });
  // Great Vibes — used for the weekly script tagline.
  const gv = path.join(FONT_DIR, "GreatVibes-Regular.ttf");
  if (fs.existsSync(gv)) {
    const b64 = fs.readFileSync(gv).toString("base64");
    faces.push(`@font-face{font-family:'Great Vibes';font-weight:400;font-style:normal;` +
      `src:url(data:font/ttf;base64,${b64}) format('truetype');}`);
  }
  return faces.join("\n");
}

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

export function findBrowser() {
  for (const p of BROWSER_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Each field: exact Canva box (top/left/width) + tuned typography.
// valign "center" vertically centers within `height`; "top" anchors to top.
// align is horizontal text alignment within the box.
const DAILY_FIELDS = [
  { key: "headline",     top: 305.6,  left: 578.2,  width: 763.7, height: 171, size: 44, color: "#ffffff", align: "center", weight: 700, lh: 1.15, valign: "center" },
  { key: "dateline",     top: 511.8,  left: 133.6,  width: 891.4, height: 47,  size: 30, color: "#14253a", align: "left",   weight: 500, lh: 1.1,  valign: "center" },
  { key: "price_movement", top: 1240.2, left: 180.7, width: 397.5, height: 700, size: 25, color: "#16273a", align: "left", weight: 400, lh: 1.45, valign: "top" },
  { key: "geopolitical",   top: 1240.2, left: 739.3, width: 431.0, height: 720, size: 25, color: "#16273a", align: "left", weight: 400, lh: 1.45, valign: "top" },
  { key: "macro",          top: 1240.2, left: 1302.0, width: 408.8, height: 700, size: 25, color: "#16273a", align: "left", weight: 400, lh: 1.45, valign: "top" },
  { key: "gold_technicals",   top: 3327.4, left: 126.4,  width: 762.1, height: 106, size: 27, color: "#16273a", align: "left", weight: 400, lh: 1.4, valign: "top" },
  { key: "silver_technicals", top: 3345.5, left: 1031.7, width: 784.3, height: 110, size: 27, color: "#16273a", align: "left", weight: 400, lh: 1.4, valign: "top" },
  { key: "canva_gold_intl_support",      top: 2770.2, left: 115.7,  width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_gold_intl_resistance",   top: 2823.5, left: 115.7,  width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_gold_dom_support",       top: 3044.0, left: 115.7,  width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_gold_dom_resistance",    top: 3097.3, left: 115.7,  width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_silver_intl_support",    top: 2770.2, left: 1017.8, width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_silver_intl_resistance", top: 2823.5, left: 1017.8, width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_silver_dom_support",     top: 3044.0, left: 1017.8, width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
  { key: "canva_silver_dom_resistance",  top: 3097.3, left: 1017.8, width: 764, height: 37, size: 30, color: "#ffffff", align: "center", weight: 500, lh: 1.1, valign: "center" },
];

// ---------------------------------------------------------------------------
// WEEKLY template — coordinates read from the weekly Canva design DAHMWiZkwUI
// (941x1904). Composite blocks (multi-size text, colored values) use custom
// html builders; the price chart is generated as inline SVG.
// ---------------------------------------------------------------------------

const NAVY = "#1A2940";
const GOLD = "#C99A2C";
const SILVER_GREY = "#8E9299";
const BODY_INK = "#3A3F47";

const lines = (s) => String(s ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);

// Clamp text to a max length at a word boundary (safety net so an over-long AI
// outlook can't overflow its box).
function clamp(s, max) {
  s = String(s ?? "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  // Prefer ending on a complete sentence (no dangling "However, a…").
  const lastDot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("."));
  if (lastDot > max * 0.5) return cut.slice(0, lastDot + 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:]+$/, "") + "…";
}

// Hero headline: line 1 gold, line 2 silver-grey (like "GOLD SHINES. / SILVER SURGES.")
function heroHtml(d) {
  const ls = lines(d.wk_headline);
  return ls.map((l, i) =>
    `<div style="color:${i % 2 === 0 ? GOLD : SILVER_GREY};font-size:78px;font-weight:700;line-height:1.12;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">${esc(l)}</div>`
  ).join("");
}

// Stat callout inside the navy band: small caps label, big value, small sub.
function statHtml(label, value, sub) {
  return (
    `<div style="color:#fff;font-size:12.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;line-height:1.25;">${esc(label)}</div>` +
    `<div style="color:#fff;font-size:32px;font-weight:700;line-height:1.15;">${esc(value)}</div>` +
    `<div style="color:#fff;font-size:13px;font-weight:400;line-height:1.3;">${esc(sub)}</div>`
  );
}

// Summary column: fixed gold heading + bold title + body, centered.
function summaryHtml(heading, title, body) {
  return (
    `<div style="color:${GOLD};font-size:15.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:11px;">${esc(heading)}</div>` +
    `<div style="color:${NAVY};font-size:14.5px;font-weight:700;line-height:1.35;margin-bottom:3px;">${esc(title)}</div>` +
    `<div style="color:${BODY_INK};font-size:15px;font-weight:500;line-height:1.4;">${esc(body)}</div>`
  );
}

// Technical-levels box: Support value in green, Resistance value in red
// (matching the Canva original — same scheme across all four columns).
const TECH_GREEN = "#0D7D3F";
const TECH_RED = "#C0392B";
function techHtml(support, resistance) {
  return (
    `<div style="color:${NAVY};font-size:10.5px;font-weight:700;line-height:1.25;">Support</div>` +
    `<div style="color:${TECH_GREEN};font-size:11.5px;font-weight:700;line-height:1.25;margin-bottom:6px;">${esc(support)}</div>` +
    `<div style="color:${NAVY};font-size:10.5px;font-weight:700;line-height:1.25;">Resistance</div>` +
    `<div style="color:${TECH_RED};font-size:11.5px;font-weight:700;line-height:1.25;">${esc(resistance)}</div>`
  );
}

const WEEKLY_FIELDS = [
  { key: "wk_headline", top: 182.0, left: 37.7, width: 585, height: 200, html: heroHtml },
  { key: "wk_tagline", top: 374.0, left: 37.7, width: 460, height: 78,
    html: (d) => `<div style="font-family:'Great Vibes','Segoe Script',cursive;font-size:50px;color:#2A2A2A;line-height:1.1;">${esc(d.wk_tagline)}</div>` },
  { key: "wk_date", top: 30.8, left: 643.9, width: 279, height: 18,
    html: (d) => `<div style="font-size:12px;color:${NAVY};text-align:right;"><b>Weekly Report</b> | ${esc(d.date)}</div>` },
  { key: "wk_gold_stat", top: 498.0, left: 124.6, width: 165, height: 80,
    html: (d) => statHtml(d.wk_gold_stat_label, d.wk_gold_stat_value, d.wk_gold_stat_sub) },
  { key: "wk_silver_stat", top: 498.0, left: 345.5, width: 165, height: 80,
    html: (d) => statHtml(d.wk_silver_stat_label, d.wk_silver_stat_value, d.wk_silver_stat_sub) },
  { key: "wk_subhead_left", top: 656.0, left: 144.4, width: 268, height: 80,
    html: (d) => `<div style="font-size:15px;font-weight:600;color:${NAVY};line-height:1.34;">${lines(d.wk_subhead_left).map(esc).join("<br/>")}</div>` },
  { key: "wk_subhead_right", top: 656.0, left: 617.6, width: 292, height: 80,
    html: (d) => `<div style="font-size:15px;font-weight:600;color:${NAVY};line-height:1.34;">${lines(d.wk_subhead_right).map(esc).join("<br/>")}</div>` },
  { key: "wk_geo", top: 858.0, left: 41.5, width: 239, height: 196, align: "center",
    html: (d) => summaryHtml("Geopolitics", d.wk_geo_title, d.wk_geo_body) },
  { key: "wk_fed", top: 858.0, left: 324.7, width: 260, height: 196, align: "center",
    html: (d) => summaryHtml("Inflation & The Fed", d.wk_fed_title, d.wk_fed_body) },
  { key: "wk_fx", top: 858.0, left: 633.5, width: 251, height: 196, align: "center",
    html: (d) => summaryHtml("Currencies", d.wk_fx_title, d.wk_fx_body) },
  // Outlook body sits in the dark box, below the "Cautiously Bullish" title
  // (~1431) and above "KEY CATALYSTS AHEAD:" (~1641).
  { key: "wk_outlook", top: 1516.0, left: 536, width: 266, height: 120,
    html: (d) => `<div style="font-size:13px;color:#fff;line-height:1.5;">${esc(clamp(d.wk_outlook, 215))}</div>` },
  { key: "wk_catalysts", top: 1663.0, left: 558, width: 292, height: 48,
    html: (d) => lines(d.wk_catalysts).slice(0, 2).map((l) =>
      `<div style="font-size:12px;color:#fff;height:20px;line-height:18px;">${esc(l)}</div>`).join("") },
  // Technical levels — 2x2 grid (left), values placed below each header.
  { key: "wk_tech_gold_comex", top: 1531.0, left: 84, width: 150, height: 100,
    html: (d) => techHtml(d.wk_gold_comex_support, d.wk_gold_comex_resistance) },
  { key: "wk_tech_gold_mcx", top: 1531.0, left: 315, width: 150, height: 100,
    html: (d) => techHtml(d.wk_gold_mcx_support, d.wk_gold_mcx_resistance) },
  { key: "wk_tech_silver_comex", top: 1657.0, left: 84, width: 150, height: 100,
    html: (d) => techHtml(d.wk_silver_comex_support, d.wk_silver_comex_resistance) },
  { key: "wk_tech_silver_mcx", top: 1657.0, left: 315, width: 150, height: 100,
    html: (d) => techHtml(d.wk_silver_mcx_support, d.wk_silver_mcx_resistance) },
  // Live rates (footer band ~1992).
  { key: "wk_rates_label", top: 1997.0, left: 515, width: 110, height: 36,
    html: (d) => `<div style="font-size:12px;font-weight:700;color:${NAVY};line-height:1.3;">LIVE RATES</div>` +
                 `<div style="font-size:9.5px;color:#6a6f78;line-height:1.3;">${esc(d.wk_rate_time)}</div>` },
  { key: "wk_rates_gold", top: 1992.0, left: 652, width: 130, height: 40,
    html: (d) => `<div style="font-size:13px;font-weight:700;color:${NAVY};line-height:1.35;">GOLD 24K</div>` +
                 `<div style="font-size:12px;color:${NAVY};line-height:1.3;">${esc(d.wk_rate_gold)}</div>` },
  { key: "wk_rates_silver", top: 1992.0, left: 799, width: 130, height: 40,
    html: (d) => `<div style="font-size:13px;font-weight:700;color:${NAVY};line-height:1.35;">SILVER 999</div>` +
                 `<div style="font-size:12px;color:${NAVY};line-height:1.3;">${esc(d.wk_rate_silver)}</div>` },
];

// --- weekly price charts (SVG) -----------------------------------------------
// Two separate single-metal line charts: gold (left slot) and silver (right
// slot). Each has its own Y axis — no dual-axis confusion. Slot titles
// ("MCX Gold Spot" / "MCX Silver Spot") live in the background image.

const GOLD_CHART_BOX = { top: 1126, left: 24, width: 430, height: 250 };
const SILVER_CHART_BOX = { top: 1126, left: 476, width: 430, height: 250 };

const csvList = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const csvNums = (s) => csvList(s).map((x) => parseFloat(x.replace(/[^\d.-]/g, ""))).filter((n) => Number.isFinite(n));

function niceScale(values) {
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const step = (max - min) / 4;
  return { min, max, ticks: [0, 1, 2, 3, 4].map((i) => min + step * i) };
}

const fmtNum = (n) => Math.round(n).toLocaleString("en-US");

// One single-metal line chart positioned at `box`.
function buildSingleChart(values, dates, color, box) {
  const { top, left, width: W, height: H } = box;
  const wrap = (inner) => `<div style="position:absolute;top:${top}px;left:${left}px;width:${W}px;height:${H}px;">${inner}</div>`;
  const n = Math.min(values.length, dates.length);
  if (n < 2) {
    return wrap(`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#b9bec6;font-size:11px;text-align:center;padding:0 20px;">Chart data missing — add a price table to the .docx or fill the chart fields.</div>`);
  }
  const m = { top: 16, right: 18, bottom: 26, left: 58 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const sc = niceScale(values.slice(0, n));
  const x = (i) => m.left + (pw * i) / (n - 1);
  const y = (v) => m.top + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
  const path = values.slice(0, n).map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = values.slice(0, n).map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="${color}"/>`).join("");
  const grid = sc.ticks.map((t) => `<line x1="${m.left}" y1="${y(t).toFixed(1)}" x2="${W - m.right}" y2="${y(t).toFixed(1)}" stroke="#e3e3e3" stroke-dasharray="3,3"/>`).join("");
  const yl = sc.ticks.map((t) => `<text x="${m.left - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8a8a8a">${fmtNum(t)}</text>`).join("");
  const xl = dates.slice(0, n).map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9.5" fill="#8a8a8a">${esc(d)}</text>`).join("");
  return wrap(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial, sans-serif">
    ${grid}${yl}${xl}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3"/>${dots}
  </g></svg>`);
}

function buildWeeklyChartSvg(d) {
  const dates = csvList(d.chart_dates);
  const gold = csvNums(d.chart_gold);
  const silver = csvNums(d.chart_silver);
  return buildSingleChart(gold, dates, GOLD, GOLD_CHART_BOX) +
         buildSingleChart(silver, dates, SILVER_GREY, SILVER_CHART_BOX);
}

// Template registry. Each report type maps to a background image, page size,
// the dateline title, and the field layout. weekly-b2b / weekly-b2c share the
// same "weekly" template (only the CONTENT differs by audience).
export const TEMPLATES = {
  daily:  { bg: "report-bg.png", title: "Augmont Daily Report",  page: { w: 1920, h: 4300 }, fields: DAILY_FIELDS },
  weekly: { bg: "weekly-bg.png", title: "Augmont Weekly Report", page: { w: 941, h: 2059 }, fields: WEEKLY_FIELDS, extra: buildWeeklyChartSvg },
};

// Map an incoming report type to its template key.
export function templateKeyFor(type) {
  if (type === "weekly-b2b" || type === "weekly-b2c" || type === "weekly") return "weekly";
  return "daily";
}

function bgPath(templateKey) {
  return path.join(ASSETS, TEMPLATES[templateKey].bg);
}

export function renderConfigured(templateKey = "daily") {
  const t = TEMPLATES[templateKey];
  return Boolean(findBrowser()) && t && fs.existsSync(bgPath(templateKey)) && t.fields.length > 0;
}

function fieldValue(f, d, tmpl) {
  if (f.key === "dateline") {
    const date = d.date ? ` | ${esc(d.date)}` : "";
    return `<b style="font-weight:700">${esc(tmpl.title)}</b>${date}`;
  }
  return esc(d[f.key]);
}

function bgDataUri(templateKey) {
  const b64 = fs.readFileSync(bgPath(templateKey)).toString("base64");
  return `data:image/png;base64,${b64}`;
}

export function buildReportHtml(d, templateKey = "daily") {
  const tmpl = TEMPLATES[templateKey];
  const { w, h } = tmpl.page;
  const boxes = tmpl.fields.map((f) => {
    // Custom-html fields supply their own inner markup (multi-size composite blocks).
    if (f.html) {
      return `<div style="position:absolute;top:${f.top}px;left:${f.left}px;width:${f.width}px;height:${f.height}px;
        text-align:${f.align || "left"};overflow:hidden;">${f.html(d)}</div>`;
    }
    const justify = f.valign === "center" ? "center" : "flex-start";
    return `<div style="position:absolute;top:${f.top}px;left:${f.left}px;width:${f.width}px;height:${f.height}px;
      display:flex;flex-direction:column;justify-content:${justify};
      font-size:${f.size}px;line-height:${f.lh};font-weight:${f.weight};color:${f.color};
      text-align:${f.align};overflow:hidden;">
      <div>${fieldValue(f, d, tmpl)}</div></div>`;
  }).join("\n");

  const extra = tmpl.extra ? tmpl.extra(d) : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    ${fontFaceCss()}
    * { margin:0; padding:0; box-sizing:border-box; }
    #report { position:relative; width:${w}px; height:${h}px;
      background:url('${bgDataUri(templateKey)}') no-repeat top left; background-size:${w}px ${h}px;
      font-family:${FONT}; -webkit-font-smoothing:antialiased; }
  </style></head><body>
    <div id="report">${boxes}${extra}</div>
  </body></html>`;
}

export async function renderPng(data, templateKey = "daily") {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error("No Chrome/Edge found. Set BROWSER_PATH in .env.");
  const tmpl = TEMPLATES[templateKey];
  if (!tmpl) throw new Error(`Unknown template: ${templateKey}`);
  if (!fs.existsSync(bgPath(templateKey))) throw new Error(`Background image missing: public/assets/${tmpl.bg}`);
  if (!tmpl.fields.length) throw new Error(`The ${templateKey} template has no fields configured yet.`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: [
      "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      // Disable the crash reporter so Chrome doesn't lock CrashpadMetrics files
      // (causes EPERM on Windows when puppeteer cleans up its temp profile).
      "--disable-crash-reporter", "--no-crashpad", "--disable-breakpad",
      "--disable-features=Crashpad",
    ],
  });
  let png;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: tmpl.page.w, height: tmpl.page.h, deviceScaleFactor: 1 });
    await page.setContent(buildReportHtml(data, templateKey), { waitUntil: "load" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const el = await page.$("#report");
    png = await el.screenshot({ type: "png" });
  } finally {
    // The screenshot is already captured; ignore Windows temp-profile cleanup
    // errors (EPERM unlinking locked CrashpadMetrics files) so they don't fail
    // the render.
    try { await browser.close(); } catch { /* ignore cleanup EPERM */ }
  }
  return png;
}
