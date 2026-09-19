# SmritiSetu NER Product Architecture

## 1. Product Vision

SmritiSetu NER is a culturally aware AI cognitive companion for elderly dementia and memory-support users in North East India. It combines gentle cognitive games, authorized family memory assistance, routine reminders, caregiver analytics and administrator-controlled regional content. The product is intentionally framed as a support platform, not a clinical diagnostic tool.

## 2. Personas

- Elderly user: Kamala Devi, 72, Assamese preference, needs calm reminders, familiar visuals, simple interactions and confidence.
- Caregiver: Priya Devi, daughter, remote or co-located, needs reassuring trends, routines and explainable alerts.
- Admin/content verifier: regional program operator, verifies translations, cultural content, RBAC and audit logs.
- Clinician/community worker: optional observer role, can review summaries when authorized.

## 3. User Journeys

- Elderly daily journey: open app, hear greeting, complete one game, ask "Who is Ananya?", follow medicine reminder.
- Caregiver journey: check completion, review baseline drift, read AI rationale, adjust reminder wording, call user if needed.
- Admin journey: review NER content catalog, approve translations, audit access, monitor impact metrics.
- SIH judge journey: launch demo bar, step through elderly UI, game adaptation, memory assistant and caregiver dashboard.

## 4. Feature Hierarchy

- Elderly mode: dashboard, games, journal, reminders, caregiver call, voice prompts.
- Cognitive games: memory pairs, relation recall, attention target selection, date/festival orientation; future language, logic and visual-spatial tasks.
- AI layer: adaptive difficulty, personal baseline, explainable caregiver alerts, safe memory Q&A.
- Caregiver mode: activity status, routine manager, cognitive analytics, explainable insights.
- Admin mode: RBAC, audit logs, cultural catalog, impact metrics, verified localization pipeline.

## 5. AI Architecture

- Input layer: game events, reminder acknowledgements, caregiver notes, authorized memory entries, language choice.
- Cognitive engine: calculates accuracy, response time, mistakes, session score and next-level recommendation.
- Baseline engine: compares sessions against the user's personal rolling baseline, not population norms.
- Memory assistant: retrieval-first Q&A over approved family memory objects and routine schedule.
- Insight engine: produces non-alarmist caregiver summaries with rationale and suggested action.
- Safety layer: blocks diagnosis language, flags emergency intent and keeps medical decisions outside the model.

## 6. Data Model

Core entities:

- User: id, demographics, preferred language, accessibility settings.
- CaregiverLink: elderlyId, caregiverId, consent, contact rules.
- GameSession: gameId, domain, accuracy, responseTime, mistakes, difficulty, score.
- BaselineSnapshot: elderlyId, domain metrics, sample count, established date.
- MemoryEntry: title, person, relation, approved text, media, tags, access policy.
- Reminder: title, time, category, completion state, voice prompt.
- Alert: severity, trigger, rationale, recommended caregiver action.
- RegionalContent: state, language, verified strings, cultural assets, approval status.
- AuditLog: timestamp, actor, role, action, target, IP/device metadata.

## 7. API Architecture

Suggested backend modules:

- `POST /auth/login`, `POST /auth/consent`.
- `GET /users/:id/dashboard`.
- `POST /games/session`, `GET /games/recommendations/:elderlyId`.
- `GET /baseline/:elderlyId`, `GET /insights/:elderlyId`.
- `GET /memories`, `POST /memories/query`.
- `GET /reminders`, `POST /reminders`, `PATCH /reminders/:id`.
- `GET /regional-content`, `POST /regional-content/approval`.
- `GET /audit-logs`, `GET /impact/summary`.

Frontend calls should use role-scoped tokens and never expose raw private memory stores to unauthorized roles.

## 8. Security And Privacy

- Explicit caregiver consent and revocation.
- RBAC for elderly, caregiver, admin, clinician and community worker roles.
- Encryption in transit and at rest.
- Audit logs for memory access, reminder edits and admin approvals.
- Data minimization: store only memory facts needed for support.
- Human verification for regional translations and cultural prompts.
- No diagnostic claims, no medication changes without caregiver/doctor authority.

## 9. UI/UX Strategy

- Elderly UI: large targets, high contrast, familiar labels, calm copy, minimal nested navigation.
- Caregiver UI: dense dashboard cards, baseline comparison, explainable alerts.
- Admin UI: operational catalog, audit logs and platform metrics.
- Accessibility: text scaling, speech synthesis hooks, keyboard-friendly controls, responsive layouts.
- Emotional design: confidence and familiarity before novelty.

## 10. Localization Strategy

- English and Hindi supported as baseline language options.
- Assamese demo profile included for NER relevance.
- Architecture supports all eight NER states through verified regional catalogs.
- Sensitive cultural content must be reviewed by local speakers/community partners before production use.

## 11. Development Plan

- Phase 1: React prototype, mock data, adaptive scoring, demo flow.
- Phase 2: Backend APIs, persistent database, auth, RBAC and audit logs.
- Phase 3: Speech-to-text, TTS, RAG memory assistant and multilingual content pipeline.
- Phase 4: Offline-first PWA, caregiver notifications and deployment telemetry.
- Phase 5: pilot with elder-care homes/community health partners and accessibility testing.

## 12. Judging Strategy

Lead with the human story, then show engineering depth. The strongest SIH pitch sequence is:

1. Kamala Devi opens a safe elderly UI.
2. She plays a familiar Assam memory game.
3. The adaptive engine explains difficulty change.
4. She asks who Ananya is.
5. Caregiver Priya sees trends and rationale.
6. Admin shows NER scale, verified localization and auditability.

## 13. Demo Storyline

Kamala Devi, 72, lives in Assam and sometimes forgets family context and routine steps. SmritiSetu greets her in a familiar tone, guides her to a short Bihu-themed memory task, answers an approved family-memory question about Ananya, reminds her about the next routine item, and gives Priya a clear, non-alarmist report.

## Current Implementation Scope

This repository implements Phase 1 as a frontend prototype with mock intelligence services. It is ready for a judge-facing walkthrough and designed so Phase 2 can replace local data/services with real APIs without changing the interaction model.
