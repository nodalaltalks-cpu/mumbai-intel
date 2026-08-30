# IGR Transaction Import Guide (Phase 19)

How to bring Maharashtra IGR (or any other manually-obtained) transaction data
into Mumbai Intel via the existing Transaction CSV/JSON import at
**Founder Admin → Data Sync → Import Data**, and review it at
**Founder Admin → Data Sync → Transaction Review**.

This is not a new import system — it is the exact same
`runTransactionFileImport()` pathway the platform already had, extended with
three optional columns useful for IGR data. Nothing here requires a new
database field: every column maps to a field that already exists on the
`Transaction` model.

## Columns

| Column (any of these header spellings work) | Required? | Maps to | Notes |
|---|---|---|---|
| `locality` / `locality name` / `area` | **Required** | `Transaction.localityId` | Must match an existing Locality name or a known alias (e.g. "Andheri W.") exactly — a locality that can't be resolved fails that row rather than guessing. |
| `registration date` / `date` / `reg date` / `transaction date` | **Required** | `Transaction.registrationDate` | Use an unambiguous format, ideally `YYYY-MM-DD`. Ambiguous formats (e.g. `DD/MM/YYYY`) are rejected rather than silently misread. |
| `value` / `transaction value` / `price` / `sale value` / `amount` | **Required** | `Transaction.valuePaise` | Plain number, in rupees (not paise). No currency symbols or thousands separators — `25000000`, not `₹2,50,00,000`. |
| `project` / `project name` | Optional | `Transaction.projectId` | Matched by exact name against existing Projects. If it doesn't match anything, the row still stages — the project just stays blank for you to fill in manually. |
| `type` / `transaction type` / `deal type` | Optional (defaults to Sale) | `Transaction.type` | `sale`, `resale`, or `lease` (also accepts `rent`/`rental`/`secondary`). |
| `carpet sqft` / `carpet area` / `area sqft` / `sqft` | Optional | `Transaction.carpetSqft` | Plain number only. |
| `bedrooms` / `bhk` / `configuration` | Optional | `Transaction.bedrooms` | Plain number (supports half-values like `2.5`). |
| `tower` / `building` / `wing` | Optional | `Transaction.tower` | Free text. |
| `unit` / `unit label` / `flat no` / `unit number` | Optional | `Transaction.unitLabel` | Free text. |
| `registration number` / `document number` / `doc number` / `regn no` / `reg no` | Optional, but recommended for IGR data | `Transaction.sourceRef` | The IGR document/registration number. When provided, this becomes the transaction's real identifier and is used for duplicate detection — a much stronger signal than the fallback content-hash used when this column is absent. |
| `confidence` | Optional | `Transaction.confidence` | `High`, `Medium`, or `Low`. Unrecognized values are ignored (defaults to Medium on the live record) rather than rejecting the row. |
| `source note` / `note` / `notes` | Optional | `Transaction.sourceNote` | Free text — where this figure came from, any caveats. |

## What happens after upload

1. Every row is validated and normalized.
2. Locality is resolved against existing Localities (and their aliases) — never auto-created.
3. Project is matched by exact name if supplied — never auto-created, never guessed.
4. A row whose registration number exactly matches another transaction already
   pending review, or an already-approved transaction, is **still staged** —
   never silently skipped or merged — and flagged so you can look at both
   before approving.
5. A row with byte-identical content to a previous upload (and no registration
   number supplied) is silently skipped, since that really is the same
   re-uploaded row.
6. Everything lands in **Transaction Review** as PENDING. Nothing is written
   to the live Transaction table until you explicitly approve it.

## Example row (JSON)

```json
{
  "locality": "Andheri West",
  "project": "Godrej Sky Shore",
  "type": "sale",
  "registration date": "2026-01-15",
  "value": 25000000,
  "carpet sqft": 950,
  "bedrooms": 2,
  "tower": "B",
  "unit label": "B-1204",
  "registration number": "IGR-2026-000123",
  "confidence": "High",
  "source note": "Manually retrieved from Maharashtra IGR e-Search, verified against the printed Index 2."
}
```

A ready-to-fill CSV with the same columns is at
`docs/igr-transaction-import-sample.csv` — it contains only a header row and
one commented example line, no real or fabricated transaction data.

## Recommended workflow for a real IGR batch

1. Perform the permitted IGR search yourself (CAPTCHA included) at the
   official portal.
2. Copy the fields you're shown into the template above — one row per
   transaction.
3. Set **Source of this file** to "Govt. Verified" on the upload form.
4. Upload. Review only the exceptions Transaction Review flags (missing
   fields, unresolved projects, possible duplicates) — everything else is
   already correctly staged.
5. Approve the ones you've verified. Stop any time — unreviewed rows stay
   PENDING until you come back.
