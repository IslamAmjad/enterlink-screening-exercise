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
