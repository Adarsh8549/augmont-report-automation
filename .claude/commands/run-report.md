# Run Augmont Daily Report

Execute the full daily report workflow end-to-end.

## Steps

### 1. Find input files
Look in the `reports/` folder for:
- The most recently modified `.docx` file → the report
- The most recently modified `.jpg`, `.jpeg`, or `.png` → the thumbnail

### 2. Parse the Word file
```bash
python scripts/parse_docx.py reports/<filename>.docx
```
Captures JSON with: `headline`, `date`, `price_movement`, `geopolitical`, `macro`, `gold_technicals`, `silver_technicals`, plus all 8 support/resistance values.

### 3. Update Canva design (Design ID: DAHBvlbvmHs)
**3a.** Call `start-editing-transaction` with `design_id: "DAHBvlbvmHs"`.

**3b.** Call `perform-editing-operations` with ALL operations in one call using element IDs from CLAUDE.md:
- `replace_text` → Headline
- `find_and_replace_text` → Date line (replace the date portion only)
- `replace_text` → Price Movement (strip "Price Movement – " prefix)
- `replace_text` → Geopolitical (strip "Geopolitical Developments – " prefix)
- `replace_text` → Macro-economic (strip "Macro-economic Signals – " prefix)
- `replace_text` → Gold Technicals
- `replace_text` → Silver Technicals
- `replace_text` → all 8 Support/Resistance elements (exact formats in CLAUDE.md)

**3c.** Show thumbnail preview, then call `commit-editing-transaction`.

### 4. Export PNG
Call `export-design` with `design_id: "DAHBvlbvmHs"`, format `png`, quality `pro`. Save the export URL.

### 5. Post to WordPress
```bash
python scripts/wp_post.py \
  --png-url "<canva_export_url>" \
  --thumbnail "reports/<thumbnail_file>" \
  --title "<headline>" \
  --excerpt "<first sentence of price_movement>" \
  --date "<report_date>"
```

### 6. Print the live WordPress post URL.

---
## Notes
- Credentials load automatically from `.env`
- All Canva element IDs are in `CLAUDE.md` — never hardcode them
- If parse_docx.py fails, extract sections manually and continue from step 3
