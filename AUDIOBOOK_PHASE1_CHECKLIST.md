# Audiobook Phase 1 Checklist

## Scope
- Add baseline audiobook support (upload + metadata + analysis pipeline integration).
- Do not add transcription or waveform/speech analysis yet.

## Tasks
- [x] Create and maintain Phase 1 checklist file.
- [x] Add `audiobook` file type in frontend selectors and upload accept rules.
- [x] Update frontend file validation and submit flow to include audiobook uploads.
- [x] Add backend upload validation for audiobook MIME/extension combinations.
- [x] Implement backend audiobook parser:
  - [x] Parse RWPM `.audiobook` package metadata from `manifest.json`.
  - [x] Parse baseline metadata from standalone audio files (`.mp3`, `.m4b`, `.wav`) where possible.
  - [x] Generate fallback analysis text context for AI from extracted metadata.
- [x] Update controller routing to process audiobook files via parser.
- [x] Suppress ebook-only readability/accessibility sections for audiobook metadata display.
- [x] Run build/tests and fix compile/runtime regressions.
- [x] Document Phase 1 behavior and constraints.

## Notes
- Phase 1 focuses on robust ingestion and metadata-first analysis.
- Phase 2 can add transcription and richer audio content intelligence.
- Build status: `npm run build` passes.
- Test status: `npm test -- --runInBand` passes.

## Phase 2 Tasks (In Progress)
- [x] Add provider-aware transcription mode contract on backend (`metadata-only`, `transcribe-preview`, `transcribe-full`).
- [x] Implement backend transcription service abstraction with provider support checks.
- [x] Add cost-control inputs (minutes caps) and enforced server-side limits.
- [x] Wire audiobook transcription options in UI and send to `/api/analyze-book`.
- [x] Surface transcription telemetry in primary UI results panel.
- [x] Add integration tests for unsupported provider mode and transcription validation errors.
