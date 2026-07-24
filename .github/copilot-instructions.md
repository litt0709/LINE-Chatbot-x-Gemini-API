<!-- Copilot / AI agent instructions for quick onboarding -->
# Project Overview
- Purpose: LINE/Telegram chatbot using Firebase Cloud Functions (2nd gen) + pluggable LLMs.
- Main entry: functions/index.js — orchestrates RTDB + Firestore, adapters, LLM calls.

# Quick Architecture
- Functions: [functions/index.js](functions/index.js) is the runtime entry (HTTP/scheduler triggers).
- Data: short-lived raw chat => Realtime Database (RTDB). Profiles & summaries => Firestore. See [functions/utils/db.js](functions/utils/db.js).
- Integrations: LINE adapter [functions/utils/line.js](functions/utils/line.js) and Telegram adapter [functions/utils/telegram.js](functions/utils/telegram.js).
- LLMs: provider-agnostic router at [functions/utils/llm.js](functions/utils/llm.js) (env var `LLM_PROVIDER` selects `GEMINI` or `DEEPSEEK`).

# Developer workflows (concrete commands)
- Local emulator: from `functions` run `npm run serve` (runs `firebase emulators:start --only functions`). See [functions/package.json](functions/package.json).
- Deploy: `npm run deploy` (deploys only functions).
- Logs: `npm run logs` to tail Cloud Functions logs.
- Env: copy `functions/env.example` and populate credentials and API keys before running locally.

# Important environment variables
- `PLATFORM` — `LINE` or `TELEGRAM` (see `functions/env.example`).
- `CHANNEL_ACCESS_TOKEN`, `CHANNEL_SECRET` — LINE credentials.
- `TELEGRAM_BOT_TOKEN` — Telegram bot token.
- `LLM_PROVIDER` — `GEMINI` (default) or `DEEPSEEK`; provider keys: `API_KEY` or `DEEPSEEK_API_KEY`.
- Admin IDs (e.g. `TELEGRAM_ADMIN_APPPROVAL_ID`) for approval flows.

# Project-specific patterns & gotchas
- Message-tag DSL: the code parses XML-like tags embedded in chat messages: `<PROFILE ...>`, `<FACT .../>`, `<REACT emoji="..."/>`, `<TOPIC>...</TOPIC>` — implementers add behavior by producing those tags from prompts.
- Memory model: facts are stored as index/detail pairs in RTDB (global vs per-user). Use `saveFact`, `getFactsIndex`, `getFactDetail` in [functions/utils/db.js](functions/utils/db.js).
- Caching: in-memory caches (Maps / objects) with TTL are used heavily to reduce RTDB/Firestore calls — follow existing patterns when adding stateful helpers.
- Telegram chunking: long messages are chunked and converted to HTML; when updating messaging logic, preserve chunking and `parse_mode: "HTML"` handling in [functions/utils/telegram.js](functions/utils/telegram.js).
- LINE behavior: use replyToken for replies and `push` for proactive messages (see [functions/utils/line.js](functions/utils/line.js)).
- Leak protection: `utils/leak_blacklist.json` is used to detect prompt-leak attempts; don't bypass that check.

# Extending or swapping LLMs
- Add a provider module under `functions/utils/` (e.g., `gemini.js`, `deepseek.js`) and export the same interface used across the codebase. The router is `functions/utils/llm.js`.
- Keep provider selection via `LLM_PROVIDER` and ensure model / API-key env vars follow the naming used in `functions/env.example`.

# Debugging tips
- Reproduce locally using `npm run serve` and set env vars from `functions/env.example`.
- Use `console.log` to trace request flow in `functions/index.js`; important flows: tag parsing -> facts saving -> LLM call -> platform reply.
- Check emulator logs and Firebase logs (`npm run logs`) for runtime errors.

# Files to look at when you need context
- Top-level README: [README.md](README.md)
- Entrypoint & core logic: [functions/index.js](functions/index.js)
- DB helpers: [functions/utils/db.js](functions/utils/db.js)
- LLM router: [functions/utils/llm.js](functions/utils/llm.js)
- Platform adapters: [functions/utils/line.js](functions/utils/line.js), [functions/utils/telegram.js](functions/utils/telegram.js)
- Env example: [functions/env.example](functions/env.example)

# What not to change lightly
- RTDB indexing scheme (index/detail for facts) — changing it requires migration across reads/writes.
- Message-tag formats — many flows rely on exact tag names and attributes.
- Caching TTLs and in-memory keys — mis-sync can cause stale data issues.

# If anything's unclear
- Tell me which area you want expanded (deployment, adding LLM, or message-tag DSL) and I will update this file.
