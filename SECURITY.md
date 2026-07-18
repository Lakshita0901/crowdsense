# Security Policy - CrowdSense AI

This document outlines the security architecture, input controls, and key management practices implemented in CrowdSense AI for the automated code review submission.

## 1. API Key Handling & Secrets Management

- **Zero Hardcoded Secrets**: All API keys, including `GOOGLE_API_KEY`, are strictly read from environment variables.
- **Environment Containment**: The `.env` file containing local environment keys is included in `.gitignore` to prevent leakage to source control. A `.env.example` file is provided with placeholder values to guide local setups safely.
- **Git History Integrity**: No real API keys or credentials have been committed at any point in the version control history.

## 2. Input Validation & Sanitization

- **Query Character Limits**: The fan chat query field `/api/fan/chat` strictly enforces a maximum size constraint of **500 characters**. Queries exceeding this limit are rejected with an HTTP 422 Unprocessable Entity code.
- **Sanitization & Pattern Blocking**: Regular expression checks block common script injection strings, database querying patterns, or HTML tags (e.g., `<script>`, `javascript:`, `union select`, `drop table`, `or 1=1`) to prevent SQL injections (SQLi) and Cross-Site Scripting (XSS).
- **Empty Query Prevention**: Both client-side inputs and API endpoints reject empty or whitespace-only queries.

## 3. Rate Limiting

- **In-Memory Tracking**: A rolling-window rate limiter is implemented on the `/api/fan/chat` endpoint.
- **Throttling Thresholds**: Each client IP is limited to a maximum of **15 requests per minute** to mitigate Denial of Service (DoS) risks and Gemini API budget exhaustion. Exceeded requests return an HTTP 429 Too Many Requests status.

## 4. Graceful Degradation

- **LLM Key Fallback**: If the `GOOGLE_API_KEY` environment variable is unset or invalid, the backend automatically and gracefully degrades.
- **Deterministic RAG**: In fallback mode, the backend utilizes keyword-ranked relevance scoring over the retrieved FAISS floor-plan chunks to compile a formatted list of raw answers, outputting a clear warning message to the client.

## 5. PII and Data Privacy

- **No Persistent PII**: CrowdSense AI does not store user profiles, tickets, names, or contact information.
- **Session-Scoped Location**: Geolocation coordinates (`lat`/`lng`) captured from the browser API are used transiently inside request scopes to render maps and compute routes. They are never logged or stored in databases.
