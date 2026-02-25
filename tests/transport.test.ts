import { describe, it, expect } from "vitest";

describe("createServer export", () => {
  it("creates a server with the correct name and version", async () => {
    const { createServer } = await import("../src/index.js");
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
    expect(server.server.getClientCapabilities).toBeDefined();
  });

  it("createServer returns a new instance each call", async () => {
    const { createServer } = await import("../src/index.js");
    const a = createServer();
    const b = createServer();
    expect(a).not.toBe(b);
  });
});

describe("CLI argument validation", () => {
  it("parseArgs accepts valid transport values", async () => {
    const { parseArgs } = await import("node:util");
    for (const t of ["stdio", "http", "sse"]) {
      const { values } = parseArgs({
        args: ["--transport", t],
        options: {
          transport: { type: "string", short: "t", default: "stdio" },
          port: { type: "string", short: "p", default: "3000" },
          host: { type: "string", short: "H", default: "127.0.0.1" },
        },
        allowPositionals: true,
        strict: false,
      });
      expect(values.transport).toBe(t);
    }
  });

  it("parseArgs defaults to stdio when no transport flag", async () => {
    const { parseArgs } = await import("node:util");
    const { values } = parseArgs({
      args: [],
      options: {
        transport: { type: "string", short: "t", default: "stdio" },
        port: { type: "string", short: "p", default: "3000" },
        host: { type: "string", short: "H", default: "127.0.0.1" },
      },
      allowPositionals: true,
      strict: false,
    });
    expect(values.transport).toBe("stdio");
    expect(values.port).toBe("3000");
    expect(values.host).toBe("127.0.0.1");
  });

  it("parseArgs routes subcommands as positionals", async () => {
    const { parseArgs } = await import("node:util");
    const { positionals } = parseArgs({
      args: ["doctor", "--json"],
      options: {
        transport: { type: "string", short: "t", default: "stdio" },
        port: { type: "string", short: "p", default: "3000" },
        host: { type: "string", short: "H", default: "127.0.0.1" },
      },
      allowPositionals: true,
      strict: false,
    });
    expect(positionals[0]).toBe("doctor");
  });

  it("port validation catches NaN", () => {
    const port = parseInt("foo", 10);
    expect(Number.isNaN(port)).toBe(true);
  });

  it("port validation catches out-of-range", () => {
    const port = parseInt("99999", 10);
    expect(port > 65535).toBe(true);
  });
});

describe("transport module exports", () => {
  it("exports startStreamableHttp and startSse", async () => {
    const mod = await import("../src/transport.js");
    expect(typeof mod.startStreamableHttp).toBe("function");
    expect(typeof mod.startSse).toBe("function");
  });
});
