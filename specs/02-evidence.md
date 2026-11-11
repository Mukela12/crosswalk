# Spec 02: Controls, evidence and readiness

## Model
- A control maps to one or more framework requirements (`control_requirement`). Reference data is generated
  from `specs/controls.json` by `tools/gen_reference_sql.py`.
- A company has frameworks in scope (`tenant_framework`). Controls with no in-scope mapping are hidden.
- Evidence is a file or an `https://` link with a collected date and an expiry date.

## Status of a control
- Missing: no evidence. Stale: evidence exists, all expired. Expiring: the latest valid item lapses within
  30 days. Met: otherwise.
- A requirement is covered when any mapped control is Met or Expiring. Framework readiness is covered over
  mapped requirements.

## Writes
- Compliance lead only (`ROLE_LEAD`). Auditors read and export.
- Exactly one of file or link. Title 1 to 120 characters. Collected not in the future, expiry after collected
  and at most 3 years out.
- Files: PDF, PNG, JPEG by magic bytes; CSV and TXT by extension plus valid UTF-8 with no NUL bytes. 2 MB cap.
- Every add or remove writes an audit row in the same transaction.

## Exports
- `GET /api/reports/{framework}`: CSV, one row per requirement. Cells are quoted, and any cell starting with
  `= + - @` tab or CR is prefixed with `'` so spreadsheets don't run it as a formula.

## Acceptance (tests)
- `CrosswalkBehaviourTest`, `A05InjectionTest`, `A06InsecureDesignUploadTest`.
