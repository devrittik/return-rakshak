# **Project: ReturnRakshak — Privacy-First AI Invoice Assistant** 

Act as a senior full-stack engineer and pragmatic software architect. Build a polished, functional MVP of ReturnRakshak for the Hacktoberfest Open-Source AI Challenge. 

## **1. Product vision** 

ReturnRakshak helps users track product return deadlines and warranty expiry dates by extracting useful information from invoices. 

Core flow: 

Upload invoice → Extract text → AI extracts structured fields → User reviews and corrects fields → User confirms policy details → Calculate verified deadlines → Save structured data → Display reminders. 

**Critical privacy requirement:** Never permanently store original invoice PDFs or images. Do not save invoice binaries, OCR images, or raw invoice text in the database. Process files temporarily, retain only explicitly required structured data and minimal policy evidence, then delete temporary artifacts. Do not claim secure deletion if the underlying storage cannot guarantee it. 

## **2. Technology stack** 

- Next.js App Router 

- TypeScript with strict mode 

- Tailwind CSS 

- React Hook Form and Zod 

- SQLite with Drizzle ORM for local development 

- Turso/libSQL with Drizzle for hosted persistence 

- PDF.js for extracting embedded PDF text 

- Tesseract.js for OCR of scanned invoices and images 

- Configurable open-weight LLM adapter 

- Vitest for unit tests 

- Playwright for critical end-to-end tests 

- Vercel for the hosted web application 

Use compatible, maintained package versions. Check the existing repository and installed dependencies before adding packages. 

## **3. Architecture** 

Keep the project modular, with clear boundaries: 

- UI components and pages 

- API route handlers 

- Invoice processing service 

- PDF text extraction and OCR service 

- AI provider adapter 

- Extraction schema and validation 

- Policy verification and deadline rules engine 

- Database repository layer 

- Reminder and calendar export service 

- Temporary-file cleanup utility 

Use interfaces for AI providers and storage so the implementation can switch between local and hosted environments without rewriting business logic. 

Do not introduce microservices, Redis, queues, Docker, or unnecessary infrastructure for this MVP. 

## **4. Invoice processing requirements** 

Accept supported PDF, JPEG, and PNG files. 

1. Validate file size, MIME type, extension, and actual file content. 

2. Reject unsupported, malformed, or oversized files. 

3. For PDFs, attempt native text extraction first. 

4. If usable text is unavailable, use OCR. 

5. Pass the extracted text to a configurable open-weight model. 

6. Request structured JSON containing: 

   - Product name 

   - Seller 

   - Purchase date 

   - Price and currency, when available 

   - Warranty duration and evidence, when explicitly available 

   - Return period and evidence, when explicitly available 

   - Missing fields and uncertainty indicators 

7. Validate the response using Zod. 

8. Show an editable review screen. 

9. Save only after explicit user confirmation. 

10. Delete temporary uploads and processing artifacts in a finally block, including on failures. 

Never invent missing values. Distinguish invoice facts from inferred information. A model-generated value is not automatically verified. 

Do not persist the full OCR text, complete model prompts, raw model responses, or invoice contents in logs. Avoid logging sensitive information. 

## **5. Policy and deadline engine** 

Implement deterministic date calculations outside the LLM. 

- Do not assume every return period begins on the purchase date. 

- Do not assume all deadline counting conventions are identical. 

- Store the policy source, evidence, start date, counting convention when known, and verification status. 

- Mark uncertain or incomplete policies as needs_review. 

- Never display an unverified deadline as confirmed. 

- Allow manual entry and correction. 

- Test month boundaries, leap years, timezone handling, invalid dates, and inclusive/exclusive deadline rules. 

A warranty duration must not be treated as a confirmed warranty policy unless supported by evidence or explicit user confirmation. 

## **6. Data model** 

Design appropriate relational tables for: 

- Products 

- Policy records 

- Reminders 

- Optional user/account records if authentication is introduced 

Include IDs, timestamps, foreign keys, status fields, and appropriate indexes. 

Persist only information needed for the application. Do not persist the original invoice or full extracted invoice text. 

Use migrations and document the database setup. 

## **7. Dashboard and user experience** 

Build a polished, responsive interface with: 

- Upload invoice page 

- Processing and error states 

- Editable extraction review form 

- Product list 

- Product details and policy verification 

- Upcoming return deadline dashboard 

- Warranty expiry dashboard 

- Reminder list 

- Calendar (.ics) export 

- Delete product and associated records 

### ● Clear privacy notice 

Display useful empty states and accessible form validation. Do not create decorative buttons that do nothing. 

## **8. Local and hosted modes** 

LOCAL MODE: 

- Local Next.js server 

- Local SQLite database file outside public directories 

- Temporary processing files 

- Configurable local OCR and local LLM inference 

- No mandatory cloud account or paid AI API 

HOSTED MODE: 

- Vercel-compatible Next.js deployment 

- Turso/libSQL or another explicitly configured persistent database 

- No dependency on a persistent local filesystem 

- No permanent invoice file storage 

- Configurable hosted inference provider 

- Secrets supplied only through server-side environment variables 

Do not attempt to use a local SQLite database file as persistent production storage on Vercel. Do not expose database credentials or AI API keys to client-side code. 

If the hosted version stores personal product records, implement appropriate authentication and authorization before allowing real users to access private records. Do not expose an unauthenticated shared database. 

## **9. AI implementation** 

Create a provider interface with a mock implementation for development and a configurable open-weight model implementation. 

Prefer a local llama.cpp-compatible HTTP endpoint for local inference. Use a hosted endpoint only when configured. 

Do not download or run large models automatically. Do not make the application depend on a particular paid API. 

Include timeout handling, malformed JSON handling, validation errors, and a clear user-facing fallback. When AI is unavailable, allow manual data entry. 

## **10. Testing and quality** 

Write tests for: 

- Text extraction and OCR fallback 

- Structured output validation 

- Missing or uncertain fields 

- Deadline calculations 

- Database CRUD operations 

- Temporary-file cleanup after success and failure 

- File upload security checks 

- Authentication and record authorization, if implemented 

- Calendar export 

Never use real personal invoices as test fixtures. Create synthetic invoice samples. 

Run lint, type checks, tests, and production build. Fix failures instead of merely reporting them. 

## **11. Development process** 

Work in phases: 

Phase 0: Inspect the repository and report existing setup, constraints, and a concise implementation plan. 

Phase 1: Create the app skeleton, UI, database schema, migrations, and sample data. 

Phase 2: Implement upload, temporary processing, PDF text extraction, OCR fallback, and cleanup. 

Phase 3: Implement the mock AI adapter, schema validation, and review screen. 

Phase 4: Implement the configurable open-weight model adapter. 

Phase 5: Implement verified policy handling, deterministic deadlines, dashboard, reminders, and .ics export. 

Phase 6: Add tests, security checks, privacy documentation, README, and deployment instructions. 

After each phase: 

- Summarize files changed. 

- Run relevant tests and checks. 

- Report failures and unresolved issues. 

- Keep the app runnable. 

- Do not silently skip requirements. 

- Do not proceed with destructive changes without approval. 

If a requirement is ambiguous, choose the simplest safe implementation and document the assumption. 

## **12. Definition of done** 

A user can upload a synthetic invoice, extract and review its fields, correct missing information, confirm a valid policy, save the product, view its deadline, export a calendar reminder, and verify that the original invoice is not retained after processing. 

The app must work without a paid AI provider through mock mode and manual entry. Document how to enable local open-weight inference. 

Start with Phase 0. Inspect the repository before modifying files. Do not generate the entire application in one unverified step. 

