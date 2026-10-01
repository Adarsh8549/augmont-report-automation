// Frontend logic for the Augmont Daily Report webapp.

const $ = (sel) => document.querySelector(sel);

// Editable fields shown in the review step (label + key + multiline?).
const WEEKLY_FIELD_DEFS = [
  { key: "headline", label: "WordPress post title" },
  { key: "excerpt", label: "Excerpt (post summary)", multiline: true },
  { key: "date", label: "Date" },
  { key: "wk_headline", label: "Hero headline (2 lines)", multiline: true },
  { key: "wk_tagline", label: "Tagline (script)" },
  { key: "wk_gold_stat_label", label: "Gold stat — label" },
  { key: "wk_gold_stat_value", label: "Gold stat — value" },
  { key: "wk_gold_stat_sub", label: "Gold stat — ₹ equivalent" },
  { key: "wk_silver_stat_label", label: "Silver stat — label" },
  { key: "wk_silver_stat_value", label: "Silver stat — value" },
  { key: "wk_silver_stat_sub", label: "Silver stat — ₹ equivalent" },
  { key: "wk_subhead_left", label: "Subhead left (2 lines)", multiline: true },
  { key: "wk_subhead_right", label: "Subhead right (2 lines)", multiline: true },
  { key: "wk_geo_title", label: "Geopolitics — title" },
  { key: "wk_geo_body", label: "Geopolitics — body", multiline: true },
  { key: "wk_fed_title", label: "Inflation & Fed — title" },
  { key: "wk_fed_body", label: "Inflation & Fed — body", multiline: true },
  { key: "wk_fx_title", label: "Currencies — title" },
  { key: "wk_fx_body", label: "Currencies — body", multiline: true },
  { key: "wk_outlook", label: "Outlook body", multiline: true },
  { key: "wk_catalysts", label: "Key catalysts (2 lines)", multiline: true },
  { key: "wk_gold_comex_support", label: "COMEX Gold — support" },
  { key: "wk_gold_comex_resistance", label: "COMEX Gold — resistance" },
  { key: "wk_gold_mcx_support", label: "MCX Gold — support" },
  { key: "wk_gold_mcx_resistance", label: "MCX Gold — resistance" },
  { key: "wk_silver_comex_support", label: "COMEX Silver — support" },
  { key: "wk_silver_comex_resistance", label: "COMEX Silver — resistance" },
  { key: "wk_silver_mcx_support", label: "MCX Silver — support" },
  { key: "wk_silver_mcx_resistance", label: "MCX Silver — resistance" },
  { key: "chart_dates", label: "Chart — dates (comma separated)" },
  { key: "chart_gold", label: "Chart — gold closes (comma separated)" },
  { key: "chart_silver", label: "Chart — silver closes (comma separated)" },
  { key: "wk_rate_gold", label: "Live rate — Gold 24K" },
  { key: "wk_rate_silver", label: "Live rate — Silver 999" },
  { key: "wk_rate_time", label: "Live rate — timestamp" },
];

const FIELD_DEFS = [
  { key: "headline", label: "Headline", multiline: true },
  { key: "date", label: "Date" },
  { key: "excerpt", label: "Excerpt (post summary)", multiline: true },
  { key: "price_movement", label: "Price Movement", multiline: true },
  { key: "geopolitical", label: "Geopolitical Developments", multiline: true },
  { key: "macro", label: "Macro-economic Signals", multiline: true },
  { key: "gold_technicals", label: "Gold Technicals", multiline: true },
  { key: "silver_technicals", label: "Silver Technicals", multiline: true },
  { key: "canva_gold_intl_support", label: "Gold Intl Support" },
  { key: "canva_gold_intl_resistance", label: "Gold Intl Resistance" },
  { key: "canva_gold_dom_support", label: "Gold Domestic Support" },
  { key: "canva_gold_dom_resistance", label: "Gold Domestic Resistance" },
  { key: "canva_silver_intl_support", label: "Silver Intl Support" },
  { key: "canva_silver_intl_resistance", label: "Silver Intl Resistance" },
  { key: "canva_silver_dom_support", label: "Silver Domestic Support" },
  { key: "canva_silver_dom_resistance", label: "Silver Domestic Resistance" },
];

let parsed = {};
let parsedType = "daily"; // type of the last successful parse — drives form + render

function currentDefs() {
  return parsedType.startsWith("weekly") ? WEEKLY_FIELD_DEFS : FIELD_DEFS;
}

// --- status banner ---------------------------------------------------------

async function loadStatus() {
  try {
    const s = await (await fetch("/api/status")).json();
    const chips = [];
    const wpOk = s.wordpress.configured && s.wordpress.auth?.ok;
    chips.push(chip(wpOk ? "ok" : "warn", `WordPress: ${wpOk ? "connected" : "check .env"}`));
    if (!s.canva.configured) {
      chips.push(chip("warn", "Canva: not configured"));
    } else if (!s.canva.connected) {
      chips.push(chip("warn", `Canva: <a href="/auth/canva">connect</a>`));
    } else {
      chips.push(chip("ok", "Canva: connected"));
    }
    if (s.email?.configured) {
      chips.push(chip("ok", `Approver: ${s.email.approver}`));
    } else {
      chips.push(chip("warn", "Approval email: not set"));
    }
    $("#status").innerHTML = chips.join("");
  } catch {
    $("#status").innerHTML = chip("warn", "status unavailable");
  }
}

function chip(kind, html) {
  return `<span class="chip chip-${kind}">${html}</span>`;
}

// --- report type switcher --------------------------------------------------

let reportMode = "daily"; // "daily" | "weekly"
let audience = "b2b";     // "b2b" | "b2c"  (only when weekly)
function currentType() {
  return reportMode === "weekly" ? "weekly-" + audience : "daily";
}

document.querySelectorAll(".mode-btn").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    reportMode = b.dataset.type;
    $("#audience-switch").classList.toggle("hidden", reportMode !== "weekly");
    const brand = document.querySelector(".brand span");
    if (brand) brand.textContent = reportMode === "weekly" ? "Weekly Report" : "Daily Report";
  })
);
document.querySelectorAll(".aud-btn").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".aud-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    audience = b.dataset.aud;
  })
);

// --- step 1: file selection + parse ----------------------------------------

$("#docx").addEventListener("change", (e) => {
  const f = e.target.files[0];
  $("#docx-name").textContent = f ? f.name : "No file selected";
  $("#parse-btn").disabled = !f;
});
$("#thumb").addEventListener("change", (e) => {
  const f = e.target.files[0];
  $("#thumb-name").textContent = f ? f.name : "No file selected";
});

$("#parse-btn").addEventListener("click", async () => {
  const file = $("#docx").files[0];
  if (!file) return;
  const type = currentType();
  $("#parse-hint").textContent = type.startsWith("weekly")
    ? "Parsing & rewriting for " + audience.toUpperCase() + "… (AI rewrite can take ~10s)"
    : "Parsing…";
  const fd = new FormData();
  fd.append("docx", file);
  fd.append("type", type);
  try {
    const res = await fetch("/api/parse", { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "parse failed");
    parsed = body.data;
    parsedType = body.type || "daily";
    renderFields();
    $("#step-review").classList.remove("hidden");
    $("#step-canva").classList.remove("hidden");
    $("#step-publish").classList.remove("hidden");
    if (body.audience) {
      $("#parse-hint").innerHTML = body.transformed
        ? `Parsed ✓ — content rewritten for <b>${body.audience.toUpperCase()}</b>.`
        : `Parsed ✓ — ⚠️ audience rewrite skipped: ${body.transformError || "AI not configured"}`;
    } else {
      $("#parse-hint").textContent = "Parsed ✓";
    }
  } catch (e) {
    $("#parse-hint").textContent = "Error: " + e.message;
  }
});

// --- step 2: render editable fields ----------------------------------------

function renderFields() {
  const wrap = $("#fields");
  wrap.innerHTML = "";
  for (const def of currentDefs()) {
    const val = parsed[def.key] ?? "";
    const id = "f_" + def.key;
    const input = def.multiline
      ? `<textarea id="${id}" rows="3">${escapeHtml(val)}</textarea>`
      : `<input type="text" id="${id}" value="${escapeAttr(val)}" />`;
    wrap.insertAdjacentHTML("beforeend",
      `<label class="field"><span>${def.label}</span>${input}</label>`);
  }
}

function collectFields() {
  const out = {};
  for (const def of currentDefs()) {
    const el = $("#f_" + def.key);
    if (el) out[def.key] = el.value;
  }
  return out;
}

// --- step 3: image-source mode toggle --------------------------------------

document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", () => {
    const sel = document.querySelector('input[name="mode"]:checked').value;
    for (const m of ["render", "autofill", "designExport", "pngUrl"]) {
      $("#mode-" + m).classList.toggle("hidden", sel !== m);
    }
  })
);

async function renderImageBlob() {
  // Use the type the form data was parsed as (not the live switcher, which the
  // user may have toggled without re-parsing).
  const res = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Merge edits over the full parsed object so non-form fields (chart images,
    // chart data, live rates) are preserved.
    body: JSON.stringify({ type: parsedType, fields: { ...parsed, ...collectFields() } }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "render failed");
  return res.blob();
}

// Download the rendered report image.
$("#download-btn").addEventListener("click", async () => {
  const wrap = $("#preview-wrap");
  try {
    const blob = await renderImageBlob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const date = (collectFields().date || "report").replace(/[\s,]+/g, "-").toLowerCase();
    a.download = `augmont-${parsedType}-${date}.png`;
    a.click();
  } catch (e) {
    wrap.innerHTML = `<span style="color:var(--err)">Download error: ${e.message}</span>`;
  }
});

// Live preview of the locally-rendered template image.
$("#preview-btn").addEventListener("click", async () => {
  const wrap = $("#preview-wrap");
  wrap.innerHTML = "Rendering…";
  try {
    const blob = await renderImageBlob();
    const url = URL.createObjectURL(blob);
    wrap.innerHTML = `<img src="${url}" alt="preview" style="width:100%;border:1px solid var(--line);border-radius:10px" />`;
  } catch (e) {
    wrap.innerHTML = `<span style="color:var(--err)">Preview error: ${e.message}</span>`;
  }
});

// --- step 4: publish -------------------------------------------------------

// Keep the button label in sync with the chosen status.
const STATUS_LABEL = { draft: "Save as draft", pending: "Submit for approval", publish: "Publish now" };
function selectedStatus() {
  return document.querySelector('input[name="status"]:checked').value;
}
document.querySelectorAll('input[name="status"]').forEach((r) =>
  r.addEventListener("change", () => { $("#publish-btn").textContent = STATUS_LABEL[selectedStatus()]; })
);

$("#publish-btn").addEventListener("click", async () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const status = selectedStatus();
  const fields = collectFields();
  const fd = new FormData();
  fd.append("fields", JSON.stringify({ ...parsed, ...fields }));
  fd.append("mode", mode);
  fd.append("status", status);
  fd.append("type", parsedType);
  if (mode === "autofill") fd.append("brandTemplateId", $("#brandTemplateId").value.trim());
  if (mode === "designExport") fd.append("designId", $("#designId").value.trim());
  if (mode === "pngUrl") fd.append("pngUrl", $("#pngUrl").value.trim());
  const thumb = $("#thumb").files[0];
  if (thumb) fd.append("thumbnail", thumb);

  const result = $("#result");
  result.className = "result";
  result.textContent = "Working… (Canva export can take ~10–20s)";
  $("#publish-btn").disabled = true;

  try {
    const res = await fetch("/api/publish", { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "publish failed");
    result.classList.add("ok");
    if (body.status === "pending") {
      const a = body.approval || {};
      const emailLine = a.emailed
        ? `📧 Approval email sent to <b>${a.approver}</b>.`
        : a.emailError
          ? `⚠️ Pending created, but email failed: ${a.emailError}`
          : `⚠️ Pending created, but no approver email is configured.`;
      result.innerHTML = `🕓 Submitted for approval. ${emailLine}
        <div class="meta">Review link: <a href="${a.reviewUrl}" target="_blank">${a.reviewUrl}</a></div>
        <div class="meta">Post ID ${body.postId} · status pending · PNG media ${body.pngMediaId}</div>`;
    } else {
      const msg = body.status === "publish" ? `✅ Published live!` : `📝 Saved as draft (not live).`;
      const link = body.status === "publish"
        ? `<a href="${body.postUrl}" target="_blank">${body.postUrl}</a>`
        : `<a href="${body.editUrl}" target="_blank">Open in WordPress →</a>`;
      result.innerHTML = `${msg} ${link}
        <div class="meta">Post ID ${body.postId} · status ${body.status} · PNG media ${body.pngMediaId}</div>`;
    }
  } catch (e) {
    result.classList.add("err");
    result.textContent = "Error: " + e.message;
  } finally {
    $("#publish-btn").disabled = false;
  }
});

// --- helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

loadStatus();
if (new URLSearchParams(location.search).get("canva") === "connected") {
  history.replaceState({}, "", "/");
}
