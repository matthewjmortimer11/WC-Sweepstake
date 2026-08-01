# Cover Story online scale plan

## Current beta runtime

- Room state lives in-process in `coverstory.manager.Manager`.
- WebSockets broadcast room state to connected players after each state change.
- Room cleanup removes empty rooms after 120 seconds and idle rooms after 6 hours.
- `/coverstory/api/health` exposes active rooms, connected players, target utilization, and realtime backend status.
- `/coverstory/api/stats` exposes aggregate beta counters and recent non-secret events.
- Custom location packs are durable in `coverstory_custom_packs`.
- Completed round summaries are durable in `coverstory_rounds` and intentionally omit private live-round state.
- Player aliases, preferred settings, view mode, and recent room codes are durable in `coverstory_player_profiles`.
- When `COVERSTORY_REDIS_URL` or `REDIS_URL` is set, live room snapshots are saved to Redis and room-change events publish to Redis pub/sub. With neither set, the game keeps the zero-config in-memory local path.

## First production target

- 1,000 active rooms.
- 10,000 connected players.
- 3-16 players per room.
- 95% of completed rounds with no reconnect or state recovery issue.

## Redis migration shape

- Keep FastAPI as the WebSocket edge.
- Store live room snapshots in Redis keys: `coverstory:room:{code}`. This adapter and room serializer now exist in `coverstory.realtime` and `coverstory.manager`.
- Use Redis pub/sub channel `coverstory:room:{code}:events` for multi-worker broadcasts. Workers subscribe after a local socket joins and refresh local sockets from the latest snapshot.
- Serialize cross-worker WebSocket mutations with Redis key `coverstory:room:{code}:mutation-lock` so concurrent actions refresh the latest snapshot before mutating and saving.
- Keep room history summaries in Postgres after reveal. This is implemented for completed-round summaries.
- Keep private role/location data server-side only; clients receive per-player views generated from room state.

## Required before multi-worker launch

- Room state serializer/deserializer tests. Basic snapshot round-trip coverage is implemented.
- Real Redis cross-worker WebSocket broadcast test. Local coverage is now implemented in `scripts/coverstory_redis_smoke.py`.
- Deployment smoke with at least two Uvicorn workers sharing one Redis instance. Local smoke passed with workers on ports `8011` and `8012` sharing Redis on `6381`, including the forced timer-expiry variant.
- Server-owned countdown ticks from a single room authority. The manager ticker now moves expired questioning rounds into accusation, persists/publishes the room, and uses Redis key `coverstory:room:{code}:timer-lock` to prevent duplicate multi-worker expiry mutations.
- Redis TTL matching current empty/idle cleanup behavior. Snapshot writes now use 120 seconds for rooms with no connected players and 6 hours for connected rooms.
- Backpressure policy for rooms with slow sockets. Broadcast sends now have a short timeout; slow or broken sockets are dropped, players are marked disconnected, and `slowSocketDrops` / `broadcastErrors` metrics are recorded.

## Local Redis smoke recipe

1. Start Redis:
   `redis-server --port 6381 --save '' --appendonly no`
2. Start worker A:
   `DATABASE_URL=sqlite+aiosqlite:///./.coverstory_redis_smoke_a.db COVERSTORY_REDIS_URL=redis://127.0.0.1:6381/0 uvicorn main:app --host 127.0.0.1 --port 8011`
3. Start worker B:
   `DATABASE_URL=sqlite+aiosqlite:///./.coverstory_redis_smoke_b.db COVERSTORY_REDIS_URL=redis://127.0.0.1:6381/0 uvicorn main:app --host 127.0.0.1 --port 8012`
4. Run:
   `python scripts/coverstory_redis_smoke.py http://127.0.0.1:8011 http://127.0.0.1:8012`
5. Run the timer-authority variant:
   `python scripts/coverstory_redis_smoke.py http://127.0.0.1:8011 http://127.0.0.1:8012 --redis-url redis://127.0.0.1:6381/0 --timer-expiry`
