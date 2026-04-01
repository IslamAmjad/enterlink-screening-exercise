"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  field_name: string;
  field_value: string;
  row_index: number;
  source: string;
}

interface SearchResponse {
  query: string;
  total_results: number;
  results: SearchResult[];
}

interface Document {
  id: number;
  filename: string;
  uploaded_at: string;
}

const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [view, setView] = useState<"upload" | "search">("upload");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // -------------------------------------------------------------------------
  // Upload handler
  // -------------------------------------------------------------------------

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setUploadMessage(
        `Uploaded ${file.name}: ${data.rows_processed} rows processed.`
      );
      refreshDocuments();
    } catch (err) {
      setUploadMessage("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function refreshDocuments() {
    const res = await fetch(`${API_BASE}/api/documents`);
    const data = await res.json();
    setDocuments(data);
  }

  // -------------------------------------------------------------------------
  // Search handler
  // -------------------------------------------------------------------------

  async function handleSearch() {
    if (!question.trim()) return;

    setSearching(true);

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data: SearchResponse = await res.json();
      setSearchResults(data);
    } catch (err) {
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>Enterlink</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Upload your data. Ask questions. Get answers.
      </p>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setView("upload")}
          style={{
            padding: "8px 16px",
            background: view === "upload" ? "#0066cc" : "#eee",
            color: view === "upload" ? "#fff" : "#333",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Upload
        </button>
        <button
          onClick={() => setView("search")}
          style={{
            padding: "8px 16px",
            background: view === "search" ? "#0066cc" : "#eee",
            color: view === "search" ? "#fff" : "#333",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </div>

      {/* Upload view */}
      {view === "upload" && (
        <div>
          <h2>Upload CSV</h2>
          <input
            type="file"
            accept=".csv"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading && <p>Processing...</p>}
          {uploadMessage && (
            <p style={{ color: "#006600", marginTop: 8 }}>{uploadMessage}</p>
          )}

          <h3 style={{ marginTop: 24 }}>Uploaded Documents</h3>
          {documents.length === 0 ? (
            <p style={{ color: "#999" }}>No documents uploaded yet.</p>
          ) : (
            <ul>
              {documents.map((doc) => (
                <li key={doc.id}>
                  {doc.filename} (ID: {doc.id})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Search view */}
      {view === "search" && (
        <div>
          <h2>Ask a Question</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g., What was the total budget for Q3?"
              style={{
                flex: 1,
                padding: 8,
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{
                padding: "8px 16px",
                background: "#0066cc",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Results */}
          {searchResults && (
            <div>
              <p style={{ color: "#666", marginBottom: 8 }}>
                {searchResults.total_results} results found
              </p>
              {searchResults.results.length === 0 ? (
                <p>No matching records found. Try rephrasing your question.</p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: 8,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #ccc" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Field</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Value</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Row</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.results.map((r, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid #eee" }}
                      >
                        <td style={{ padding: 8 }}>{r.field_name}</td>
                        <td style={{ padding: 8 }}>{r.field_value}</td>
                        <td style={{ padding: 8 }}>{r.row_index}</td>
                        <td style={{ padding: 8 }}>{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
