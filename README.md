# GuardAI: Context-Aware Sensitive Prompt & Image Guard for GenAI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Google Gemini API](https://img.shields.io/badge/LLM-Google%20Gemini%20API-orange.svg)](https://ai.google.dev/)
[![Transformers.js](https://img.shields.io/badge/ML%20Engine-Transformers.js%20(BERT%20NER)-purple.svg)](https://huggingface.co/docs/transformers.js)
[![Tesseract.js](https://img.shields.io/badge/Vision%20OCR-Tesseract.js%20v5-blueviolet.svg)](https://tesseract.projectnaptha.com/)
[![Test Suite](https://img.shields.io/badge/Automated%20Tests-22%2F22%20Passing-brightgreen.svg)]()

> **A client-side multimodal privacy gateway for Generative AI that intercepts, classifies, and redacts sensitive personally identifiable information (PII) and credentials across text and image OCR inputs — with context-aware necessity reasoning and bidirectional response auditing.**

---

## Table of Contents

1. [Problem Statement & Threat Landscape](#problem-statement--threat-landscape)
2. [Architectural Overview](#architectural-overview)
3. [Detection Pipeline Deep Dive](#detection-pipeline-deep-dive)
4. [Supported Sensitive Entity Registry](#supported-sensitive-entity-registry)
5. [Context-Aware Necessity Analysis](#context-aware-necessity-analysis)
6. [Privacy Policy Enforcement Modes](#privacy-policy-enforcement-modes)
7. [Sanitization, Placeholders & Output Auditing](#sanitization-placeholders--output-auditing)
8. [Multimodal Vision & OCR Pipeline](#multimodal-vision--ocr-pipeline)
9. [Security Architecture & Threat Model](#security-architecture--threat-model)
10. [Empirical Evaluation & Benchmark Results](#empirical-evaluation--benchmark-results)
11. [Comparative Architecture Analysis](#comparative-architecture-analysis)
12. [Developer Installation & Quick Start](#developer-installation--quick-start)
13. [Project Directory Layout](#project-directory-layout)
14. [Current Limitations & Roadmap](#current-limitations--roadmap)
15. [License & Acknowledgements](#license--acknowledgements)

---

## Problem Statement & Threat Landscape

Organizations and individual practitioners integrating Large Language Models (LLMs) face systemic data privacy and compliance risks:

* **Unintentional Data Exfiltration**: Users routinely submit confidential identifiers — including PAN numbers, Aadhaar numbers, bank account details, system credentials, and customer records — into third-party cloud prompts.
* **Multimodal Visual Leakage**: Modern vision-language models accept images directly. When documents or receipts containing printed identifiers are submitted, cloud providers process those visual tokens, bypassing conventional text-only data loss prevention (DLP) proxies.
* **Generative Echo and Memory Exposure**: LLM responses frequently re-emit, summarize, or persist sensitive inputs in conversational context windows or system logs, creating downstream exposure risks.
* **Compliance Liabilities**: Regulatory frameworks such as India's **Digital Personal Data Protection (DPDP) Act 2023** and the **General Data Protection Regulation (GDPR)** impose strict compliance mandates and financial penalties on unauthorized personal data disclosures.

### The GuardAI Design Approach

Rather than transmitting raw prompts to a remote proxy for cloud-based sanitization, GuardAI implements a **client-side privacy gateway**. Sensitive data detection, entity classification, necessity analysis, and placeholder masking take place locally within the browser runtime prior to any external network transmission.

---

## Architectural Overview

The GuardAI architecture separates the untrusted client environment from downstream model endpoints through a multi-stage, fail-closed pipeline:

```text
[ USER INPUT: Text Prompt + Attached Images (Up to 5) ]
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               BROWSER RUNTIME (Client-Side Boundary)            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Multimodal OCR: Tesseract.js WebWorker extracts image text   │
│ 2. Dual-Engine Detection:                                       │
│    • Regex Engine (Structured identifiers, credentials, network)│
│    • NER Engine (Transformers.js BERT NER + Heuristic fallback) │
│ 3. Resolution Layers:                                           │
│    • Conflict Resolver (Merges regex and NER spans)             │
│    • Overlap Resolver (Deduplicates nested & partial spans)     │
│ 4. Classification & Necessity Reasoning:                        │
│    • Risk Classifier (CRITICAL, HIGH, MEDIUM, LOW)              │
│    • Context Analyzer (8 deterministic task-necessity schemas)  │
│ 5. Privacy Policy Engine (Basic, Balanced, Strict constraints)  │
│ 6. Interactive User Review & Explicit Transmission Consent      │
│ 7. Sanitizer & Placeholder Engine ([PAN_1], [NAME_1], etc.)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                     (Sanitized Text Only + Consent)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               NODE.JS / EXPRESS BACKEND GATEWAY                 │
├─────────────────────────────────────────────────────────────────┤
│ • Security Middleware: Helmet headers & payload length checks   │
│ • Rate Limiter: Window of 15 mins (100 reqs/IP)                 │
│ • Consent Validator: Blocks requests without explicit consent   │
│ • Zero-Log Auditor: Logs HTTP status & latency only (No PII)    │
│ • LLM Service: Gemini API integration with model failover,      │
│   exponential backoff, 35s AbortController & offline fallback  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│             EXTERNAL LLM (Google Gemini API Service)            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│            POST-GENERATION RESPONSE VERIFICATION                │
├─────────────────────────────────────────────────────────────────┤
│ • Output Checker: Scans AI response for leaked raw identifiers  │
│ • Placeholder Restorer: Reconstructs sanitized tokens locally   │
│ • Final Verified Text Delivered to End-User                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detection Pipeline Deep Dive

GuardAI runs a layered detection process that balances high-precision deterministic matching with linguistic contextual models:

```
[ Raw Text ]
     ├──► [ Regex Detectors ] ────────┐
     │                                ▼
     └──► [ NER Detector ] ──► [ Conflict Resolver ] ──► [ Overlap Resolver ] ──► [ Confidence Filter ] ──► [ Canonical Detections ]
```

### 1. Regex-Based Structured Detection
Specialized regular expression detectors target structured identifiers that adhere to institutional syntaxes:
* **Checksum and Format Verification**: Standard regex validation for PAN formats (`[A-Z]{5}[0-9]{4}[A-Z]`), 12-digit Aadhaar grouping, IFSC clearing formats, and credit cards with Luhn algorithmic verification.
* **Context-Bound Matching**: Patterns for bank accounts, passwords, API keys, and transaction references evaluate preceding tokens (e.g., `A/C`, `UTR`, `Txn ID`, `password:`) to minimize false positives against arbitrary integers.
* **Exclusion Guards**: Email address patterns actively protect against false-positive collision with UPI handles by validating common web domain suffixes versus bank virtual payment address (VPA) handles.

### 2. Deep Learning Named Entity Recognition (NER)
* **In-Browser Model**: When hardware and network support allow, GuardAI initializes `Xenova/bert-base-NER` via `@xenova/transformers` in WebAssembly.
* **Token Classification**: Classifies tokens into `B-PER`, `I-PER`, `B-LOC`, `I-LOC`, `B-ORG`, and `I-ORG` spans to identify personal names, organizations, and geographical addresses across variable sentence structures.

### 3. Heuristic NER Fallback
If the deep learning pipeline cannot initialize (e.g., low memory, offline mode, or headless test runners), GuardAI automatically activates a deterministic heuristic parser:
* **Honorific and Salutation Anchors**: Recognizes cultural title markers (e.g., *Dr.*, *Prof.*, *Mrs.*, *Sri*).
* **Conversational Phrasing**: Captures identity declarations (*"My name is..."*, *"I am..."*, *"Signed by..."*).
* **Transaction Payee Tags**: Identifies recipient names following banking tags (*"Pay to..."*, *"Beneficiary:"*, *"Transfer to..."*).
* **Locality Identifiers**: Parses addresses containing road, layout, sector, nagar, or colony markers.

### 4. Conflict & Overlap Resolution Algorithms
When multiple engines evaluate the same sentence, boundary overlaps inevitably occur:
* **Conflict Resolution**: Structured types (e.g., `EMAIL`, `PAN`, `UPI`, `IFSC`, `TRANSACTION_ID`) are given precedence over general NER labels. However, an explicit override ensures that a multi-word `ADDRESS` span takes precedence over an internal isolated `HOUSE_NO` detection.
* **Span Overlap Resolution**: Calculates intersection ratios. Where one span fully encompasses another without conflict, the larger encompassing entity is preserved; otherwise, the detection with the higher confidence score and greater semantic specificity is retained.
* **Confidence Thresholding**: Detections are assigned normalized heuristic scores ($0.0$ to $1.0$) configured per detector type (representing rule-based match certainty rather than statistical posterior probabilities). Scores $\ge 0.90$ are treated as high confidence; scores between $0.70$ and $0.89$ prompt user confirmation; detections $< 0.70$ are discarded.

---

## Supported Sensitive Entity Registry

| Entity Type | Category | Default Risk Tier | Canonical Example Pattern | Validation Mechanism |
|:---|:---|:---:|:---|:---|
| `PASSWORD` | Credential | **CRITICAL** | `password: Secret#2024` | Contextual prefix + credential tokens |
| `API_KEY` | Credential | **CRITICAL** | `sk-proj-xK9mN2...`, `AIzaSy...` | Provider prefix, Shannon entropy heuristics |
| `PAN` | Identity | **HIGH** | `ABCDE1234F` | Regex pattern matching Indian ITD syntax |
| `AADHAAR` | Identity | **HIGH** | `7845 6321 9087` | 12-digit 4-4-4 formatted number sequence |
| `VOTER_ID` | Identity | **HIGH** | `ABC1234567` | 3 alpha prefix + 7 numeric digits |
| `BANK_ACCOUNT` | Financial | **HIGH** | `9087654321098765` | Contextual prefix (`A/C`, `account`) + 9–18 digits |
| `CARD_NUMBER` | Financial | **HIGH** | `4532 0156 7890 1234` | Regex format + Luhn checksum verification |
| `UPI` | Financial | **HIGH** | `user@okhdfcbank`, `payee@upi` | VPA handle syntax excluding standard email TLDs |
| `IFSC` | Financial | **MEDIUM** | `HDFC0001234` | 4 alpha bank code + `0` + 6 alphanumeric digits |
| `TRANSACTION_ID`| Financial | **HIGH** | `UTR123456789012`, `Txn-8976`| Prefix validation (UTR, IMPS, NEFT, Txn ID) |
| `IP_ADDRESS` | Network | **MEDIUM** | `192.168.1.105` | IPv4 octet bounds (0–255) and standard IPv6 |
| `PHONE` | Contact | **MEDIUM** | `+91 98765 43210` | Country code prefixes and 10-digit mobile numbering |
| `EMAIL` | Contact | **MEDIUM** | `user.name@domain.com` | RFC 5322 compliant email regex |
| `PIN_CODE` | Location | **MEDIUM** | `560001`, `PIN: 110001` | Contextual 6-digit postal index number |
| `HOUSE_NO` | Location | **MEDIUM** | `Flat 4B`, `Plot 12`, `H.No 3` | Residential door and unit numbering patterns |
| `ADDRESS` | Location | **MEDIUM** | `42, Lotus Colony, Sector 15` | Road, colony, layout markers via NER/heuristics |
| `PERSON` | Profile | **LOW** | `Rahul Sharma`, `Dr. Shalini` | BERT token classification / name heuristics |
| `ORGANIZATION` | Profile | **LOW** | `State Bank of India`, `Apollo` | Institutional suffixes and NER model classification |

---

## Context-Aware Necessity Analysis

Standard sanitizers treat data redaction as a binary problem: every detected entity is masked regardless of what the user is trying to accomplish. This degrades prompt utility when the AI genuinely needs certain information to draft a coherent document.

GuardAI uses an **evidence-based Context Analyzer** that determines whether an entity is required for the user's specific objective:

```
[ Prompt Text ] ──► [ Task Classifier ] ──► [ Task Schema Evaluation ] ──► [ Policy Constraint Engine ] ──► [ Recommendation ]
```

### Supported Task Schemas
The analyzer recognizes 8 prompt task archetypes:
1. `email` (Correspondence and messaging)
2. `leave_application` (HR and administrative time-off requests)
3. `financial` (Statements, billing inquiries, payment receipts, tax summaries)
4. `form_filling` (Official registrations and applications)
5. `medical` (Clinical summaries, doctor consultations)
6. `educational` (Academic queries, coursework, research)
7. `resume_cover` (Employment applications and CV drafting)
8. `general` (Default fallback archetype)

### Case Studies: Task Relevance vs. Disclosure Risk

#### Case 1: Leave Application Prompt
* **Prompt**: *"Draft a sick leave email from Rahul Sharma to Acme Corp requesting 2 days off."*
* **Analysis**: Task classified as `leave_application`. The applicant's name (`Rahul Sharma`) is structurally necessary to author a personalized leave note.
* **Engine Recommendation**: `KEEP` for `Rahul Sharma` (unless in Strict Mode).

#### Case 2: Financial Query Prompt
* **Prompt**: *"Format a payment confirmation for Rahul Sharma, Bank A/C 9087654321098765, IFSC HDFC0001234."*
* **Analysis**: Task classified as `financial`. While the bank account number is topic-relevant, exposing raw financial identifiers to an external LLM is unnecessary — an LLM can draft the payment confirmation using token placeholders without seeing the real account digits.
* **Engine Recommendation**:
  * `Rahul Sharma`: `KEEP` (identifies account holder)
  * `9087654321098765`: **`MASK`** (Financial confidentiality principle: relevance does not equal safe disclosure)
  * `HDFC0001234`: **`MASK`** (Reduces correlation of banking branch details)

### Optional LLM-Assisted Metadata Analysis
The backend exposes `POST /api/context-analyze`. When activated, GuardAI transmits **only** sanitized placeholders, entity types, and the prompt intent to the model. Raw PII is never included in the analysis payload. If the remote service is unavailable, the system defaults immediately to local deterministic rules.

---

## Privacy Policy Enforcement Modes

GuardAI provides three user-selectable privacy postures that govern whether entities can be kept, masked, or removed:

```
                    ┌───────────────┬─────────────────┬──────────────┐
                    │  Basic Mode   │  Balanced Mode  │ Strict Mode  │
                    ├───────────────┼─────────────────┼──────────────┤
  High-Risk PII     │  MASK / KEEP  │      MASK       │    REMOVE    │
  Credentials       │    REMOVE     │     REMOVE      │    REMOVE    │
  Low-Risk Context  │     KEEP      │   MASK / KEEP   │     MASK     │
                    └───────────────┴─────────────────┴──────────────┘
```

### Policy Matrix

| Entity Type | Basic Mode | Balanced Mode (Default) | Strict Mode | Transmission Policy |
|:---|:---:|:---:|:---:|:---:|
| `PASSWORD` | **REMOVE** | **REMOVE** | **REMOVE** | Hard blocked: Never transmitted |
| `API_KEY` | **REMOVE** | **REMOVE** | **REMOVE** | Hard blocked: Never transmitted |
| `CARD_NUMBER` | MASK (Keep allowed) | **MASK** (Keep blocked) | **REMOVE** | Masked by default |
| `AADHAAR` | MASK (Keep allowed) | **MASK** (Keep blocked) | **REMOVE** | Masked by default |
| `PAN` | MASK (Keep allowed) | **MASK** (Consent needed) | **REMOVE** | Masked by default |
| `BANK_ACCOUNT` | MASK (Keep allowed) | **MASK** (Consent needed) | **REMOVE** | Masked by default |
| `UPI` | MASK (Keep allowed) | **MASK** (Consent needed) | **REMOVE** | Masked by default |
| `TRANSACTION_ID`| MASK (Keep allowed) | **MASK** (Keep blocked) | **REMOVE** | Masked by default |
| `PHONE` | KEEP if relevant | **MASK** | **REMOVE** | Masked in Strict Mode |
| `EMAIL` | KEEP if relevant | **MASK** | **REMOVE** | Masked in Strict Mode |
| `ADDRESS` | KEEP if relevant | **MASK** | **REMOVE** | Masked in Strict Mode |
| `PERSON` | KEEP if relevant | **KEEP** if necessary | **MASK** | Masked in Strict Mode |
| `ORGANIZATION` | KEEP | **KEEP** | **MASK** | Masked in Strict Mode |

### User Sovereignty & Override Mechanics
GuardAI does not act as a silent black-box filter:
1. Every detected entity appears in an interactive control card with its detected text, confidence score, necessity classification, and policy recommendation.
2. Users can adjust recommendations between `KEEP`, `MASK`, and `REMOVE` for any entity permitted by the active policy mode.
3. Credentials (`PASSWORD`, `API_KEY`) are permanently constrained: user overrides to `KEEP` credentials are hard-rejected by both client validation and backend middleware.
4. Clicking the **"NO"** button dismisses a detected item as a false positive, returning it to raw text.

---

## Sanitization, Placeholders & Output Auditing

The transformation of sensitive inputs and verification of LLM outputs occurs in three distinct phases:

### 1. Placeholder Engine & Sanitization
* When an entity is marked for `MASK`, GuardAI generates a deterministic placeholder (e.g., `[PAN_1]`, `[BANK_ACCOUNT_1]`, `[NAME_1]`).
* When marked for `REMOVE`, the text span is excised and surrounding whitespace is normalized to maintain syntactic cohesion.
* The original-to-placeholder mappings are stored exclusively in an ephemeral `SessionManager` object in browser memory.

### 2. Explicit External Transmission Consent
Before any sanitized prompt is dispatched to the backend:
* The user is shown the exact sanitized prompt that will leave the browser.
* The user must provide affirmative consent. If the consent parameter is false, backend middleware rejects the request with HTTP 403 Forbidden.

### 3. Output Privacy Auditing & Restoration
When the external LLM responds:
* **Output Checker**: Evaluates the incoming text against both regex patterns and active session values. If the model echoes back an identifier or hallucinates an unapproved secret, an output warning banner is displayed with options to mask or discard.
* **Placeholder Restoration**: Approved placeholders remaining in the output text can be replaced with original values client-side, completing the generation workflow without having exposed those values to the external model.

---

## Multimodal Vision & OCR Pipeline

GuardAI supports document-assisted prompting through client-side visual optical character recognition:

```text
[ Attached Image (JPEG/PNG/WebP) ]
               │
               ▼
   [ Tesseract.js WebWorker ] ──► (Extracted Text) ──► [ GuardAI Detection & Sanitization ]
               │                                                      │
               ▼                                                      ▼
     [ Raw Image Base64 ]                                   [ Sanitized Prompt ]
               │                                                      │
               └───────────────────────┬──────────────────────────────┘
                                       │
                                       ▼
                       [ POST /api/generate Backend ]
                                       │
                                       ▼
                           [ Gemini Vision Service ]
```

### Technical Distinction: OCR Text vs. Visual Image Pixels
It is critical to distinguish between OCR text processing and raw visual image data:
1. **Protected (Extracted Text)**: Text extracted from the image via Tesseract.js is fed into the GuardAI detection pipeline. Detected PII is sanitized according to the selected policy before being inserted into the prompt body.
2. **Raw Visual Tokens (Attached Image Payloads)**: When users attach image files, the application converts the file to base64 format and transmits it directly alongside the prompt to Gemini Vision for multimodal queries.
3. **Downstream Response Auditing**: Because the raw image pixels are provided directly to the multimodal model, the model may read numbers directly from the image. GuardAI counters this via its **Output Checker**, which intercepts the model's textual response, flags any leaked values against the session memory, and prompts the user to redact them.
4. **Security Boundary Limitation**: Output checking **does not prevent upstream exposure** of raw image pixels to the cloud API provider. For total visual confidentiality, pixel-level canvas blurring is required before uploading.

---

## Security Architecture & Threat Model

GuardAI is engineered around an edge-first security boundary:

```
CLIENT (Browser Execution Context)
├── Isolated DOM & Memory Scope (Session memory destroyed on reload)
├── In-Browser BERT & Tesseract.js (Zero server data transmission for detection)
└── Application-Layer Prompt Injection Scanner
      │
      ▼  (HTTPS /api/generate — Strict Payload Schema)
GATEWAY (Express.js Backend)
├── Helmet Security Headers
├── Express Rate Limiting (100 requests per 15 min per IP)
├── Strict Payload Size Limits (10 KB prompt, 50 MB image max)
├── Zero-Log Privacy Policy (No prompts or entity values written to logs or disk)
└── Gemini Service Error Handling (Exponential backoff, timeout abort, explicit failover)
```

### Threat Assessment

| Threat Vector | GuardAI Mitigation | Residual Risk & Boundary Limitation |
|:---|:---|:---|
| **Direct PII Exfiltration to Cloud LLMs** | Client-side detection & masking prevents raw PII from being included in prompt text payloads. | Raw image pixels submitted for multimodal queries are visible to the vision API. |
| **System Prompt Injection & Jailbreaks** | Client-side pattern scanner detects phrases attempting to bypass privacy rules or reveal mapping tables. | Heuristic regex scanner cannot guarantee 100% defense against novel semantic evasion or linguistic obfuscation. |
| **Server-Side Data Harvesting** | Zero-log audit middleware logs only HTTP status codes and response latencies; prompt bodies are not logged. | Server memory temporarily processes the sanitized payload before forwarding to the upstream API. |
| **Volatile Memory Extraction** | Session mappings exist only in volatile JavaScript heap memory and are dereferenced on session reset. | Standard browser engines rely on automatic garbage collection; they do not perform cryptographic zero-fill wipes of volatile RAM. A compromised workstation remains a risk. |
| **Denial of Service / Quota Exhaustion**| Backend IP rate limiter enforces a threshold of 100 requests per 15-minute window. | Distributed denial-of-service (DDoS) attacks require upstream reverse proxy filtering (e.g., Cloudflare). |
| **Upstream Service Outages (HTTP 503)** | Exponential backoff across candidate models, 35s timeout aborts, and transparent Simulated LLM fallback. | Simulated mode provides fixed demonstrative responses rather than real-time generative capabilities. |

---

## Empirical Evaluation & Benchmark Results

Evaluation metrics are computed using standardized true-positive (TP), false-positive (FP), and false-negative (FN) formulations:

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}, \quad \text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}, \quad F_1 = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

### Automated Test Suite Execution
Running the integrated test suite via `npm test` (`node tests/run-all-tests.js`) evaluates 22 integration assertions across personal info, financial data, identity records, credentials, IP addresses, context decisions, sanitization, and fallback systems:

```text
============================================================
🛡️  GuardAI Automated Privacy & Security Test Suite
============================================================
--- 1. Personal Information Detection (Name, Email, Phone, Address)  --> 4/4 Passed
--- 2. Financial Information Detection (Bank, IFSC, UPI, Txn ID)    --> 4/4 Passed
--- 3. Identity Information Detection (PAN, Aadhaar)                 --> 2/2 Passed
--- 4. Credentials & Network Identifiers (Password, API Key, IP)     --> 3/3 Passed
--- 5. Mixed Prompts & Overlap Resolution                            --> 1/1 Passed
--- 6. Privacy Decision Engine Policy Review                         --> 4/4 Passed
--- 7. Sanitization & Placeholder Restoration                        --> 2/2 Passed
--- 8. Gemini Models & Offline Demo Fallback                         --> 2/2 Passed
============================================================
📊 Test Suite Completed: 22/22 Passed (100% Success Rate)
============================================================
```

### Empirical Benchmark Datasets

| Dataset | Scope & Description | Test Prompts | Target Entities | TP | FP | FN | Precision | Recall | $F_1$-Score |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `tests/detection-tests.json` | Isolated identifier tests (PAN, Aadhaar, UPI, Passwords, etc.) | 27 | 32 | 32 | 0 | 0 | **1.0000** | **1.0000** | **1.0000** |
| `tests/evaluation-tests.json`| Complex mixed-entity scenarios with overlapping context | 5 | 14 | 11 | 1 | 2 | **0.9167** | **0.8462** | **0.8800** |

> **Scientific Transparency & Evaluation Boundaries**:
> * **Test Prompts vs. Target Entities**: Each test prompt may contain multiple entities. In `detection-tests.json`, 27 prompts contain 32 total target entity instances across all formats (100% extracted). In `evaluation-tests.json`, 5 complex prompts contain 14 target entities (11 extracted, 1 false positive, 2 false negatives due to overlapping geographic entity boundaries).
> * **Synthetic vs. Real-World Variance**: High performance on structured synthetic benchmark suites demonstrates adherence to expected syntactic patterns under laboratory conditions. Universal real-world detection will encounter non-standard notations, optical character distortion in OCR, and cultural phrasing variations that cannot achieve 100% accuracy via regex or baseline tokenizers alone.

---

## Comparative Architecture Analysis

| Feature Dimension | Server-Side DLP / Proxies (e.g., Presidio*, AWS Comprehend) | Standard Direct LLM Interfaces | GuardAI Client Gateway (This Project) |
|:---|:---|:---|:---|
| **Privacy Enforcement Boundary** | Centralized server / daemon (Raw PII leaves browser to reach scanning daemon) | None (Raw prompts sent directly to model provider) | **Client-side browser runtime (Scrubbed locally before network transit)** |
| **OCR Processing Model** | Cloud service endpoint (e.g., AWS Textract / Cloud Vision) | None (Image sent raw to LLM) | **Client-side WebWorker via Tesseract.js** |
| **Indian Identifier Support** | Requires custom community recognizers | Not supported | **Native PAN, Aadhaar, UPI, Voter ID, IFSC, PIN** |
| **Context-Aware Reasoning** | Static pattern redaction | None | **Task-based necessity analysis (8 domain schemas)** |
| **Output Leak Auditing** | Input-only inspection | None | **Bidirectional (Input filtering + Output auditing)** |
| **Offline Resilience** | Non-functional without backend infrastructure | Fails on network error | **Graceful failover to Simulated LLM & local heuristics** |

*\*Note on Self-Hosting*: Solutions such as Microsoft Presidio are open-source and can be deployed on private on-premise infrastructure or within local containers. However, they remain centralized services requiring client-to-service communication. GuardAI's primary distinction is executing detection and sanitization directly within the user's browser runtime before any network call occurs.

---

## Developer Installation & Quick Start

### Prerequisites
* **Node.js**: `v18.0.0` or higher ([Node.js Downloads](https://nodejs.org/))
* **npm**: `v9.0.0` or higher

---

### Method A: One-Click Startup (Windows)
Double-click the provided launcher file:
```cmd
RUN_GUARDAI.bat
```
This launches the Node.js server from the `backend/` directory and automatically opens `http://localhost:3001` in your default browser.

---

### Method B: Terminal Setup (macOS / Linux / Windows)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/keerthana-vangeti/GUARD_AI.git
   cd GUARD_AI/prompt-guard
   ```

2. **Install Backend Dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment configuration into `backend/.env`:
   ```bash
   cp .env.example .env
   ```
   Edit `backend/.env` with your desired configuration:
   ```env
   PORT=3001
   CORS_ORIGIN=*
   LLM_API_KEY=your_google_gemini_api_key_here
   ```
   > 💡 **Offline / Demo Mode**: If `LLM_API_KEY` is not provided or Gemini is unreachable, GuardAI automatically operates in **Simulated Offline Mode**, running the full detection, masking, and necessity pipeline locally.

4. **Run the Test Suite**:
   ```bash
   # From the prompt-guard root directory
   npm test
   ```

5. **Start the Application**:
   ```bash
   # From prompt-guard root
   node backend/server.js
   ```

6. **Access the Web Interface**:
   Open your browser to:
   ```
   http://localhost:3001
   ```

---

### Troubleshooting Common Setup Issues

* **`Port 3001 already in use`**:
  * Run `netstat -ano | findstr :3001` (Windows) or `lsof -i :3001` (Linux/macOS) to identify the running PID and terminate it, or change `PORT=3002` in your `.env` file.
* **`Gemini API returned HTTP 503 / High Demand`**:
  * The backend automatically cycles through candidate fallback models (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.8-flash`) with exponential backoff. If all endpoints are exhausted, the app provides a clearly labelled simulated response.
* **`CORS block on frontend assets`**:
  * Ensure requests originate from the same host or set `CORS_ORIGIN=*` in `backend/.env`.

---

## Project Directory Layout

```text
prompt-guard/
├── frontend/
│   ├── index.html            # User interface layout & modal structures
│   ├── styles.css            # Dark-mode aesthetic design system
│   ├── app.js                # Frontend lifecycle controller & pipeline coordinator
│   ├── detector.js           # Multi-engine detection coordinator
│   ├── regexDetectors.js     # Deterministic regex registry for structured identifiers
│   ├── nerDetector.js        # Transformers.js BERT NER runner + heuristic fallback
│   ├── conflictResolver.js   # Priority logic for resolving Regex vs NER collisions
│   ├── overlapResolver.js    # Deduplication for nested & intersecting text spans
│   ├── confidence.js         # Confidence calculation and classification thresholds
│   ├── riskClassifier.js     # 4-tier risk categorization (CRITICAL, HIGH, MEDIUM, LOW)
│   ├── contextAnalyzer.js    # Task classification & entity necessity reasoning engine
│   ├── privacyPolicy.js      # Policy matrix controller (Basic, Balanced, Strict)
│   ├── placeholderEngine.js  # Dynamic placeholder generation & session key store
│   ├── sessionManager.js     # Transient in-memory session mapping coordinator
│   ├── sanitizer.js          # Text transformer & whitespace grammar normalizer
│   ├── outputChecker.js      # AI output leak detector & placeholder restorer
│   ├── promptInjection.js    # Application-layer adversarial jailbreak scanner
│   ├── ocr.js                # In-browser Tesseract.js v5 OCR runner
│   └── evaluation.js         # Browser-side benchmark evaluation runner
├── backend/
│   ├── server.js             # Express.js service entry point & middleware config
│   ├── package.json          # Express, Helmet, CORS, dotenv, @google/generative-ai
│   ├── .env.example          # Template environment variable specification
│   ├── middleware/
│   │   └── security.js       # Payload validator, image count limiter & zero-log auditor
│   ├── routes/
│   │   └── llm.js            # API routing (/api/generate, /api/models, /api/context-analyze)
│   └── services/
│       └── llmService.js     # Gemini API integration with timeout abort & failover
├── tests/
│   ├── run-all-tests.js      # 22-case automated regression test suite runner
│   ├── detection-tests.json  # 27 targeted entity test cases
│   ├── context-tests.json    # Task necessity reasoning test cases
│   └── evaluation-tests.json # 5 mixed real-world evaluation test scenarios
├── RUN_GUARDAI.bat           # 1-click Windows launcher
├── package.json              # Root project metadata & npm test script
├── .gitignore                # Protects environment credentials and dependencies
└── README.md                 # Primary system documentation
```

---

## Current Limitations & Roadmap

### Documented Limitations
1. **Raw Visual Tokens in Multimodal Calls**: While OCR text is scrubbed from the prompt, attached base64 image pixels are transmitted directly to the multimodal model. Output verification mitigates this, but true visual token redaction (pixel-level bounding-box blurring) remains an ongoing development objective.
2. **Heuristic NER Coverage**: In environments where WebAssembly BERT cannot run, heuristic fallback uses grammatical cues that may miss non-standard naming conventions or foreign addresses without explicit contextual markers.
3. **Adversarial Linguistic Evasion**: Regex-based prompt injection detection catches common jailbreak templates but cannot completely prevent novel semantic manipulation.

### Planned Enhancements
- [ ] **Client-Side Canvas Blur**: Automatic bounding-box obscuration on attached images before base64 encoding.
- [ ] **Local Small Language Model (SLM) Context Analyzer**: Integrating WebGPU-accelerated local models (e.g., Gemma 2B via WebLLM) for on-device natural language necessity reasoning.
- [ ] **Multi-Language Identifier Registry**: Expanding regional tax IDs and mobile formats to cover EU, UK, and APAC jurisdictions.

---

## License & Acknowledgements

* **License**: Released under the [MIT License](LICENSE).
* **Track**: Developed for the **Avinya Hackathon 2026** *(Sensitive Prompt & Multimodal Leak Detection Track)*.
* **Core Dependencies**: [Google Gen AI SDK](https://github.com/google/generative-ai-js), [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js), [Tesseract.js](https://tesseract.projectnaptha.com/), [Express.js](https://expressjs.com/), [Helmet](https://helmetjs.github.io/).
