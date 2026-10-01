// canva.js — Canva Connect API client: OAuth 2.0 (PKCE), autofill, asset
// upload, and export. Docs: https://www.canva.dev/docs/connect/
//
// IMPORTANT: The public Connect API cannot edit arbitrary elements of an
// existing design (that is an MCP-only capability). Programmatic content
// insertion goes through the Autofill API, which requires the design to be
// saved as a Brand Template with named data fields (Canva Teams/Enterprise).
// The export endpoints work for any design the authorized account can access.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, "..", ".canva-tokens.json");

const AUTH_BASE = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const API = "https://api.canva.com/rest/v1";

// Core scopes for parse → export → publish. The brandtemplate:* scopes are
// only needed for autofill mode (Canva Enterprise) — add them back here AND
// enable them in the integration config once a Brand Template exists, otherwise
// Canva rejects the whole authorization with invalid_scope.
const SCOPES = [
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "asset:read",
  "asset:write",
].join(" ");

// --- token persistence -----------------------------------------------------

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeTokens(tok) {
  const withExpiry = { ...tok, obtained_at: Date.now() };
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(withExpiry, null, 2));
}

export function canvaConfigured() {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI);
}

export function isConnected() {
  return Boolean(readTokens()?.refresh_token);
}

// --- OAuth (PKCE) ----------------------------------------------------------

// In-memory store for the verifier between /auth start and callback.
const pkceStore = new Map();

export function buildAuthUrl() {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  pkceStore.set(state, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CANVA_CLIENT_ID,
    redirect_uri: process.env.CANVA_REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

function basicAuth() {
  const id = process.env.CANVA_CLIENT_ID;
  const secret = process.env.CANVA_CLIENT_SECRET;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeCode(code, state) {
  const verifier = pkceStore.get(state);
  if (!verifier) throw new Error("Unknown or expired OAuth state");
  pkceStore.delete(state);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: process.env.CANVA_REDIRECT_URI,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed [${res.status}]: ${await res.text()}`);
  const tok = await res.json();
  writeTokens(tok);
  return tok;
}

async function refresh() {
  const tok = readTokens();
  if (!tok?.refresh_token) throw new Error("Not connected to Canva — run the OAuth flow first.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed [${res.status}]: ${await res.text()}`);
  const next = await res.json();
  writeTokens(next);
  return next;
}

async function accessToken() {
  let tok = readTokens();
  if (!tok) throw new Error("Not connected to Canva — run the OAuth flow first.");
  const ageMs = Date.now() - (tok.obtained_at || 0);
  const ttlMs = (tok.expires_in || 0) * 1000;
  // Refresh a minute before expiry.
  if (ageMs > Math.max(0, ttlMs - 60_000)) tok = await refresh();
  return tok.access_token;
}

async function api(method, endpoint, { json, headers = {}, body } = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });
  if (!res.ok) throw new Error(`Canva ${method} ${endpoint} failed [${res.status}]: ${await res.text()}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll(getFn, { tries = 30, intervalMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const result = await getFn();
    const status = result?.job?.status || result?.status;
    if (status === "success") return result;
    if (status === "failed") throw new Error(`Canva job failed: ${JSON.stringify(result)}`);
    await sleep(intervalMs);
  }
  throw new Error("Canva job timed out");
}

// --- Asset upload (for the thumbnail / images used in autofill) ------------

export async function uploadAsset(bytes, name = "asset") {
  const token = await accessToken();
  const meta = Buffer.from(JSON.stringify({ name_base64: Buffer.from(name).toString("base64") }));
  const res = await fetch(`${API}/asset-uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(name).toString("base64") }),
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Asset upload failed [${res.status}]: ${await res.text()}`);
  const job = await res.json();
  const jobId = job?.job?.id;
  const done = await poll(() => api("GET", `/asset-uploads/${jobId}`));
  return done.job.asset.id;
}

// --- Autofill: create a filled design from a Brand Template ----------------
//
// fields: { fieldName: "text value", ... } for text fields.
// imageFields: { fieldName: assetId, ... } for image fields (optional).
export async function autofillDesign(brandTemplateId, fields, imageFields = {}) {
  const data = {};
  for (const [k, v] of Object.entries(fields)) {
    data[k] = { type: "text", text: String(v ?? "") };
  }
  for (const [k, assetId] of Object.entries(imageFields)) {
    data[k] = { type: "image", asset_id: assetId };
  }
  const created = await api("POST", "/autofills", {
    json: { brand_template_id: brandTemplateId, data },
  });
  const jobId = created?.job?.id;
  const done = await poll(() => api("GET", `/autofills/${jobId}`));
  return done.job.result.design.id;
}

// --- Export a design to PNG -------------------------------------------------

export async function exportDesignPng(designId) {
  const created = await api("POST", "/exports", {
    json: { design_id: designId, format: { type: "png" } },
  });
  const jobId = created?.job?.id;
  const done = await poll(() => api("GET", `/exports/${jobId}`));
  const urls = done.job.urls || [];
  if (!urls.length) throw new Error("Export produced no URLs");
  return urls; // array of PNG URLs (one per page)
}
