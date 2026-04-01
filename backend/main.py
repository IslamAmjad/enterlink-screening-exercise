"""
Enterlink Screening Exercise - Backend
A simplified document search API.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import csv
import io
import asyncpg
import os
from typing import Optional
from datetime import datetime

app = FastAPI(title="Enterlink Screening API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/enterlink_screen")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

async def get_db():
    return await asyncpg.connect(DATABASE_URL)


async def init_db():
    conn = await get_db()
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                document_id INTEGER REFERENCES documents(id),
                row_index INTEGER,
                field_name TEXT,
                field_value TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    finally:
        await conn.close()


@app.on_event("startup")
async def startup():
    await init_db()


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    conn = await get_db()
    try:
        async with conn.transaction():
            doc_id = await conn.fetchval(
                "INSERT INTO documents (filename) VALUES ($1) RETURNING id",
                file.filename,
            )

            row_count = 0
            for row_index, row in enumerate(reader):
                for field_name, field_value in row.items():
                    await conn.execute(
                        """INSERT INTO records (document_id, row_index, field_name, field_value)
                           VALUES ($1, $2, $3, $4)""",
                        doc_id,
                        row_index,
                        field_name.strip(),
                        field_value,
                    )
                row_count += 1

        return {"document_id": doc_id, "rows_processed": row_count}
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Search endpoint
# ---------------------------------------------------------------------------

class SearchQuery(BaseModel):
    question: str
    document_id: Optional[int] = None


@app.post("/api/search")
async def search_records(query: SearchQuery):
    conn = await get_db()
    try:
        terms = query.question.lower().split()
        conditions = " OR ".join(
            [f"LOWER(r.field_value) LIKE '%' || ${i+1} || '%'" for i in range(len(terms))]
        )

        sql = f"""
            SELECT r.field_name, r.field_value, r.row_index, d.filename
            FROM records r
            JOIN documents d ON d.id = r.document_id
            WHERE {conditions}
            ORDER BY r.row_index
        """

        rows = await conn.fetch(sql, *terms)

        results = []
        for row in rows:
            results.append({
                "field_name": row["field_name"],
                "field_value": row["field_value"],
                "row_index": row["row_index"],
                "source": row["filename"],
            })

        return {
            "query": query.question,
            "total_results": len(results),
            "results": results,
        }
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# List documents
# ---------------------------------------------------------------------------

@app.get("/api/documents")
async def list_documents():
    conn = await get_db()
    try:
        rows = await conn.fetch(
            "SELECT id, filename, uploaded_at FROM documents ORDER BY uploaded_at DESC"
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()
