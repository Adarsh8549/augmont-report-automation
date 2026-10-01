// parseDocx.js — Extract Augmont daily-report sections from a .docx buffer.
// Ported from scripts/parse_docx.py. Returns a plain object with all fields.
//
// A .docx is a zip; the body text lives in word/document.xml. We pull every
// paragraph's text, then use keyword anchors + table regexes to locate
// sections. Parsing is best-effort — the webapp shows the result in an
// editable form so a human can correct anything before publishing.

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const MONTHS = {
  jan: "January", feb: "February", mar: "March", apr: "April",
  may: "May", jun: "June", jul: "July", aug: "August",
  sep: "September", oct: "October", nov: "November", dec: "December",
};

export function extractDateFromFilename(filename = "") {
  const m = filename.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{4})/i);
  if (!m) return "";
  const [, day, mon, year] = m;
  return `${MONTHS[mon.toLowerCase()]} ${parseInt(day, 10)}, ${year}`;
}

function stripPrefix(text, ...prefixes) {
  for (const p of prefixes) {
    if (text.toLowerCase().startsWith(p.toLowerCase())) {
      return text.slice(p.length).replace(/^[\s–\-:]+/, "").trim();
    }
  }
  return text;
}

// Collect all string content beneath a node (used for a <w:t> value, which may
// be a string or an array of strings).
function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return Object.values(node).map(textOf).join("");
}

// Reconstruct a paragraph's visible text by collecting ONLY <w:t> runs (plus
// tabs/breaks), in document order. This deliberately ignores VML/drawing
// geometry and other non-text nodes. Parser is { ignoreAttributes: true,
// trimValues: false } so inter-run spaces are preserved.
function collectText(node) {
  if (node == null || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(collectText).join("");
  let out = "";
  for (const key of Object.keys(node)) {
    if (key === "w:t") out += textOf(node[key]);
    else if (key === "w:tab") out += "\t";
    else if (key === "w:br" || key === "w:cr") out += "\n";
    else out += collectText(node[key]);
  }
  return out;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

// In the source table, labels and values sit in separate cells (all labels
// concatenated, then all values), so we can't pair them by adjacency. Instead
// we extract value tokens in document order, which is reliable: the gold row
// precedes the silver row, and within the values run the order is always
// [support, resistance].
function parseSupportResistance(fullText) {
  const collapse = (s) => s.replace(/\s+/g, " ").trim();
  const all = (re) => [...fullText.matchAll(re)].map((m) => collapse(m[0]));

  // "$4400/oz" tokens, in order: gold support, gold resistance, silver support, silver resistance.
  const oz = all(/\$\s*[\d.,]+\s*\/\s*oz/gi);
  // "Rs 155,000/10 gm" tokens (gold domestic): support, resistance.
  const gm = all(/Rs\s*[\d.,]+\s*\/\s*10\s*gm/gi);
  // "Rs 258,000/kg" tokens (silver domestic): support, resistance.
  const kg = all(/Rs\s*[\d.,]+\s*\/\s*kg/gi);

  return {
    gold_intl_support:      oz[0] || "",
    gold_intl_resistance:   oz[1] || "",
    silver_intl_support:    oz[2] || "",
    silver_intl_resistance: oz[3] || "",
    gold_dom_support:       gm[0] || "",
    gold_dom_resistance:    gm[1] || "",
    silver_dom_support:     kg[0] || "",
    silver_dom_resistance:  kg[1] || "",
  };
}

// Collapse the immediate-duplicate runs that text boxes sometimes produce,
// e.g. "5-June-20265-June-2026" or a line repeated back-to-back.
function dedupeRepeat(s) {
  const half = Math.floor(s.length / 2);
  if (s.length % 2 === 0 && s.slice(0, half) === s.slice(half)) return s.slice(0, half);
  return s;
}

const SKIP = new Set([
  "fundamental news and triggers",
  "technical triggers",
  "support and resistance",
  "augmont bullion daily report",
]);

export function parseDocx(buffer, filename = "") {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Not a valid .docx (missing word/document.xml)");
  const xml = entry.getData().toString("utf8");

  // parseTagValue:false keeps every run as a string — otherwise a run like
  // "00" is coerced to the number 0 and digits are silently dropped.
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: false, parseTagValue: false });
  const doc = parser.parse(xml);

  // Navigate to body. Tag names carry the w: prefix.
  const body = doc?.["w:document"]?.["w:body"] ?? {};
  const paraNodes = asArray(body["w:p"]);

  const paragraphs = paraNodes
    .map((p) => dedupeRepeat(collectText(p).replace(/\s+\n/g, "\n").trim()))
    .filter((t) => t.length > 0);

  const data = {
    headline: "",
    date: extractDateFromFilename(filename),
    price_movement: "",
    geopolitical: "",
    macro: "",
    gold_technicals: "",
    silver_technicals: "",
  };

  for (const raw of paragraphs) {
    const text = raw.trim();
    const tl = text.toLowerCase();
    if (SKIP.has(tl) || tl.startsWith("disclaimer")) continue;

    if (tl.startsWith("price movement")) {
      data.price_movement = stripPrefix(text, "Price Movement");
    } else if (tl.startsWith("geopolitical")) {
      data.geopolitical = stripPrefix(text, "Geopolitical Developments", "Geopolitical");
    } else if (tl.startsWith("macro")) {
      data.macro = stripPrefix(text, "Macro-economic Signals", "Macro-economic", "Macro");
    } else if (tl.startsWith("gold") && !data.gold_technicals && !tl.includes("support") && !tl.includes("resistance")) {
      data.gold_technicals = text;
    } else if (tl.startsWith("silver") && !data.silver_technicals && !tl.includes("support") && !tl.includes("resistance")) {
      data.silver_technicals = text;
    } else if (!data.headline && text.length > 12 && !tl.includes("daily report")) {
      data.headline = text;
    }
  }

  // Support/resistance: scan the full document text (covers table cells too).
  const tableNodes = asArray(body["w:tbl"]);
  const tableText = tableNodes.map(collectText).join("\n");
  const fullText = paragraphs.join("\n") + "\n" + tableText;
  const sr = parseSupportResistance(fullText);
  Object.assign(data, sr);

  // Pre-formatted strings ready for Canva fields.
  data.canva_gold_intl_support      = `Gold Support Level: ${sr.gold_intl_support}`;
  data.canva_gold_intl_resistance   = `Gold Resistance Level: ${sr.gold_intl_resistance}`;
  data.canva_gold_dom_support       = `Gold Support Level: ${sr.gold_dom_support}`;
  data.canva_gold_dom_resistance    = `Gold Resistance Level: ${sr.gold_dom_resistance}`;
  data.canva_silver_intl_support    = `Silver Support Level: ${sr.silver_intl_support}`;
  data.canva_silver_intl_resistance = `Silver Resistance Level: ${sr.silver_intl_resistance}`;
  data.canva_silver_dom_support     = `Silver Support Level: ${sr.silver_dom_support}`;
  data.canva_silver_dom_resistance  = `Silver Resistance Level: ${sr.silver_dom_resistance}`;

  const firstSentence = (data.price_movement.split(".")[0] || "").trim();
  data.excerpt = firstSentence ? firstSentence + "." : "";

  return data;
}

// ---------------------------------------------------------------------------
// Weekly report parser. The weekly doc is long-form prose (not one-line
// sections like the daily), so we extract:
//   - fullText: the cleaned narrative, for the AI summarize/restructure step
//   - date: from the document text or filename
//   - chart data: a table of daily closes (Date | Gold | Silver) if present
// ---------------------------------------------------------------------------

const MONTHS_FULL = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };

export function parseWeeklyDocx(buffer, filename = "") {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Not a valid .docx (missing word/document.xml)");
  const xml = entry.getData().toString("utf8");
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: false, parseTagValue: false });
  const doc = parser.parse(xml);
  const body = doc?.["w:document"]?.["w:body"] ?? {};

  const paragraphs = asArray(body["w:p"])
    .map((p) => dedupeRepeat(collectText(p).replace(/\s+\n/g, "\n").trim()))
    .filter((t) => t.length > 0);

  // Narrative text: skip disclaimers and header boilerplate.
  const narrative = paragraphs.filter((t) => {
    const tl = t.toLowerCase();
    return !tl.startsWith("disclaimer") && !tl.includes("weekly blog") && t.length > 2;
  });
  const fullText = narrative.join("\n\n").slice(0, 10000);

  // Date: "8 June 2026" style in text, else from filename.
  let date = "";
  const dm = fullText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (dm) date = `${MONTHS_FULL[dm[2].toLowerCase().slice(0, 3)]} ${parseInt(dm[1], 10)}, ${dm[3]}`;
  if (!date) date = extractDateFromFilename(filename);

  // Chart table: find a table whose rows are (date-ish label, gold price,
  // silver price). Robust to column order / extra columns: gold = the
  // thousands-scale number, silver = the sub-500 number.
  const chart = { dates: [], gold: [], silver: [] };
  // A pure numeric/price cell: only digits, comma, decimal, currency, spaces —
  // NO letters (so "2 Jun" is NOT treated as the number 2).
  const asNum = (s) => {
    const cleaned = String(s).replace(/[$₹,\s]/g, "");
    if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
    return null;
  };
  for (const tbl of asArray(body["w:tbl"])) {
    const rows = asArray(tbl["w:tr"]).map((tr) =>
      asArray(tr["w:tc"]).map((tc) => collectText(tc).replace(/\s+/g, " ").trim())
    );
    const dataRows = [];
    for (const cells of rows) {
      const label = cells.find((c) => c && asNum(c) == null && !/gold|silver|comex|mcx|date|price/i.test(c));
      const nums = cells.map(asNum).filter((n) => n != null);
      const gold = nums.find((n) => n >= 500);
      const silver = nums.find((n) => n > 0 && n < 500);
      if (label && gold != null && silver != null) dataRows.push({ label, gold, silver });
    }
    if (dataRows.length >= 2) {
      for (const r of dataRows) { chart.dates.push(r.label); chart.gold.push(r.gold); chart.silver.push(r.silver); }
      break;
    }
  }

  // Embedded chart images: the doc's two candlestick screenshots. Pick the
  // chart-shaped PNGs (landscape, decent size) in file order -> gold, silver.
  const chartImages = [];
  const media = zip.getEntries()
    .filter((e) => /word\/media\/image[\w-]+\.png$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  for (const e of media) {
    const buf = e.getData();
    const sz = pngSize(buf);
    if (!sz) continue;
    const ar = sz.w / sz.h;
    if (sz.w >= 450 && sz.h >= 300 && ar >= 1.4 && ar <= 2.2) {
      chartImages.push("data:image/png;base64," + buf.toString("base64"));
    }
  }
  chart.images = { gold: chartImages[0] || "", silver: chartImages[1] || "" };

  return { fullText, date, chart };
}

// Read width/height from a PNG buffer (IHDR chunk), or null if not a PNG.
function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
