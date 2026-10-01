# Augmont Daily Report — Webapp

Internal web tool that runs the daily-report pipeline through a browser:

**upload `.docx` (+ thumbnail) → parse → review/edit fields → Canva image → publish to WordPress.**

It mirrors the `/run-report` Claude workflow, but anyone on the team can use it from a browser — no terminal needed.

---

## Quick start

```bash
cd webapp
npm install
npm start
# open http://localhost:3000
```

WordPress credentials are read from the shared `../.env` (already configured). WordPress publishing works immediately.

---

## The Canva step — read this

The Claude MCP can edit any element of the Canva design by ID. The **public Canva Connect API cannot** — that is the one capability that does not carry over to a standalone app. The Connect API gives you two things:

| Capability | Works via Connect API? |
|---|---|
| Export a design to PNG | ✅ Yes, any design the account can access |
| Upload assets | ✅ Yes |
| Fill content into a **Brand Template** (Autofill API) | ✅ Yes — requires Canva Teams/Enterprise |
| Edit arbitrary text elements of an existing design by ID | ❌ No (MCP-only) |

So the webapp offers **four image modes** (step 3):

1. **`render`** *(default — fully automated, no Canva)* — builds the report image locally from an HTML/CSS template (`lib/render.js`) and the parsed fields, screenshotting it to PNG with the system Chrome/Edge via `puppeteer-core`. No Canva, no Enterprise, no manual editing. Hit **Preview** to see it before publishing. This is the recommended path.
2. **`designExport`** — export the existing Canva design (`DAHBvlbvmHs`) exactly as it is. Edit the design first (manually, or via the Claude assistant), then export here. Needs the Canva Connect OAuth below.
3. **`pngUrl`** — paste a Canva PNG export URL directly. Zero Canva API setup.
4. **`autofill`** — fill a Canva **Brand Template** with the parsed fields. ⚠️ **Requires Canva Enterprise** (the Autofill API returns 403 otherwise).

### Render mode (default)

Nothing to configure — it auto-detects Chrome or Edge. To pin a specific browser, set `BROWSER_PATH` in `.env`. Edit `lib/render.js` to tweak the layout/branding; the `/api/preview` endpoint (and the Preview button) renders without publishing so you can iterate fast.

### Connecting Canva (modes 1 & 3)

1. Create a Connect integration: <https://www.canva.com/developers/integrations/connect-api>
2. Set its redirect URL to `http://127.0.0.1:3000/auth/canva/callback`.
3. Copy the Client ID + Secret into `webapp/.env` (see `.env.example`).
4. Start the app, then click **Canva: connect** in the top bar to authorize.

### Enabling full autofill (mode 3)

1. In Canva, save the report design as a **Brand Template** with named **data fields** (one per editable text region).
2. Put the template ID in `CANVA_BRAND_TEMPLATE_ID` (`.env`).
3. Edit `canva-fields.json` so each value on the right matches your template's data-field names exactly.

---

## Approval workflow (email)

Step 4 has three statuses: **Save as draft**, **Submit for approval**, **Publish now**.

**Submit for approval** creates the post as WordPress `pending` and emails a designated approver a link to a **review page** (`/review?token=…`). The approver sees the rendered report and clicks **Approve** (→ publishes live) or **Reject** (→ back to draft). The link carries a single-use token, so only the person who received the email can act on it. The review link opens a page with an explicit button — it does *not* auto-publish on click (so email link-prefetching is safe).

### Email setup (Gmail SMTP)

In `.env`:

| Var | Meaning |
|---|---|
| `SMTP_USER` | Gmail address that **sends** the approval emails |
| `SMTP_PASS` | A Gmail **App Password** (16 chars) for that account — [create one](https://myaccount.google.com/apppasswords) (requires 2FA). Not the normal password. |
| `APPROVER_EMAIL` | Gmail address that **receives + approves** |
| `PUBLIC_BASE_URL` | URL the approver clicks from. Defaults to `http://localhost:3000`. If the approver is on another device, set this to the machine's LAN IP (e.g. `http://192.168.1.50:3000`) or a tunnel URL — otherwise the emailed link won't reach the app. |

Pending posts *are* the queue — no database. You can also approve directly in WP admin (Posts → Pending) if you prefer.

Until that template exists, use mode 1 or 2 — the rest of the pipeline (parse, review, thumbnail, WordPress publish) is identical.

---

## Files

| Path | Role |
|---|---|
| `server.js` | Express app + routes (`/api/parse`, `/api/publish`, `/auth/canva`) |
| `lib/parseDocx.js` | `.docx` → structured JSON (port of `scripts/parse_docx.py`) |
| `lib/canva.js` | Connect API: OAuth (PKCE), autofill, export |
| `lib/wordpress.js` | media upload + post publish (port of `scripts/wp_post.py`) |
| `public/` | upload UI, editable review form, publish |
| `canva-fields.json` | logical field → Brand Template field-name map |

Tokens are cached in `.canva-tokens.json` (gitignored).

---

## Notes

- Built on Node 20, no build step (vanilla front-end).
- `.docx` parsing is best-effort; the review form (step 2) lets you fix anything before publishing.
- This is a **working prototype** intended for local/internal use. Before exposing it beyond the team, add real auth, HTTPS, and move secrets out of `.env`.
