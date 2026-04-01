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

## Part 2: Design Questions

---

### Question 1: Retrieving a buried answer across 50 PDFs

I'll be upfront: I haven't deployed a RAG pipeline or vector database in production. To put together a thoughtful answer here, I used AI tools to help me understand how these systems work in practice, the tradeoffs around chunking, reranking, grounding, and then reasoned through how I'd apply them to this specific problem. The design below reflects that process. I'm confident I can work with this stack and ramp quickly, but I'd rather be honest about where my hands-on experience sits than oversell it.

With that said, the real challenge in this scenario isn't just search, it's that keyword search is the wrong tool entirely. "Overtime policy" might not appear anywhere in the document that actually has the answer. It might say "hours worked beyond the standard shift" or just reference a policy number. Meanwhile those 12 vaguely related documents will match just as well on keywords. You'd surface noise and bury the answer.

**How I'd approach it**

I'd start by chunking each document into overlapping segments, somewhere around 400-600 tokens with a bit of overlap so policy clauses that straddle a boundary don't get split in half. Each chunk gets embedded and stored in a vector DB with metadata attached: document name, page number, section heading if I can extract it.

When a user asks a question, I embed it and pull the top 20-30 most semantically similar chunks. But that's not the finish line, vector similarity will still surface a chunk about "overtime pay rates" from a financial report almost as highly as the actual policy paragraph. So I'd run a reranker on those candidates, something like Cohere Rerank, which scores each chunk against the actual question rather than comparing independent vectors. It's slower but much sharper. The top 5-8 chunks from that go to the LLM with a strict prompt: only use what's in these passages, quote directly, cite the document and page.

The 12 vaguely related documents don't need special handling — if they don't actually answer the question, the reranker pushes them down naturally and they don't make it into the final context.

**Tradeoffs**

Two-stage retrieval adds latency. A 3-4 second wait is fine for this kind of question; 10+ seconds isn't. I'd put a timeout on the reranker and fall back to raw vector results if it's taking too long.

Chunking is the trickiest call. Too small and you split a multi-paragraph policy so no single chunk has the full answer. Too large and you're flooding the LLM with noise. I'd start at 500 tokens and tune based on whether answers feel incomplete, it's something you have to measure, not calculate.

The one thing this design doesn't handle well is the "we don't actually have an answer to this" case. If the reranker scores are all low, that's a signal to tell the user we couldn't find a confident answer rather than letting the LLM fill the gap with something plausible-sounding. That explicit "I don't know" path matters a lot for user trust.

---

### Question 2: Addressing 15% factual error rate in AI answers

The thing that makes 15% dangerous isn't the number, it's that the errors are plausible. Users aren't catching them. That means you can't rely on feedback to surface the problem, and every confident wrong answer chips away at trust in the whole system. One person acts on a wrong overtime rate or a misquoted deadline and suddenly the product feels unreliable even when it's right.

**What I'd do first**

Before adding any infrastructure, I'd tighten the prompt. Most hallucinations in RAG systems happen when the retrieved context doesn't fully answer the question and the model fills the gap with something that sounds reasonable. A stricter prompt, one that explicitly says "only use what's in these passages, quote the text directly, don't infer", cuts a meaningful chunk of that. It costs nothing and you can test it the same day.

Right alongside that, I'd add a quick post-generation verification step. After the LLM produces an answer with citations, a second short LLM call just asks: does this cited passage actually back up this specific claim? It's cheap to run and catches the most common failure, where the model cites a real document but quietly misrepresents what it says or pulls a number from the wrong paragraph. If verification fails, surface the answer with a caveat rather than blocking it entirely. Users can handle "we found something relevant but couldn't fully confirm it", they can't handle silent wrong answers.

**What I'd do next**

Once those two are in place, I'd work on making confidence visible in the UI, not as a percentage (nobody knows what 74% confident means in practice) but as a clear signal. High confidence answers show the quoted source inline. Lower confidence answers say "here's what we found, but we couldn't pin down a direct answer." That shifts part of the problem from an accuracy problem to a UX problem, which is much easier to iterate on.

Then logging and a feedback button. Every query, every retrieved chunk, every generated answer, logged. A simple thumbs down is enough to start. Even a few dozen flagged answers a week tells you which document types or question patterns are producing the most errors, so you can fix those specifically instead of guessing.

**What I'd leave for later**

Fine-tuning or custom models. It's always tempting to reach for that early, but it's slow, expensive, and usually the wrong diagnosis. Most factual errors come from retrieval quality or prompt slippage, not the base model. I'd exhaust the cheap levers first and revisit model-level work once there's actual evidence that's where the errors are coming from.

---
