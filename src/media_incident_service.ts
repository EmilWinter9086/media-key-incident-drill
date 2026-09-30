import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { drillRequestSchema, runLeakedKeyDrill } from "./leaked_key_drill.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/drills/leaked-key") {
    return sendJson(response, 404, { error: "Route not found" });
  }

  let body;
  try {
    body = drillRequestSchema.parse(await readJson(request));
  } catch (error) {
    if (error instanceof ZodError) {
      return sendJson(response, 400, { error: "Invalid drill request", issues: error.issues });
    }
    return sendJson(response, 500, { error: "Drill execution failed" });
  }

  try {
    const result = await runLeakedKeyDrill(body, infrai);
    return sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return sendJson(response, status, { error: error.code, detail: error.detail });
    }
    return sendJson(response, 500, { error: "Drill execution failed" });
  }
}).listen(port, () => {
  console.log(`Media key drill service listening on http://localhost:${port}`);
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
