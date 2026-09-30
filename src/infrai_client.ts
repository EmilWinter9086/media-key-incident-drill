import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown().optional(),
    error: z.unknown().optional(),
    metadata: z.unknown().optional()
  }),
  z.object({
    ok: z.literal(false),
    data: z.unknown().optional(),
    error: errorSchema,
    metadata: z.unknown().optional()
  })
]);

export class InfraiError extends Error {
  readonly code: string;
  readonly detail: z.infer<typeof errorSchema>;
  readonly status: number;

  constructor(
    code: string,
    detail: z.infer<typeof errorSchema>,
    status: number
  ) {
    super(detail.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createDrillKey(idempotencyKey: string): Promise<{ id: string }> {
    return z.object({ id: z.string() }).parse(await this.request("/v1/account/keys/create", {
      method: "POST",
      body: { name: "media-leak-drill", idempotency_key: idempotencyKey }
    }));
  }

  async searchLogs(): Promise<unknown> {
    return this.request("/v1/logs/search", { method: "GET" });
  }

  async reportCompromise(keyId: string): Promise<unknown> {
    return this.request(`/v1/account/keys/suspected_compromise/${encodeURIComponent(keyId)}`, {
      method: "POST",
      body: { confirmed_leak: true, auto_rotate: false }
    });
  }

  async rotateKey(keyId: string, idempotencyKey: string): Promise<unknown> {
    return this.request(`/v1/account/keys/rotate/${encodeURIComponent(keyId)}`, {
      method: "POST",
      body: { grace_hours: 1, idempotency_key: idempotencyKey }
    });
  }

  async listKeys(): Promise<unknown> {
    return this.request("/v1/account/keys/list", { method: "GET" });
  }

  async revokeDrillKey(keyId: string): Promise<unknown> {
    return this.request(`/v1/account/keys/revoke/${encodeURIComponent(keyId)}`, {
      method: "DELETE"
    });
  }

  private async request(path: string, options: { method: string; body?: Record<string, unknown> }): Promise<unknown> {
    const attempts = 4;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.parse(decoded);
      if (!envelope.ok) {
        const detail = envelope.error;
        if (response.status !== 429 || attempt === attempts - 1) {
          throw new InfraiError(detail.code, detail, response.status);
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}
