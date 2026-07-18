# CrowdSense AI — FIFA World Cup 2026™ Stadium Assistant

CrowdSense AI is a next-generation multilingual stadium operations and fan navigation assistant developed for the FIFA World Cup 2026 at MetLife Stadium, East Rutherford, NJ.

---

## 1. Problem Statement & Challenge Alignment

During massive events like the FIFA World Cup 2026, stadium ingress and egress present significant logistics challenges. MetLife Stadium hosts up to 60,000 fans, leading to localized gate congestion, long queues, and confusion. 

CrowdSense AI addresses **FIFA World Cup 2026 Challenge 4**:
- **Target Persona**: **Fans** (general spectators, families, and attendees requiring accessibility features).
- **Core Verticals**: 
  - **Navigation & Crowd Management**: Dynamic density-aware rerouting to direct fans away from critical-load gates.
  - **Multilingual Assistance**: Instant translation and localized guidance in 5 target languages (English, Spanish, Portuguese, German, and French).

Every feature of CrowdSense AI maps directly to the challenge requirements:
- **Live Crowd Density Feeds**: Counters and status indicators (Low, Moderate, High, Critical) per gate.
- **Explainable AI (XAI)**: A dedicated reasoning block explaining route recommendations.
- **Multilingual Support**: Auto-detecting input queries and responding in the user's native tongue.

---

## 2. Architecture Diagram

```
                 +-----------------------+
                 |     React Frontend    | <---+ (Polls live status 5s)
                 +-----------+-----------+
                             | (Sends chat query / coordinates)
                             v
                 +-----------------------+
                 |    FastAPI Backend    |
                 +-----------+-----------+
                             |
         +-------------------+-------------------+
         | (Spatial context) | (Live counts)     | (Surge rules)
         v                   v                   v
   +-----------+     +---------------+     +-----------+
   | FAISS RAG |     | Gate Density  |     | Match     |
   | Index     |     | Snapshot      |     | Clock     |
   +-----+-----+     +-------+-------+     +-----+-----+
         |                   |                   |
         +-------------------+-------------------+
                             |
                             v
                 +-----------------------+
                 | Gemini 2.5 Flash LLM  | (LangChain system instruction)
                 +-----------+-----------+
                             |
                             v
                 +-----------------------+
                 |  XAI Reasoning Layer  | (Extracts clean answer + "Why" line)
                 +-----------+-----------+
                             |
                             v
                 +-----------------------+
                 |  User Mobile Screen   | (Formatted WhatsApp-style bubble)
                 +-----------------------+
```

---

## 3. Tech Stack

- **Frontend**: React (Vite, TailwindCSS, Vanilla CSS, Lucide icons)
- **Frontend Testing**: Vitest, React Testing Library, jsdom
- **Backend**: FastAPI (Python 3.14, Uvicorn)
- **Vector Database**: FAISS (L2 index of stadium layout and amenities)
- **Embeddings**: SentenceTransformers (`all-MiniLM-L6-v2`)
- **LLM Pipeline**: LangChain LCEL composition + Gemini 2.5 Flash
- **Backend Testing**: pytest, pytest-asyncio, HTTPX TestClient

---

## 4. AI Usage: AI-Assisted vs. Human-Designed

To maintain operational transparency, CrowdSense AI clearly separates deterministic human design from generative AI reasoning:

| Vertical / Feature | AI-Assisted (Gemini 2.5 Flash) | Human-Designed (Deterministic) |
| :--- | :--- | :--- |
| **Natural Language Support** | Language detection, native synthesis, and tone adjustments. | Mapping locale codes to supported ISO standards. |
| **Crowd Routing** | Translating congestion levels into fan-friendly instructions. | Checking gate capacities, adjacency indices, and alternate selections. |
| **Vector Search** | Semantically matching fan inquiries to stadium points. | Indexing static floor plans and calculating coordinates. |
| **Surge Prediction** | Formatting clock offsets to warn fans of exit peaks. | Comparing elapsed match times against FIFA 90-minute structures. |

---

## 5. Explainable AI (XAI) & Example

Explainability is a core pillar of the CrowdSense AI system. If the backend recommends an alternative entry point, it must output a dedicated explainability paragraph starting with `Why:`.

### Screenshot Example
![Rerouting Alert](screenshots/routing_alert.png)

### Reasoning Process
1. **Fan section request**: Fan submits query: *"Where do I enter for Section 101?"*
2. **Deterministic Lookup**: Section 101 primary entrance is identified as **Gate A**.
3. **Congestion Evaluation**: Live sensor reads **Gate A** at **94% capacity** (Critical).
4. **Adjacency Re-routing**: Adjacency map determines Gate H and Gate B are nearest. Gate H is at **15% capacity** (Low).
5. **Generative Synthesis**: Gemini is instructed to route the fan via Gate H. The XAI layer strips out the explanation:
   - **Answer**: *"For Section 101, please enter through Gate H and walk clockwise along the outer concourse."*
   - **Reason (Why)**: *"Why: Gate A is at 94% capacity right now, so I'm routing you through Gate H instead, which has almost no wait."*

---

## 6. Security

- **Secrets Sanitization**: API keys are isolated to `.env` files. No credentials are committed in repository history.
- **Input Sanitization**: Query inputs are restricted to **500 characters** and filtered against script injections (`<script>`), SQL commands, or excessive payload sizes.
- **Rate Limiting**: Rolling rate limit limits clients to a maximum of **15 requests per minute** (throttles abuse).
- **Graceful Fallback**: If the Google Gemini API key is missing or calls fail, the backend degrades to a keyword-ranked deterministic search over FAISS documents.

---

## 7. Accessibility Features

- **Semantic Markup**: Proper HTML5 elements and logical tab indices (`tabIndex={0}`) ensure full keyboard navigability.
- **Aria Attributes**: `aria-label` elements describe gate/section selectors, layer toggles, and chat inputs.
- **Contrast Check**: Color status badges conform to WCAG AA contrast standards (minimum 4.5:1 ratio).
- **Alt Text**: Alt text is provided for all visual markers, directions, and stadium elements.
- **Multilingual Register Adaptation**: Native support for **5 target languages** is configured to go beyond literal translation by enforcing warm, polite, and culturally respectful formal registers (such as "usted" in Spanish, "vous" in French, "Sie" in German, and "você"/"senhor(a)" in Portuguese) appropriate for welcoming international tourists and visitors.

---

## 8. Local Setup & Verification

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and fill in your `.env` file (using `.env.example` as a template):
   ```env
   GOOGLE_API_KEY=your_gemini_api_key_here
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```
4. Build the static FAISS index:
   ```bash
   python indexer.py
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```
4. Open your browser to `http://localhost:5173`.

---

## 9. Running Tests

Both backend and frontend testing suites can be run locally to verify code quality and regression safety.

### Backend pytest
```bash
cd backend
.venv\Scripts\pytest -v
```

### Frontend Vitest
```bash
cd frontend
npm run test
```

---

## 10. Known Limitations & Future Enhancements

### Limitations
- **Simulated GPS**: Indoor GPS relies on section-to-coordinate interpolation as concrete-reinforced stadiums attenuate satellite signals.
- **Mock Congestion**: Crowd flows are currently simulated using a random walk model for demonstration purposes.
- **No Persistence**: Chat histories and geolocation coordinates are stored session-scoped in memory only.

### Future Enhancements
- **Production Gate Sensors**: Integration of real-time optical gate turnstile counters.
- **Ticket barcode scanning**: Automatic gate and section locking via barcode uploads.
- **Offline RAG Routing**: Localized translation fallback databases on client apps when mobile data signals are congested.
