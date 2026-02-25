#!/usr/bin/env node
// CLI entry point — routes subcommands and transport flags to their handlers

import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    transport: { type: "string", short: "t", default: "stdio" },
    port: { type: "string", short: "p", default: "3000" },
    host: { type: "string", short: "H", default: "127.0.0.1" },
  },
  allowPositionals: true,
  strict: false,
});

const cmd = positionals[0];

if (cmd === "doctor") {
  await import("./commands/doctor.js");
} else if (cmd === "dump") {
  await import("./commands/dump.js");
} else {
  const transport = values.transport as string;

  if (transport !== "stdio" && transport !== "http" && transport !== "sse") {
    process.stderr.write(`Unknown transport "${transport}". Valid options: stdio, http, sse\n`);
    process.exit(1);
  }

  if (transport === "http" || transport === "sse") {
    const port = parseInt(values.port as string, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port "${values.port}". Must be a number between 1 and 65535.\n`);
      process.exit(1);
    }

    const host = values.host as string;
    if (transport === "http") {
      const { startStreamableHttp } = await import("./transport.js");
      await startStreamableHttp(port, host);
    } else {
      const { startSse } = await import("./transport.js");
      await startSse(port, host);
    }
  } else {
    const { startStdio } = await import("./index.js");
    await startStdio();
  }
}
