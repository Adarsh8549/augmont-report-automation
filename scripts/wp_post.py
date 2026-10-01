"""
wp_post.py — Upload PNG + optional thumbnail to WordPress and create a published post.

Usage:
    python scripts/wp_post.py \
        --png-url "https://export-download.canva.com/..." \
        --thumbnail "reports/thumb.jpg" \
        --title "Precious Metals Face Headwinds..." \
        --excerpt "Gold declined below $4450..." \
        --date "June 5, 2026"

Credentials are read automatically from .env
"""

import argparse, os, sys, json, base64, mimetypes
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError


def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

load_env()

WP_SITE         = os.environ.get("WP_SITE", "https://insights.augmont.com")
WP_USERNAME     = os.environ.get("WP_USERNAME", "")
WP_APP_PASSWORD = os.environ.get("WP_APP_PASSWORD", "")
WP_CATEGORY_ID  = int(os.environ.get("WP_CATEGORY_ID", "27"))
WP_API          = f"{WP_SITE.rstrip('/')}/wp-json/wp/v2"


def auth_header():
    token = base64.b64encode(f"{WP_USERNAME}:{WP_APP_PASSWORD}".encode()).decode()
    return f"Basic {token}"


def upload_media(data: bytes, filename: str, mime: str, title: str) -> dict:
    req = Request(f"{WP_API}/media", data=data, method="POST", headers={
        "Authorization": auth_header(),
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": mime,
    })
    try:
        with urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except HTTPError as e:
        print(f"Media upload failed [{e.code}]: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def upload_png_from_url(png_url: str, date: str = "") -> dict:
    print("Fetching PNG from Canva...")
    with urlopen(Request(png_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
        data = r.read()
    print(f"  {len(data):,} bytes downloaded")
    safe = date.replace(" ", "-").replace(",", "").lower() or "today"
    media = upload_media(data, f"augmont-daily-report-{safe}.png", "image/png",
                         f"Augmont Daily Report – {date}")
    print(f"  PNG uploaded → media ID {media['id']}")
    return media


def upload_thumbnail(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        print(f"Thumbnail not found: {path}", file=sys.stderr)
        sys.exit(1)
    mime = mimetypes.guess_type(str(p))[0] or "image/jpeg"
    media = upload_media(p.read_bytes(), p.name, mime, p.stem)
    print(f"  Thumbnail uploaded → media ID {media['id']}")
    return media


def create_post(title, content, excerpt, featured_id, category_id) -> dict:
    payload = json.dumps({
        "title": title, "content": content, "excerpt": excerpt,
        "status": "publish", "featured_media": featured_id,
        "categories": [category_id],
    }).encode()
    req = Request(f"{WP_API}/posts", data=payload, method="POST", headers={
        "Authorization": auth_header(),
        "Content-Type": "application/json",
    })
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except HTTPError as e:
        print(f"Post creation failed [{e.code}]: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--png-url",   required=True)
    p.add_argument("--thumbnail", default="")
    p.add_argument("--title",     required=True)
    p.add_argument("--excerpt",   default="")
    p.add_argument("--date",      default="")
    args = p.parse_args()

    if not WP_USERNAME or not WP_APP_PASSWORD:
        print("Error: WP_USERNAME and WP_APP_PASSWORD must be set in .env", file=sys.stderr)
        sys.exit(1)

    png  = upload_png_from_url(args.png_url, args.date)
    feat = upload_thumbnail(args.thumbnail)["id"] if args.thumbnail else png["id"]

    content = (
        f'<!-- wp:image {{"id":{png["id"]},"sizeSlug":"full","linkDestination":"none"}} -->\n'
        f'<figure class="wp-block-image size-full">'
        f'<img src="{png["source_url"]}" alt="{args.title}" class="wp-image-{png["id"]}"/>'
        f'</figure>\n<!-- /wp:image -->'
    )

    print("Creating WordPress post...")
    post = create_post(args.title, content, args.excerpt, feat, WP_CATEGORY_ID)
    print(f"\n✅ Published!")
    print(f"   Post ID : {post['id']}")
    print(f"   URL     : {post.get('link', '')}")


if __name__ == "__main__":
    main()
