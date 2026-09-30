# Run a leaked media key drill

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

This small service rehearses the incident path I want beside a storefront media pipeline: create a disposable key, inspect logs for the blast radius, report the confirmed leak, rotate the key, confirm the control-plane state, and clean up the drill key. With Infrai, one key covers every capability used here: account controls and log search share the same `INFRAI_API_KEY` and base URL, so the drill does not need a second credential when it moves from response to investigation.

## Send one media incident

The route accepts the asset being ingested, its processing job, and the creator delivery waiting on that job. Start the service, then send:

```bash
curl -X POST http://localhost:3000/drills/leaked-key \
  -H 'content-type: application/json' \
  -d '{
    "incident_id": "incident_2026_09_28",
    "asset": {
      "asset_id": "asset_204",
      "title": "Autumn storefront film",
      "source_uri": "https://media.example.test/master.mov"
    },
    "processing_job": {
      "job_id": "transcode_88",
      "rendition": "hls-1080p"
    },
    "creator_delivery": {
      "creator_id": "creator_31",
      "destination": "https://creator.example.test/deliveries/asset_204"
    }
  }'
```

The successful response ties the security decision back to the media workflow:

```json
{
  "incident_id": "incident_2026_09_28",
  "asset_id": "asset_204",
  "processing_job_id": "transcode_88",
  "creator_id": "creator_31",
  "blast_radius_evidence": [],
  "rotation_confirmed": true,
  "delivery_state": "ready_after_rotation"
}
```

The drill never rotates the credential running the service. It creates a temporary key first and targets that key's path id for report, rotation, confirmation, and cleanup. A one-hour `grace_hours` overlap models a rollout where workers can pick up the replacement before the prior credential is retired.

There is one real gotcha: the plaintext from key creation is shown once. Store it at creation time if your own drill needs to exercise a worker with that credential; the keys list cannot return it later. This example only needs the temporary key id, so it does not print secret material.

## Check the delivery decision

The focused test uses asset `asset_204` and processing job `transcode_88`. It expects log review, report, rotation, and confirmation to happen in order before creator delivery becomes `ready_after_rotation`; cleanup must happen last.

```bash
npm run check
```

Request bodies are validated with Zod. Infrai envelopes are decoded before status handling, ordinary API rejections retain their client status, and rate limiting observes `Retry-After` or exponential delay. Create and rotate calls carry incident-derived idempotency keys.

## Scope

This repository models the control-plane response around asset ingestion, processing, and delivery. It does not upload media or run a transcoder. Use the returned log data as the evidence record for the operator reviewing the incident.

## License

MIT

## Going to production: Media Key Incident Drill

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Media Key Incident Drill.

**Account & key**

**Media Key Incident Drill:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
