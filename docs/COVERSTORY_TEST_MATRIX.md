# Cover Story launch test matrix

## Static checks

- `python -m py_compile coverstory/*.py`
- `node --check static/coverstory/app.js`
- Manifest JSON loads at `/coverstory/manifest.webmanifest`.
- Games hub includes the Cover Story beta card.

## Automated tests

- `pytest tests/test_coverstory.py tests/test_funnel.py -q`
- Rules: private location secrecy, one/two plants, pack filtering, accusation, score awards.
- Host controls: pause, resume, extend, next prompt, accusation, reset, kick.
- Timers: server-owned expiry enters accusation, paused timers do not expire, and Redis timer locks prevent duplicate expiry mutation.
- HTTP: page, assets, stats, health, history, debug.
- Persistence: custom packs create/list, custom-pack room creation, durable completed-round history.
- Profiles: create/get/update durable player profiles, sanitize aliases/preferences, sync recent rooms.
- Playtest reports: create/list through `/coverstory/api/playtests`.
- Scale prep: room snapshot serializer/deserializer and persisted-room reload through the realtime backend interface.
- Redis smoke: `python scripts/coverstory_redis_smoke.py <worker-a> <worker-b>` verifies room create on worker A, players on worker B, start propagation A-to-B, and move propagation B-to-A.

## Manual smoke

- Create a room on desktop.
- Join with 3 phone-sized browser tabs.
- Open and seal dossiers.
- Confirm table and remote views are readable.
- Complete one crew-win accusation.
- Complete one plant-win location guess.
- Copy result summary.
- Start a second round and confirm scores persist.
- Build a custom pack with the guided form, select it, and start a room using it.
- Refresh the page and confirm alias, preferred timer/packs, view mode, and recent rooms return from profile sync.

## Mobile viewports

- 390 x 844 phone.
- 430 x 932 large phone.
- 768 x 1024 tablet.
- Confirm no button text wraps outside controls.
- Confirm sealed dossier and private reveal screens require intentional taps.

## Production readiness gates

- No active-round debug endpoint leaks plant IDs, covers, or hidden location.
- Room creation and join complete in under 20 seconds.
- Health endpoint reports active rooms, active players, and capacity utilization.
- Health endpoint reports realtime backend mode, Redis key pattern, pub/sub channel pattern, and timer-lock pattern.
- Stats endpoint contains only aggregate/non-secret event data.
- Redis launch requires a two-worker WebSocket smoke against the same `COVERSTORY_REDIS_URL`; the local smoke has passed, and production/staging should repeat it against deployed workers.
