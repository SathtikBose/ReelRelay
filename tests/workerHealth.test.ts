import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("Cloudflare Worker - Health Check", () => {
  it("GET /health returns 200 with JSON status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      version: string;
      service: string;
      runtime: string;
      timestamp: string;
    };

    expect(body.status).toBe("ok");
    expect(body.version).toBe("2.0.0");
    expect(body.runtime).toBe("Cloudflare Workers");
    expect(body.timestamp).toBeDefined();
  });
});
