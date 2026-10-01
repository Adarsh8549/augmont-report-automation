// server.js — Augmont Daily Report webapp (internal team tool).
//
// Pipeline: upload .docx (+ thumbnail) -> parse -> review/edit fields ->
// Canva autofill + export (or a supplied PNG URL) -> publish to WordPress.

import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { parseDocx, parseWeeklyDocx } from "./lib/parseDocx.js";
import { fetchLiveRates } from "./lib/liveRates.js";
import * as wp from "./lib/wordpress.js";
import * as canva from "./lib/canva.js";
import * as email from "./lib/email.js";
import * as approvals from "./lib/approvals.js";
import * as render from "./lib/render.js";
import * as transform from "./lib/transform.js";

// Narrative fields that get rewritten per audience (numbers/dates are left alone).
const REWRITE_KEYS = ["headline", "price_movement", "geopolitical", "macro", "gold_technicals", "silver_technicals"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TLS trust: on networks with an inspecting proxy (corporate AV/firewall),
// outbound HTTPS is re-signed with a private root CA that Node doesn't trust by
// default, so calls to api.canva.com fail with SELF_SIGNED_CERT_IN_CHAIN. If a
// ca-bundle.pem (exported from the OS trust store) sits next to this file, make
// Node trust it by re-launching ourselves once with NODE_EXTRA_CA_CERTS set
// (that variable must be present before startup — it can't be set at runtime).
const caBundle = path.join(__dirname, "ca-bundle.pem");
if (fs.existsSync(caBundle) && process.env.NODE_EXTRA_CA_CERTS !== caBundle) {
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: caBundle },
  });
  process.exit(res.status ?? 0);
}

// Load the shared project .env (one level up), then any webapp-local override.
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const PORT = process.env.PORT || 3000;
// Base URL the approver's browser uses to reach this app from the email link.
// Defaults to localhost; set PUBLIC_BASE_URL to the machine's LAN IP or a tunnel
// URL when the approver clicks from another device.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

app.use(express.json({ limit: "2mb" }));

// Shared-password gate (HTTP Basic Auth). Enabled whenever APP_PASSWORD is set.
// Any username works; only the password is checked. Sent over the HTTPS tunnel.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || "").split(" ");
    if (scheme === "Basic" && encoded) {
      const pass = Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":");
      if (pass === APP_PASSWORD) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Augmont Daily Report"');
    return res.status(401).send("Authentication required");
  });
}

app.use(express.static(path.join(__dirname, "public")));

// Field-name map for Canva autofill (logical key -> Brand Template field name).
function loadFieldMap() {
  const p = path.join(__dirname, "canva-fields.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// --- status ----------------------------------------------------------------

app.get("/api/status", async (_req, res) => {
  const wpAuth = wp.wpConfigured() ? await wp.verifyAuth() : { ok: false, reason: "not configured" };
  res.json({
    wordpress: { configured: wp.wpConfigured(), auth: wpAuth },
    canva: {
      configured: canva.canvaConfigured(),
      connected: canva.isConnected(),
      brandTemplateId: process.env.CANVA_BRAND_TEMPLATE_ID || null,
      hasFieldMap: Boolean(loadFieldMap()),
    },
    email: { configured: email.emailConfigured(), approver: email.approverEmail() },
    render: { daily: render.renderConfigured("daily"), weekly: render.renderConfigured("weekly") },
    ai: { configured: transform.transformConfigured() },
  });
});

// --- parse a .docx ----------------------------------------------------------

app.post("/api/parse", upload.single("docx"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No .docx file uploaded (field name: docx)" });
    const type = req.body.type || "daily"; // daily | weekly-b2b | weekly-b2c
    const audience = type === "weekly-b2b" ? "b2b" : type === "weekly-b2c" ? "b2c" : null;

    let data;
    let transformed = false, transformError = null, ratesError = null;

    if (audience) {
      // Weekly: long-form doc -> AI summarize/restructure into the design blocks.
      const wk = parseWeeklyDocx(req.file.buffer, req.file.originalname);
      const hasTable = wk.chart.dates.length >= 2;
      data = {
        date: wk.date,
        wk_rate_gold: "", wk_rate_silver: "", wk_rate_time: "",
      };

      // Live rates from augmont.com (non-fatal if the scrape fails).
      try {
        const rates = await fetchLiveRates();
        data.wk_rate_gold = rates.goldText;
        data.wk_rate_silver = rates.silverText;
        data.wk_rate_time = rates.timeText;
      } catch (e) {
        ratesError = String(e.message || e);
      }

      if (transform.transformConfigured()) {
        try {
          // AI fills the design blocks AND an indicative chart series.
          Object.assign(data, await transform.transformWeekly(wk.fullText, audience));
          transformed = true;
        } catch (e) {
          transformError = String(e.message || e);
        }
      } else {
        transformError = "GROQ_API_KEY not set — weekly content not generated.";
      }

      // A real price table in the doc overrides the AI's indicative chart data.
      if (hasTable) {
        data.chart_dates = wk.chart.dates.join(", ");
        data.chart_gold = wk.chart.gold.join(", ");
        data.chart_silver = wk.chart.silver.join(", ");
      }
      // (Doc chart-image mode is available via render.js but disabled by
      // default — the single dual-axis line chart shows both metals more
      // clearly than two cramped candlestick screenshots.)
    } else {
      data = parseDocx(req.file.buffer, req.file.originalname);
    }

    res.json({ data, type, audience, transformed, transformError, ratesError });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// --- Canva OAuth ------------------------------------------------------------

app.get("/auth/canva", (req, res) => {
  if (!canva.canvaConfigured()) return res.status(400).send("Canva OAuth not configured in .env");
  res.redirect(canva.buildAuthUrl());
});

app.get("/auth/canva/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Canva authorization error: ${error}`);
    await canva.exchangeCode(code, state);
    res.redirect("/?canva=connected");
  } catch (e) {
    res.status(500).send(`Canva token exchange failed: ${e.message || e}`);
  }
});

// --- publish ----------------------------------------------------------------
// multipart: fields (JSON string), optional thumbnail file.
app.post("/api/publish", upload.single("thumbnail"), async (req, res) => {
  try {
    const fields = JSON.parse(req.body.fields || "{}");
    const mode = req.body.mode || "pngUrl"; // "autofill" | "designExport" | "pngUrl" | "render"
    const type = req.body.type || "daily"; // daily | weekly-b2b | weekly-b2c
    const templateKey = render.templateKeyFor(type);
    const status = ["publish", "draft", "pending"].includes(req.body.status) ? req.body.status : "draft";
    const title = fields.headline || render.TEMPLATES[templateKey].title;
    const date = fields.date || "";

    if (!wp.wpConfigured()) throw new Error("WordPress credentials missing in .env");

    // 1. Resolve the report image according to the chosen mode. "render" makes
    // the PNG locally (no Canva); other modes yield a URL we fetch + upload.
    let pngUrl;
    let pngMedia = null;
    if (mode === "render") {
      const pngBytes = await render.renderPng(fields, templateKey);
      pngMedia = await wp.uploadImageBytes(pngBytes, wp.reportFilename(date), "image/png");
    } else if (mode === "autofill") {
      const tmplId = req.body.brandTemplateId || process.env.CANVA_BRAND_TEMPLATE_ID;
      if (!tmplId) throw new Error("No Brand Template ID configured for autofill mode");
      const map = loadFieldMap();
      if (!map) throw new Error("canva-fields.json field map not found");
      const canvaFields = {};
      for (const [logicalKey, templateField] of Object.entries(map.text || {})) {
        if (fields[logicalKey] !== undefined) canvaFields[templateField] = fields[logicalKey];
      }
      let designId;
      try {
        designId = await canva.autofillDesign(tmplId, canvaFields);
      } catch (e) {
        if (String(e.message).includes("[403]") || String(e.message).includes("permission_denied")) {
          throw new Error("Autofill requires a Canva Enterprise plan, which this account doesn't have. Use 'Export an existing Canva design' or 'Paste a Canva PNG export URL' instead.");
        }
        throw e;
      }
      const urls = await canva.exportDesignPng(designId);
      pngUrl = urls[0];
    } else if (mode === "designExport") {
      const designId = req.body.designId || process.env.CANVA_DESIGN_ID;
      if (!designId) throw new Error("No design ID supplied for designExport mode");
      const urls = await canva.exportDesignPng(designId);
      pngUrl = urls[0];
    } else {
      pngUrl = req.body.pngUrl;
      if (!pngUrl) throw new Error("No pngUrl supplied for pngUrl mode");
    }

    // 2. Upload the report PNG to WordPress (render mode already uploaded bytes).
    if (!pngMedia) pngMedia = await wp.uploadPngFromUrl(pngUrl, date);

    // 3. Featured image: uploaded thumbnail, else the report PNG itself.
    let featuredId = pngMedia.id;
    if (req.file) {
      const thumb = await wp.uploadThumbnailBytes(req.file.buffer, req.file.originalname, req.file.mimetype);
      featuredId = thumb.id;
    }

    // 4. Create the post.
    const content = wp.buildPostContent({ pngMedia, title });
    const post = await wp.createPost({
      title,
      content,
      excerpt: fields.excerpt || "",
      featuredMediaId: featuredId,
      status,
    });

    // For "Submit for approval": create a single-use token and email the approver
    // a link to the review page. Use the permanent WordPress image URL (the Canva
    // export URL expires).
    let approval = null;
    if (status === "pending") {
      const token = approvals.createApproval({
        postId: post.id,
        title,
        imageUrl: pngMedia.source_url,
        excerpt: fields.excerpt || "",
      });
      const reviewUrl = `${PUBLIC_BASE_URL}/review?token=${token}`;
      approval = { reviewUrl, emailed: false, approver: email.approverEmail() };
      if (email.emailConfigured()) {
        try {
          await email.sendApprovalEmail({ title, imageUrl: pngMedia.source_url, reviewUrl, excerpt: fields.excerpt || "", date });
          approval.emailed = true;
        } catch (e) {
          approval.emailError = String(e.message || e);
        }
      }
    }

    res.json({
      ok: true,
      status,
      postId: post.id,
      postUrl: post.link,
      editUrl: wp.editUrl(post.id),
      pngMediaId: pngMedia.id,
      pngUrl: pngUrl || pngMedia.source_url,
      approval,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// --- live preview of the rendered template (no publish) ---------------------
app.post("/api/preview", async (req, res) => {
  try {
    const body = req.body || {};
    const fields = body.fields ? body.fields : body;
    const templateKey = render.templateKeyFor(body.type || "daily");
    const png = await render.renderPng(fields || {}, templateKey);
    res.set("Content-Type", "image/png").send(png);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// --- approval flow ----------------------------------------------------------

// Data for the review page (no secrets beyond the token itself).
app.get("/api/approval/:token", (req, res) => {
  const a = approvals.getApproval(req.params.token);
  if (!a) return res.status(404).json({ error: "Unknown or expired approval link" });
  res.json({ title: a.title, imageUrl: a.imageUrl, excerpt: a.excerpt, state: a.state, postId: a.postId });
});

// Approve -> publish the post live. Explicit POST so email link prefetching
// can't trigger it.
app.post("/api/approve", async (req, res) => {
  try {
    const { token } = req.body;
    const a = approvals.getApproval(token);
    if (!a) return res.status(404).json({ error: "Unknown or expired approval link" });
    if (a.state !== "pending") return res.status(409).json({ error: `Already ${a.state}` });
    const post = await wp.updatePostStatus(a.postId, "publish");
    approvals.resolveApproval(token, "approved", email.approverEmail());
    res.json({ ok: true, postUrl: post.link });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Reject -> send the post back to draft.
app.post("/api/reject", async (req, res) => {
  try {
    const { token } = req.body;
    const a = approvals.getApproval(token);
    if (!a) return res.status(404).json({ error: "Unknown or expired approval link" });
    if (a.state !== "pending") return res.status(409).json({ error: `Already ${a.state}` });
    await wp.updatePostStatus(a.postId, "draft");
    approvals.resolveApproval(token, "rejected", email.approverEmail());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// The review page itself (reads ?token= and calls the APIs above).
app.get("/review", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "review.html"));
});

app.listen(PORT, () => {
  console.log(`Augmont Daily Report webapp → http://localhost:${PORT}`);
});
