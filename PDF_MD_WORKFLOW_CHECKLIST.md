# PDF -> Markdown Workflow Migration Checklist

This tracks incremental progress toward browser-side PDF conversion (MD) before AI analysis.

## Phase 1: Incremental Bridge

- [x] Add backend endpoint for pre-extracted text (`POST /api/analyze-text`)
- [x] Reuse existing AI provider/model routing for text endpoint
- [x] Add frontend PDF workflow selector:
  - [x] `Server Parser (Current)`
  - [x] `Browser Text -> AI (Incremental)`
- [x] Wire browser workflow to send extracted PDF text to `/api/analyze-text`
- [x] Preserve metadata + cover handoff in incremental browser workflow
- [x] Add API docs for `/api/analyze-text`
- [ ] Add integration tests for `/api/analyze-text` validation + success path (mocked AI)

## Phase 2: extract2md Integration

- [x] Add `extract2md` dependency with lazy loading on PDF workflow
- [x] Convert PDF to Markdown using `extract2md` fast mode by default
- [x] Add OCR fallback mode (Tesseract path) for scanned PDFs
- [x] Surface conversion progress/cancel in UI
- [x] Pass true Markdown output (not plain extracted text) to `/api/analyze-text`
- [x] Add telemetry for conversion duration + text length + fallback usage

## Phase 3: Hardening and Rollout

- [ ] Performance limits for large PDFs (page cap, timeout, max text cap)
- [ ] Add quality guardrails (minimum extracted text threshold)
- [ ] Add feature flag for default workflow selection
- [ ] Staged rollout and compare success/error rates vs server parser path
- [ ] Deprecate server PDF parser path once browser MD path is stable
