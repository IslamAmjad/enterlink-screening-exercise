# Screening Exercise — Answers

---

## Part 1: Bug Fixes

---

### Problem A: Silent Data Corruption on CSV Upload

**Root cause**

The upload endpoint inserts the document row first, then loops through every field of every row inserting records one by one — none of it wrapped in a transaction. If anything fails mid-loop (a bad value, a constraint error, anything), PostgreSQL rolls back only that one failed insert. The document row stays committed. The file shows up in the documents list, but its records are incomplete underneath.

**The fix**

Wrapped the entire operation — document insert and all record inserts — in `async with conn.transaction()`. Now it's all-or-nothing. If anything fails at any point, the whole thing rolls back and the database stays clean.

**Why this matters**

This is the worst kind of bug because it's invisible. No error surfaces to the user, the file appears uploaded, but searches against it return partial or missing results. Someone asking "what's the total fleet budget?" might get back 3 of 8 fleet records and walk away with a wrong answer they trust. Wrapping it in a transaction is the minimum bar for data integrity here — the user should either see a complete upload or a clear failure, never a silent half-state.

---

### Problem B: File Input Frozen After Re-Uploading the Same File

**Root cause**

After a successful upload, the file `<input>` element's value was never cleared. The browser uses that value to track which file is selected — if you pick the same file again, it sees no change and `onChange` doesn't fire. The app just sits there with no spinner, no message, nothing.

**The fix**

Added `e.target.value = ""` right after a successful upload. One line. It clears the input's internal state so the next file selection — including the same file — triggers `onChange` normally.

**Why this matters**

The sequence that breaks it is completely natural: upload a file, notice something's wrong with the data, fix the CSV, try to upload it again. Nothing happens. For a non-technical user that just looks like the product is broken. Clearing the input after success is standard browser behavior for resettable file inputs and costs nothing.

---

### Problem C: Full Table Scan on Every Search Query

**Root cause**

The search runs `LOWER(field_value) LIKE '%term%'` — a leading-wildcard LIKE. PostgreSQL can't use a standard B-tree index for that pattern because it doesn't know where in the string to start looking. So it scans every row in the `records` table on every query. At 100 rows you don't feel it. At 5,000+ rows it becomes progressively slower with every upload, and there's no ceiling.

**The fix**

Enabled the `pg_trgm` extension and added a GIN index on `LOWER(field_value)` in `init_db()`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_records_field_value_trgm
    ON records USING GIN (LOWER(field_value) gin_trgm_ops);
```

`pg_trgm` breaks strings into trigrams (overlapping 3-character sequences) and indexes them. PostgreSQL can use this index even for leading-wildcard LIKE queries, so searches become index lookups instead of full scans.

**Why this matters**

This isn't a gradual degradation — it's a query that gets structurally worse the more the product is used. Every CSV upload adds rows, every row makes the next search a little slower. Adding the trigram index is the right fix here without changing the query pattern or pulling in a dedicated search engine. It's also already available in any standard PostgreSQL installation, so there's no new infrastructure dependency.

---
