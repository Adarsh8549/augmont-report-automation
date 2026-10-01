# Deploying the Augmont report webapp

Runs the app 24/7 at a permanent URL, so it no longer depends on a local
machine keeping `node server.js` alive.

## 1. Deploy on Render

1. Sign up / log in at <https://render.com> (GitHub login is easiest).
2. **New → Blueprint**.
3. Connect the repo `Adarsh8549/augmont-report-automation`.
4. Render reads `render.yaml` and proposes the `augmont-report-webapp` service.
5. It will prompt for the secret env vars listed below. Fill them in, then **Apply**.

First build takes ~5-10 minutes (it installs Chromium into the image).

## 2. Environment variables

Copy these values from your local `webapp/.env` and `.env`.
**Never commit them** — the repo is public.

| Variable | Required | Where it comes from |
|---|---|---|
| `APP_PASSWORD` | **Yes** | The login gate for the whole app. Use a strong, fresh value — this is now exposed to the public internet, not just your LAN. |
| `GROQ_API_KEY` | **Yes** | Groq console — used for content rewriting. |
| `WP_SITE` | Yes | `https://insights.augmont.com` |
| `WP_USERNAME` | Yes | WordPress user (`technical`). |
| `WP_APP_PASSWORD` | Yes | WordPress application password. |
| `WP_CATEGORY_ID` | Yes | `27` (Daily Report). |
| `PUBLIC_BASE_URL` | After first deploy | Set to your live URL, e.g. `https://augmont-report-webapp.onrender.com`. Used to build approval links. |
| `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` | Optional | Only needed to re-export Canva backgrounds. Normal daily/weekly runs don't use Canva — the artwork is committed as PNGs. |
| `GROQ_MODEL`, `BROWSER_PATH`, `NODE_ENV` | Preset | Already set in `render.yaml`. |

After the first deploy, add `PUBLIC_BASE_URL` with the real URL and redeploy.

### Canva OAuth (only if you use it)

Add `https://<your-url>/auth/canva/callback` as a redirect URL in the Canva
developer portal, and set `CANVA_REDIRECT_URI` to the same value.

## 3. Plan / cost

`render.yaml` requests the **starter** plan (~$7/month, 512MB guaranteed).

The daily report renders a 1920x4300 image in headless Chromium, which is
memory-hungry. On the **free** plan (512MB, shared) that render can get
OOM-killed, and free services also sleep after ~15 minutes idle, making the
next request take ~1 minute to wake.

To try the free tier anyway, change one line in `render.yaml`:

```yaml
plan: free
```

Weekly reports (941x2059) are much lighter and are likely fine on free.

## 4. Notes

- **Ephemeral filesystem.** `.canva-tokens.json` and `.approvals.json` are lost
  on redeploy/restart. Canva would need re-authorising; approvals reset.
- **Auto-deploy is on.** Every push to `main` redeploys.
- **Fonts and backgrounds** ship inside the image, so rendering matches local.

## 5. Running locally (unchanged)

```bash
cd webapp
npm install
node server.js
```
