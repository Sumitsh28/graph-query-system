# 🏛️ System Architecture & Engineering Specifications

This document outlines the core design decisions, mathematical graph algorithms, and architectural tradeoffs made while building the Supply Chain Context Graph system.

---

```mermaid
flowchart TB
%% --- STYLING ---
classDef user fill:#1e293b,stroke:#0f172a,stroke-width:2px,color:#fff,font-weight:bold
classDef frontend fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff
classDef backend fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
classDef ai fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff
classDef ingestion fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff

    %% --- ACTORS ---
    User(("👤 Enterprise User")):::user

    %% --- FRONTEND (Next.js) ---
    subgraph "Layer 5: Frontend (Next.js / React)"
        direction LR
        UI["💬 Chat UI<br>Speech-to-Text & Markdown"]:::frontend
        WebGL["🌌 3D/2D WebGL Engine<br>react-force-graph"]:::frontend
        Store[("💾 LocalStorage<br>Session Memory")]:::frontend

        UI <-->|"Event Bus: Camera Framing & Data Particles"| WebGL
        UI <-->|"Persist History"| Store
    end

    %% --- BACKEND (FastAPI) ---
    subgraph "Layer 4: API Gateway (FastAPI)"
        direction TB
        API["⚡ REST API<br>Endpoints: /api/chat & /api/graph"]:::backend
    end

    %% --- AI ORCHESTRATION (LangGraph) ---
    subgraph "Layer 3: AI Orchestration (LangGraph Engine)"
        direction TB
        Router{"1. Semantic Router"}:::ai
        Planner["2. Planner Agent<br>Few-Shot Cypher Generation"]:::ai
        Sandbox{"3. Execution Sandbox<br>Cypher Validator"}:::ai
        Summarizer["4. Summarizer Agent<br>Data-to-English NLG"]:::ai
        Memory[("🧠 MemorySaver<br>Thread Checkpointer")]:::ai

        Router -->|"Valid Query"| Planner
        Planner --> Sandbox
        Sandbox -->|"Syntax Error (Self-Healing)"| Planner
        Sandbox -->|"Valid Results"| Summarizer
    end

    %% --- DATA & DATABASE (Neo4j) ---
    subgraph "Layer 2: Database (Neo4j)"
        direction LR
        DB[("🕸️ Neo4j Graph DB<br>Nodes & Edges")]:::db
        GDS["📊 Graph Data Science<br>PageRank, Centrality, Louvain"]:::db
        DB --- GDS
    end

    %% --- INGESTION PIPELINE ---
    subgraph "Layer 1: Data Engineering"
        direction TB
        Raw["📄 Raw O2C Data<br>JSONL / CSV"]:::ingestion
        CLI["⚙️ Ingestion CLI<br>Pydantic Validation"]:::ingestion
        Raw --> CLI
    end

    %% --- CONNECTIONS ---
    User <-->|"Voice, Text, Clicks"| UI
    User <-->|"Pan, Zoom, Inspect"| WebGL

    UI <-->|"POST /chat (Payload: session_id & active_node)"| API
    WebGL <-->|"GET /graph"| API

    API <-->|"State Recovery"| Memory
    API --> Router
    Summarizer -->|"Returns Extracted IDs & Text"| API

    Sandbox <-->|"Read-Only Cypher Execution"| DB
    CLI -->|"Write-Mode: Seeding & Ontology Building"| DB
```

---

## 1. Graph Data Modeling (Ontology)

### Design Decision: Directional Property Graph vs. RDBMS

Supply chain data (O2C) is inherently relational, but querying highly fragmented tabular data (e.g., tracing a Product -> Order -> Delivery -> Invoice -> Payment) requires expensive, exponentially slow SQL `JOIN` operations.
We modeled this as a **Directional Property Graph** in Neo4j. By storing relationships as physical memory pointers (Index-Free Adjacency), multi-hop traversals execute in milliseconds regardless of the total data volume.

**The Ontology:**

- **Nodes:** `Customer`, `Product`, `SalesOrder`, `Delivery`, `BillingDocument`, `JournalEntry`
- **Edges:** `PLACED`, `CONTAINS`, `FULFILLS`, `BILLED_FOR`, `POSTED_TO`

**Tradeoff:** Ingesting data into a graph database is slower and more complex than bulk-loading a SQL table. We accepted higher write-latency during the seeding phase (`seed_db.py`) to guarantee sub-second read-latency during AI query execution.

---

## 2. Advanced Graph Analytics (Neo4j GDS)

To give the LLM deeper context beyond simple lookups, we utilize Neo4j Graph Data Science (GDS) to pre-compute structural metrics.

- **Degree Centrality (Bottlenecks):** Measures the total inbound/outbound edges of a node.
  - _Implementation:_ Nodes with a score > 10 are flagged as bottlenecks. The UI uses this metric to conditionally render these nodes in **Amber**.
- **PageRank (Influence):** Evaluates the overall structural importance of a node within the transaction network.
  - _Implementation:_ The WebGL engine dynamically maps this float value to the radial size of the rendered nodes (`Math.max(node.pagerank_score * 15, 2)`).
- **Louvain Modularity (Community Clustering):** Detects dense subnetworks of related transactions.
  - _Implementation:_ Assigns a `community_id` integer to nodes, driving the categorical color mapping in the UI to visually separate isolated supply chain islands.

**Tradeoff:** We chose to pre-compute these algorithms during ingestion rather than running them on-the-fly. This uses slightly more storage space (adding properties to every node) but ensures the LLM and the frontend can retrieve complex analytics instantly without freezing the application.

---

## 3. Multi-Agent LLM Orchestration (LangGraph)

Instead of a fragile, single-prompt architecture, the AI backend utilizes a resilient State Machine built with **LangGraph**.

```mermaid
flowchart TD
    %% Define Node Styles for a Premium Look
    classDef user fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff,font-weight:bold
    classDef agent fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    classDef database fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff
    classDef error fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff

    %% External Inputs / Outputs
    U([User Natural Language Query])
    DB[(Neo4j Graph Database<br>APOC & GDS)]
    OUT([Final Natural Language Answer])

    %% The LangGraph Boundary
    subgraph LangGraph Multi-Agent State Machine
        direction TB
        SR{1. Semantic Router<br>Guardrail Agent}
        P[2. Planner & Query Agent<br>Dynamic Schema RAG]
        S{3. Execution Sandbox<br>Read-Only Validations}
        SUM[4. Summarizer Agent<br>JSON to English]
    end

    %% Routing Logic
    U --> SR

    SR -- "Out-of-Domain / Injection" --> Reject([Instant Rejection / Fallback])
    SR -- "Valid Supply Chain Query" --> P

    P -- "Generates Cypher" --> S

    %% Database Interaction
    S -- "Executes Query" --> DB
    DB -. "Returns Raw JSON Results" .-> S

    %% The Self-Healing Loop
    S -- "Cypher Syntax Error<br>Self-Healing: Routes back for Max 3 Retries" --> P

    %% Success Path
    S -- "Success (Valid Graph Data)" --> SUM

    %% Final Outputs
    SUM -- "Formats Data-Backed Response" --> OUT
    Reject --> OUT

    %% Apply Classes
    class U,OUT user
    class SR,P,S,SUM agent
    class DB database
    class Reject error
```

### The Agent Workflow:

1.  **Semantic Router (Guardrail):** A fast LLM classifier that inspects the query. If the user attempts prompt injection or asks out-of-domain questions, it routes directly to the end, skipping database execution.
2.  **Planner & Query Agent:** Dynamically constructs Neo4j Cypher queries.
    - _Design Decision:_ We utilize "Few-Shot Prompting" by injecting strict Cypher grammar rules (e.g., limiting `UNION` usage, enforcing `id` string lookups over `id(n)`) directly into the system prompt to prevent LLM hallucination.
3.  **Execution Sandbox (Self-Healing):** Executes the query against Neo4j.
    - _Design Decision:_ If a `CypherSyntaxError` occurs, the sandbox catches the exception and routes the exact error string _back_ to the Query Agent for a retry. This self-healing loop runs up to 3 times, drastically reducing user-facing errors for "Extreme Hard" analytical queries.
4.  **Summarizer:** Parses the raw Neo4j JSON and translates it into natural language.

---

## 4. Frontend & UI/UX

The frontend is a Next.js React application utilizing `react-force-graph` for WebGL rendering.

### Bidirectional State Sync

The most significant UI challenge was syncing the React DOM (Chat) with the HTML5 Canvas/WebGL engine (Graph).

- **Graph to Chat:** Clicking a 3D node stores its ID in React state. The next chat message appends this ID to the LangGraph payload, giving the AI spatial context ("Targeting Node: X").
- **Chat to Graph:** When the Summarizer Agent returns data, a regex parser extracts alphanumeric SAP IDs from the natural language response. An event bus (`window.dispatchEvent`) sends these IDs to the WebGL engine.

### Cinematic Camera Engine

When the graph receives highlighted IDs from the AI, it does not just change their color. The engine calculates the **Centroid** (center of mass) of the extracted nodes and their maximum spatial **Spread**, commanding the 3D camera to automatically sweep, zoom, and frame the exact results of the user's query.

---

## 5. Security & Data Protection

1.  **Strict Read-Only Execution:** The `driver.session(default_access_mode="READ")` is strictly enforced. Furthermore, the Sandbox Agent uses regex to actively block any query attempting `DELETE`, `DROP`, `MERGE`, or `SET`.
2.  **Massive Data Dump Prevention:** The Query Agent is instructed to silently append `LIMIT 50` to all aggregation queries, preventing the LLM from crashing the backend by attempting to summarize 100,000 JSON rows.
