# Augmont Daily Report — Claude Code Project

## Purpose
Automate the daily report workflow:
1. Parse a Word file (.docx) to extract report sections
2. Update the Canva design with extracted content
3. Export the design as PNG
4. Upload PNG + thumbnail to WordPress and publish post under "Daily Report" category

## How to Run
1. Drop today's `.docx` report file into the `reports/` folder
2. Drop the thumbnail image (`.jpg` or `.png`) into `reports/`
3. Type: `/run-report`

---

## Canva Design

**Design ID:** `DAHBvlbvmHs`
**Edit URL:** https://www.canva.com/design/DAHBvlbvmHs/IDJ1Lk3ynUrliK3iTmiZVQ/edit

### Element ID Map

| Section | Element ID | Notes |
|---|---|---|
| Headline | `PB8kYpGVtLh3n5jy-LB1xcmVM8K5VRqts` | Full headline text |
| Date line | `PB8kYpGVtLh3n5jy-LBBj0vP3RvcK7v2x` | find_and_replace the date portion only |
| Price Movement | `PB8kYpGVtLh3n5jy-LBkYl4hnFy3Tk5Hf` | Strip "Price Movement – " prefix |
| Geopolitical | `PB8kYpGVtLh3n5jy-LBNvJ5CQl0mSQTn4` | Strip "Geopolitical Developments – " prefix |
| Macro-economic | `PB8kYpGVtLh3n5jy-LBVbMKfPj6VPxGzc` | Strip "Macro-economic Signals – " prefix |
| Gold Technicals | `PB8kYpGVtLh3n5jy-LB34w304njqljdH0` | Full sentence |
| Silver Technicals | `PB8kYpGVtLh3n5jy-LBLQVYyszXXgZDpH` | Full sentence |
| Gold Intl Support | `PB8kYpGVtLh3n5jy-LBGV4D8G059v3hnc` | Format: `Gold Support Level: $X/oz` |
| Gold Intl Resistance | `PB8kYpGVtLh3n5jy-LBhjMlhbrKHwgMTd` | Format: `Gold Resistance Level: $X/oz` |
| Gold Domestic Support | `PB8kYpGVtLh3n5jy-LB7yZtF18zwpZQ52` | Format: `Gold Support Level: Rs X/10 gm` |
| Gold Domestic Resistance | `PB8kYpGVtLh3n5jy-LBd9H8W8mvWXB83F` | Format: `Gold Resistance Level: Rs X/10 gm` |
| Silver Intl Support | `PB8kYpGVtLh3n5jy-LB4SwpnhJ9MZfpGP` | Format: `Silver Support Level: $X/oz` |
| Silver Intl Resistance | `PB8kYpGVtLh3n5jy-LBt3r9w7yB8b4Zgv` | Format: `Silver Resistance Level: $X/oz` |
| Silver Domestic Support | `PB8kYpGVtLh3n5jy-LBfDcjRxDZcdG4c0` | Format: `Silver Support Level: Rs X/kg` |
| Silver Domestic Resistance | `PB8kYpGVtLh3n5jy-LBtqVh3Gj795Sygy` | Format: `Silver Resistance Level: Rs X/kg` |

### Canva Page
```json
[{"page_id": "PB8kYpGVtLh3n5jy", "page_number": 1, "is_responsive": false, "is_empty": false, "is_editable": true}]
```

---

## WordPress

**Site:** https://insights.augmont.com
**REST API base:** https://insights.augmont.com/wp-json/wp/v2
**Category:** Daily Report (ID: `27`)
**Auth:** Application Password — already set in `.env`

---

## Word File Structure

| Paragraph | Content |
|---|---|
| Normal | "Fundamental News and Triggers" (skip) |
| Normal | **Headline** |
| List Paragraph | `Price Movement – <body>` |
| List Paragraph | `Geopolitical Developments – <body>` |
| List Paragraph | `Macro-economic Signals – <body>` |
| Normal | "Technical Triggers" (skip) |
| List Paragraph | **Gold Technicals** |
| List Paragraph | **Silver Technicals** |
| Table | Support / Resistance values |

---

## Scripts

- `scripts/parse_docx.py` — extracts all sections from .docx, outputs JSON
- `scripts/wp_post.py` — uploads PNG + thumbnail, creates WordPress post

### Usage
```bash
python scripts/parse_docx.py reports/report.docx
python scripts/wp_post.py --png-url "..." --thumbnail reports/thumb.jpg --title "..." --excerpt "..."
```
