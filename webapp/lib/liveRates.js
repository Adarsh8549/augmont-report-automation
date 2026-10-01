// liveRates.js — fetch live gold/silver retail rates from Augmont's own JSON
// API (the same endpoint augmont.com/live-rates calls under the hood). This is
// reliable structured data — no page scraping. Cached for 10 minutes.
//
//   GET https://goldapi.augmont.com/api/digital-gold/rates
//   -> { rate: { rates: { gBuy, gSell, sBuy, sSell, ... } } }
//   gBuy = 24K gold buy rate (₹/gm), sBuy = 999 silver buy rate (₹/gm)

const RATES_URL = process.env.AUGMONT_RATES_URL || "https://goldapi.augmont.com/api/digital-gold/rates";
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, data: null };

export async function fetchLiveRates() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  const res = await fetch(RATES_URL, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Augmont rates API [${res.status}]`);
  const json = await res.json();
  const rates = json?.rate?.rates || {};
  // The augmont.com/live-rates page shows the mid rate (average of buy & sell).
  const mid = (buy, sell) => {
    const b = Number(buy), s = Number(sell);
    if (Number.isFinite(b) && Number.isFinite(s)) return ((b + s) / 2).toFixed(2);
    if (Number.isFinite(b)) return b.toFixed(2);
    return "";
  };
  const gold = mid(rates.gBuy, rates.gSell);
  const silver = mid(rates.sBuy, rates.sSell);
  if (!gold && !silver) throw new Error("Augmont rates API returned no rates");

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timeText = `[${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}]`;

  const data = {
    gold,
    silver,
    goldText: gold ? `~₹${gold}/gm` : "",
    silverText: silver ? `~₹${silver}/gm` : "",
    timeText,
  };
  cache = { at: Date.now(), data };
  return data;
}
