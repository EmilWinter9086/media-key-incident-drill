import assert from "node:assert/strict";
import test from "node:test";
import { runLeakedKeyDrill, type DrillControlPlane } from "../src/leaked_key_drill.js";

test("holds creator delivery until the reported drill key is rotated and confirmed", async () => {
  const calls: string[] = [];
  const controlPlane: DrillControlPlane = {
    async createDrillKey() { calls.push("create"); return { id: "key_drill_17" }; },
    async searchLogs() { calls.push("search"); return [{ asset_id: "asset_204" }]; },
    async reportCompromise() { calls.push("report"); },
    async rotateKey() { calls.push("rotate"); },
    async listKeys() {
      calls.push("confirm");
      return { items: [{ key_id: "key_drill_17", status: "active" }] };
    },
    async revokeDrillKey() { calls.push("revoke"); }
  };

  const result = await runLeakedKeyDrill({
    incident_id: "incident_2026_09_28",
    asset: { asset_id: "asset_204", title: "Autumn storefront film", source_uri: "https://media.example.test/master.mov" },
    processing_job: { job_id: "transcode_88", rendition: "hls-1080p" },
    creator_delivery: { creator_id: "creator_31", destination: "https://creator.example.test/deliveries/asset_204" }
  }, controlPlane);

  assert.deepEqual(calls, ["create", "search", "report", "rotate", "confirm", "revoke"]);
  assert.equal(result.delivery_state, "ready_after_rotation");
  assert.equal(result.rotation_confirmed, true);
  assert.deepEqual(result.blast_radius_evidence, [{ asset_id: "asset_204" }]);
});

test("does not confirm rotation when the drill key is not active in the key list", async () => {
  let revoked = false;
  const controlPlane: DrillControlPlane = {
    async createDrillKey() { return { id: "key_drill_18" }; },
    async searchLogs() { return []; },
    async reportCompromise() {},
    async rotateKey() {},
    async listKeys() { return { items: [{ key_id: "key_drill_18", status: "revoked" }] }; },
    async revokeDrillKey() { revoked = true; }
  };

  await assert.rejects(runLeakedKeyDrill({
    incident_id: "incident_2026_09_29",
    asset: { asset_id: "asset_205", title: "Winter film", source_uri: "https://media.example.test/winter.mov" },
    processing_job: { job_id: "transcode_89", rendition: "hls-720p" },
    creator_delivery: { creator_id: "creator_32", destination: "https://creator.example.test/deliveries/asset_205" }
  }, controlPlane), /Rotation was not confirmed/);

  assert.equal(revoked, true);
});
