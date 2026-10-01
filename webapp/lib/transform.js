// transform.js — rewrite parsed report content for a target audience (B2B or
// B2C) using the Groq API (OpenAI-compatible, free tier). Facts, numbers, and
// support/resistance values are preserved; only the framing/tone changes.

const API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function transformConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

const AUDIENCE_GUIDE = {
  b2b: `Audience: B2B — bullion dealers, jewellers, corporate/institutional buyers, treasury and procurement teams.
Framing: wholesale and trade implications, bulk pricing, hedging, inventory and supply-chain impact, margins, and positioning for the period ahead. Assume market sophistication; use precise industry terminology. Professional, concise, data-led.`,
  b2c: `Audience: B2C — individual retail investors and everyday gold/silver buyers.
Framing: what this means for personal savings and investment decisions, in plain accessible language. Avoid jargon (explain any technical term simply). Focus on practical takeaways for an individual buyer. Friendly, clear, balanced.`,
};

// Rewrite the given narrative fields for the audience. `keys` lists which
// fields to rewrite; everything else (dates, numeric values) is left untouched.
// Returns a new object = {...fields, ...rewritten}.
export async function transformForAudience(fields, audience, keys) {
  if (!transformConfigured()) throw new Error("GROQ_API_KEY is not set in .env");
  const guide = AUDIENCE_GUIDE[audience];
  if (!guide) throw new Error(`Unknown audience: ${audience}`);

  const subset = {};
  for (const k of keys) if (fields[k] != null && String(fields[k]).trim()) subset[k] = fields[k];
  if (!Object.keys(subset).length) return { ...fields };

  const system =
    `You rewrite an Augmont precious-metals report for a specific audience.\n${guide}\n\n` +
    `Rules:\n` +
    `- GROUND TRUTH — CRITICAL: Use ONLY information present in the input. Do NOT invent, add, or infer any fact, name, place, date, number, or event. You are only re-toning/rephrasing existing content — never adding new content.\n` +
    `- Preserve ALL facts, figures, prices, levels, dates, and named entities exactly.\n` +
    `- Keep each field roughly the same length as the original (it must fit the same layout box).\n` +
    `- Do not add disclaimers or headings. Rewrite only the wording/framing.\n` +
    `- Return a strict JSON object with EXACTLY the same keys as the input, values = rewritten text. No commentary, no markdown.`;

  const userContent = `Rewrite each field below for the target audience. Return JSON only.\n\nInput JSON:\n${JSON.stringify(subset, null, 2)}`;

  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API [${res.status}]: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  const rewritten = parseJsonLoose(text);
  return { ...fields, ...rewritten };
}

// ---------------------------------------------------------------------------
// Weekly: the doc is long-form prose but the design needs short curated
// blocks, so this is a summarize + restructure + audience-tone job. Returns
// the full set of wk_* fields ready for the weekly template.
// ---------------------------------------------------------------------------

const WEEKLY_SCHEMA = `{
  "wk_headline": "TWO lines separated by \\n. Each line ALL CAPS, MAX 14 chars incl spaces (hard limit — longer overflows), ends with a period. Punchy 2-word hero statement of the week's theme, metals-focused. Example: \\"GOLD DIPS.\\nSILVER SLIPS.\\"",
  "wk_tagline": "2-4 word elegant tag line in Title Case ending with a period, e.g. \\"Caution Prevails.\\"",
  "wk_gold_stat_label": "Tiny caps label for the gold stat, max 18 chars, e.g. \\"GOLD SLIDES BELOW\\"",
  "wk_gold_stat_value": "The key gold level, e.g. \\"$4,297\\"",
  "wk_gold_stat_sub": "Rupee equivalent in parentheses, e.g. \\"(~₹1,54,000)\\"",
  "wk_silver_stat_label": "Same for silver, max 18 chars",
  "wk_silver_stat_value": "e.g. \\"$66.7\\"",
  "wk_silver_stat_sub": "e.g. \\"(~₹2,40,000)\\"",
  "wk_subhead_left": "A COMPLETE theme sentence of 13-18 words across 2-3 lines (\\n), ~38 chars per line. Full descriptive phrase like \\"Precious Metals tied in a range on\\nUS-Iran ceasefire deal uncertainty as\\ntraders await the Fed decision\\" — NOT a 2-word label.",
  "wk_subhead_right": "A COMPLETE theme sentence of 13-18 words across 2-3 lines (\\n), ~38 chars per line. Full descriptive phrase, NOT a 2-word label.",
  "wk_geo_title": "Geopolitics punchy bold line, 3-5 words, max 28 chars, e.g. \\"Ceasefire brings relief\\"",
  "wk_geo_body": "Geopolitics summary: 4 sentences / clauses, 170-210 chars. Concrete facts with specifics, not vague.",
  "wk_fed_title": "Inflation/Fed punchy bold line, 3-5 words, max 28 chars, e.g. \\"Higher for longer\\"",
  "wk_fed_body": "Inflation & Fed summary: 4 sentences / clauses, 170-210 chars. Concrete facts with specifics.",
  "wk_fx_title": "Currencies punchy bold line, 3-5 words, max 28 chars, e.g. \\"Dollar soft, Rupee strong\\"",
  "wk_fx_body": "Currencies (USD/DXY/INR/RBI) summary: 4 sentences / clauses, 170-210 chars. Concrete facts with specifics.",
  "wk_outlook": "Balanced outlook: 2-3 COMPLETE sentences, 170-210 characters total (must end on a finished sentence, never trail off) — the positives, then what caps upside. Specific facts, NO vague filler like \\"key themes\\" or \\"emerging\\".",
  "wk_catalysts": "EXACTLY two lines (\\n), max 40 chars each: the week-ahead events",
  "wk_gold_comex_support": "e.g. \\"$4,300 - 4,376\\"",
  "wk_gold_comex_resistance": "e.g. \\"$4,500 - 4,510\\"",
  "wk_gold_mcx_support": "e.g. \\"₹1,52,000 - 1,54,000\\"",
  "wk_gold_mcx_resistance": "e.g. \\"₹1,63,000\\"",
  "wk_silver_comex_support": "e.g. \\"$66 - 67\\"",
  "wk_silver_comex_resistance": "e.g. \\"$73\\"",
  "wk_silver_mcx_support": "e.g. \\"₹2,40,000 - 2,42,000\\"",
  "wk_silver_mcx_resistance": "e.g. \\"₹2,73,000\\"",
  "chart_dates": "5 short day labels for the trading week, comma-separated, e.g. \\"2 Jun, 3 Jun, 4 Jun, 5 Jun, 6 Jun\\". Use the actual week implied by the report.",
  "chart_gold": "INDICATIVE COMEX gold USD/oz daily closes for those 5 days as 5 comma-separated numbers, CONSISTENT with the report's described weekly move, range and closing level (e.g. a downtrend ending near the stated close). Example: \\"4480, 4452, 4435, 4310, 4297\\"",
  "chart_silver": "INDICATIVE COMEX silver USD/oz daily closes for those 5 days as 5 comma-separated numbers, consistent with the report's described silver move. Example: \\"72.4, 71.8, 70.2, 67.5, 66.8\\"",
  "headline": "A normal blog-post title for WordPress, max 90 chars",
  "excerpt": "1-2 sentence blog excerpt, max 200 chars"
}`;

export async function transformWeekly(fullText, audience) {
  if (!transformConfigured()) throw new Error("GROQ_API_KEY is not set in .env");
  const guide = AUDIENCE_GUIDE[audience] || AUDIENCE_GUIDE.b2b;

  const system =
    `You turn Augmont's long-form weekly precious-metals report into the short, curated blocks of a designed infographic.\n${guide}\n\n` +
    `Rules:\n` +
    `- GROUND TRUTH — CRITICAL: Use ONLY information explicitly present in the source report below. Do NOT invent, add, assume, infer, or embellish ANY fact, name, place, city, date, day, number, event, or institution. If the source does not state a detail, leave it out entirely. Every word you write must be traceable to the source. (You are only rephrasing/condensing/re-toning existing content — never adding new content.)\n` +
    `- Preserve all facts, figures, price levels, and named entities exactly as in the source.\n` +
    `- STRICTLY respect every per-field length limit — text that overflows breaks the layout.\n` +
    `- Support/resistance values must come from the source text (technical outlook sections).\n` +
    `- The chart_* series must be consistent with the price levels/moves the source describes (no external data).\n` +
    `- Use \\n inside strings where a field specifies multiple lines.\n` +
    `- Return ONLY a strict JSON object with exactly these keys (descriptions explain each):\n${WEEKLY_SCHEMA}`;

  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Source weekly report:\n\n${fullText}\n\nReturn the JSON now.` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API [${res.status}]: ${await res.text()}`);
  const json = await res.json();
  return parseJsonLoose(json.choices?.[0]?.message?.content || "");
}

function parseJsonLoose(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}
