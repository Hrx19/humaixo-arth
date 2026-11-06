# Humaixo AI foundation

## Current architecture

The mobile app is built with Expo Router and React Native. The authenticated API
is Express and TypeScript, backed by MongoDB through Mongoose. A separate Flask
service currently handles bank-SMS parsing; financial questions in Humaixo AI
are answered by read-only API tools against the signed-in user's own records.

The Humaixo AI screen is available from the main bottom navigation. It shows
grounded answers, supporting transaction links, permission audit activity, and
an owner-only Master Mode console when an authorized owner session is active.

## API

All endpoints below require the existing `Authorization: Bearer <token>` JWT.

### `GET /api/v1/ai/permission-status`

Returns the authenticated user's current access level and capabilities. A
normal signed-in user starts at Level 1; owner privileges are separately
allowlisted and session-gated.

### `POST /api/v1/ai/query`

Accepts `{ "question": "..." }` with a 3–500 character question. Only supported
read-only financial queries are executed. Results are restricted to data owned
by the authenticated user and include calculation details and supporting
transaction IDs. Unsupported questions receive a clear response rather than
being sent to an external model.

### `GET /api/v1/ai/audit?limit=20`

Returns up to 100 of the authenticated user's latest AI activity entries.
Entries record the action outcome and question length, not question text or
financial content. The UI displays the five latest entries.

## Owner control plane

Configure `AI_OWNER_USER_IDS` in `backend/.env` with a comma-separated
allowlist of MongoDB user ObjectIds before owner enrollment. The default empty
value disables all owner controls. The allowlist must be provisioned by an
operator; being a signed-in user is not sufficient. Do not commit populated
production values.

The authenticated owner enrolls once using `POST /api/v1/ai/master/enroll`,
then verifies with `POST /api/v1/ai/master/verify`. The Master Code is hashed
with Argon2id; it must contain 12–128 letters or numbers. Only a high-entropy
opaque session token is returned. The token is valid for 15 minutes, stored as
a hash in MongoDB, and must be sent in
`X-Owner-Session-Token` in addition to the ordinary JWT for Tier 3 requests.
`POST /api/v1/ai/master/rotate` changes the code and revokes existing sessions;
`POST /api/v1/ai/master/revoke` revokes the current session. `GET
/api/v1/ai/master/status` is restricted to allowlisted owner accounts.

`POST /api/v1/ai/actions/authorize` classifies only explicit action names.
Unknown actions are denied. `POST /api/v1/ai/actions/proposals` creates Tier 2
proposals, and `POST /api/v1/ai/actions/proposals/:id/approve` records a
configured owner's decision only; approval does not execute the proposed
operation. `GET /api/v1/ai/actions/audit` returns the current tenant's audit
events. Tenant-scoped permission events are written to
`ai_permission_logs`; application APIs expose no update/delete operations for
these records. This is application-level append-only behavior, not a
tamper-proof or legally immutable audit store.

`GET /api/v1/ai/emergency/status` reports API/database health.
`POST /api/v1/ai/emergency/cache-flush` and
`POST /api/v1/ai/emergency/restart-service` require their respective Tier 3
owner scopes. Mutation submissions use `POST /api/v1/ai/mutations`; status is
available to the submitting tenant through `GET /api/v1/ai/mutations/:id`.

Code mutation submissions retain a digest and changed paths, not the submitted
patch contents. No patch is executed or deployed. The sandbox adapter reports
lint/typecheck as `not_run` until a genuinely isolated runner is configured;
it never reports a successful check without running one. Cache flushing returns
503 until an application cache provider is registered. Service restart asks
the existing graceful-shutdown handler to close the process and relies on an
external process manager to restart it. All these capabilities remain limited
to allowlisted owners, scoped short-lived sessions, and audit records.

AI queries continue to use only read-only API tools against the authenticated
user's own records. Supporting statement evidence is not changed by AI.

## Audit and security limits

The original AI query event log and the Level 2 permission log are distinct
collections. Both are tenant-filtered. MongoDB administrators can still alter
either collection; use a separately controlled append-only/WORM store if
stronger audit guarantees are required.

## Next milestones

1. Add an independently verified second factor for owner enrollment and
   emergency access.
2. Register a concrete cache provider and an isolated patch runner before
   enabling those operations in production.
3. If stronger audit guarantees are required, export events to a separately
   controlled append-only/WORM store.
4. Expand read-only financial intents with tests for user isolation,
   calculations, audit outcomes, and rollback-safe data migrations.
