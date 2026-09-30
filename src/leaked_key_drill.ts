import { z } from "zod";

export const drillRequestSchema = z.object({
  asset: z.object({
    asset_id: z.string().min(1),
    title: z.string().min(1),
    source_uri: z.string().url()
  }),
  processing_job: z.object({
    job_id: z.string().min(1),
    rendition: z.enum(["hls-1080p", "hls-720p", "audio-only"])
  }),
  creator_delivery: z.object({
    creator_id: z.string().min(1),
    destination: z.string().url()
  }),
  incident_id: z.string().min(1)
});

export type DrillRequest = z.infer<typeof drillRequestSchema>;

export interface DrillControlPlane {
  createDrillKey(idempotencyKey: string): Promise<{ id: string }>;
  searchLogs(): Promise<unknown>;
  reportCompromise(keyId: string): Promise<unknown>;
  rotateKey(keyId: string, idempotencyKey: string): Promise<unknown>;
  listKeys(): Promise<unknown>;
  revokeDrillKey(keyId: string): Promise<unknown>;
}

export interface DrillResult {
  incident_id: string;
  asset_id: string;
  processing_job_id: string;
  creator_id: string;
  blast_radius_evidence: unknown;
  rotation_confirmed: boolean;
  delivery_state: "ready_after_rotation";
}

const keyListSchema = z.object({
  items: z.array(z.object({
    key_id: z.string(),
    status: z.string()
  }).passthrough())
}).passthrough();

export async function runLeakedKeyDrill(
  input: DrillRequest,
  controlPlane: DrillControlPlane
): Promise<DrillResult> {
  const drillKey = await controlPlane.createDrillKey(`${input.incident_id}:create`);
  try {
    const blastRadiusEvidence = await controlPlane.searchLogs();
    await controlPlane.reportCompromise(drillKey.id);
    await controlPlane.rotateKey(drillKey.id, `${input.incident_id}:rotate`);
    const listedKeys = keyListSchema.parse(await controlPlane.listKeys());
    const rotationConfirmed = listedKeys.items.some(
      (key) => key.key_id === drillKey.id && key.status === "active"
    );
    if (!rotationConfirmed) {
      throw new Error(`Rotation was not confirmed for drill key ${drillKey.id}`);
    }

    return {
      incident_id: input.incident_id,
      asset_id: input.asset.asset_id,
      processing_job_id: input.processing_job.job_id,
      creator_id: input.creator_delivery.creator_id,
      blast_radius_evidence: blastRadiusEvidence,
      rotation_confirmed: rotationConfirmed,
      delivery_state: "ready_after_rotation"
    };
  } finally {
    await controlPlane.revokeDrillKey(drillKey.id);
  }
}
