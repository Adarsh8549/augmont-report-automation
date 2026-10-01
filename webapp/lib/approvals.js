// approvals.js — token store for the email-approval flow. Each submitted
// report gets a single-use token; possessing the token (it's emailed only to
// the approver) is what authorizes approval. Persisted to .approvals.json so
// tokens survive a server restart.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, "..", ".approvals.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return {};
  }
}

function write(obj) {
  fs.writeFileSync(STORE, JSON.stringify(obj, null, 2));
}

export function createApproval({ postId, title, imageUrl, excerpt }) {
  const all = read();
  const token = crypto.randomBytes(24).toString("base64url");
  all[token] = {
    postId,
    title,
    imageUrl,
    excerpt,
    state: "pending",
    createdAt: new Date().toISOString(),
  };
  write(all);
  return token;
}

export function getApproval(token) {
  return read()[token] || null;
}

// Mark an approval resolved. decision: "approved" | "rejected".
export function resolveApproval(token, decision, by = "") {
  const all = read();
  if (!all[token]) return null;
  all[token].state = decision;
  all[token].resolvedAt = new Date().toISOString();
  all[token].resolvedBy = by;
  write(all);
  return all[token];
}
