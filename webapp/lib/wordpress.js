// wordpress.js — Upload media and publish a post via the WordPress REST API.
// Ported from scripts/wp_post.py (proven working). Uses global fetch (Node 18+).

const WP_SITE = (process.env.WP_SITE || "https://insights.augmont.com").replace(/\/$/, "");
const WP_API = `${WP_SITE}/wp-json/wp/v2`;
const WP_CATEGORY_ID = parseInt(process.env.WP_CATEGORY_ID || "27", 10);

function authHeader() {
  const user = process.env.WP_USERNAME || "";
  const pass = process.env.WP_APP_PASSWORD || "";
  // WordPress application passwords are accepted with or without spaces.
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

export function wpConfigured() {
  return Boolean(process.env.WP_USERNAME && process.env.WP_APP_PASSWORD);
}

async function uploadMedia(bytes, filename, mime) {
  const res = await fetch(`${WP_API}/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": mime,
    },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Media upload failed [${res.status}]: ${body}`);
  }
  return res.json();
}

export async function uploadPngFromUrl(pngUrl, date = "") {
  const fetched = await fetch(pngUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!fetched.ok) throw new Error(`Failed to fetch PNG from Canva [${fetched.status}]`);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  const safe = (date.replace(/\s+/g, "-").replace(/,/g, "").toLowerCase()) || "today";
  return uploadMedia(bytes, `augmont-daily-report-${safe}.png`, "image/png");
}

export async function uploadThumbnailBytes(bytes, filename, mime = "image/png") {
  return uploadMedia(bytes, filename, mime);
}

// Upload an in-memory image (e.g. the locally-rendered report PNG).
export async function uploadImageBytes(bytes, filename, mime = "image/png") {
  return uploadMedia(bytes, filename, mime);
}

// Build the "augmont-daily-report-<date>.png" filename used for uploads.
export function reportFilename(date = "") {
  const safe = date.replace(/\s+/g, "-").replace(/,/g, "").toLowerCase() || "today";
  return `augmont-daily-report-${safe}.png`;
}

// status: "publish" (live) | "draft" (private, editable) | "pending" (awaiting review).
export async function createPost({ title, content, excerpt, featuredMediaId, status = "publish" }) {
  const payload = {
    title,
    content,
    excerpt,
    status,
    featured_media: featuredMediaId,
    categories: [WP_CATEGORY_ID],
  };
  const res = await fetch(`${WP_API}/posts`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Post creation failed [${res.status}]: ${body}`);
  }
  return res.json();
}

// Build the post body that embeds the exported report image.
export function buildPostContent({ pngMedia, title }) {
  return (
    `<!-- wp:image {"id":${pngMedia.id},"sizeSlug":"full","linkDestination":"none"} -->\n` +
    `<figure class="wp-block-image size-full">` +
    `<img src="${pngMedia.source_url}" alt="${title}" class="wp-image-${pngMedia.id}"/>` +
    `</figure>\n<!-- /wp:image -->`
  );
}

// wp-admin edit link for a post (useful for drafts / pending, which aren't
// publicly viewable).
export function editUrl(postId) {
  return `${WP_SITE}/wp-admin/post.php?post=${postId}&action=edit`;
}

// Change a post's status (used by the approval flow: pending -> publish/draft).
export async function updatePostStatus(postId, status) {
  const res = await fetch(`${WP_API}/posts/${postId}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Status update failed [${res.status}]: ${await res.text()}`);
  return res.json();
}

// Quick credential check (used by the UI to show status).
export async function verifyAuth() {
  try {
    const res = await fetch(`${WP_API}/users/me`, { headers: { Authorization: authHeader() } });
    if (!res.ok) return { ok: false, status: res.status };
    const me = await res.json();
    return { ok: true, name: me.name, slug: me.slug };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
