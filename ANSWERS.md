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
