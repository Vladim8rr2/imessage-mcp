// Watcher -- FSEvents / polling for new message notifications
//
// Optional background process that monitors chat.db-wal for changes
// and pushes sendLoggingMessage notifications. Only runs when
// IMESSAGE_SYNC=watch or IMESSAGE_SYNC=poll:N.

import { watch, existsSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb, baseMessageConditions } from "./db.js";
import { lookupContact } from "./contacts.js";

export type SyncMode = "off" | "watch" | { poll: number };

const MIN_POLL_SECONDS = 5;
const DEBOUNCE_MS = 1000;
const RETRY_MS = 5000;

let fsWatcher: FSWatcher | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastNotifiedRowId: number = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Parse IMESSAGE_SYNC env var into a SyncMode */
export function parseSyncMode(env: string | undefined): SyncMode {
  if (!env || env === "off") return "off";
  if (env === "watch") return "watch";

  const pollMatch = env.match(/^poll:(\d+)$/);
  if (pollMatch) {
    const seconds = Math.max(parseInt(pollMatch[1], 10), MIN_POLL_SECONDS);
    return { poll: seconds };
  }

  process.stderr.write(
    `[watcher] Unknown IMESSAGE_SYNC value "${env}", defaulting to off\n`,
  );
  return "off";
}

function getWalPath(): string {
  const dbPath = process.env.IMESSAGE_DB || path.join(homedir(), "Library/Messages/chat.db");
  return dbPath + "-wal";
}

function getCurrentMaxRowId(): number {
  try {
    const db = getDb();
    const row = db.prepare("SELECT MAX(ROWID) as max_rowid FROM message").get() as any;
    return row?.max_rowid ?? 0;
  } catch (err) {
    process.stderr.write(`[watcher] Failed to query max ROWID: ${err}\n`);
    return lastNotifiedRowId; // preserve state on error
  }
}

async function checkAndNotify(server: McpServer): Promise<void> {
  const currentMax = getCurrentMaxRowId();

  if (currentMax <= lastNotifiedRowId) return;

  try {
    const db = getDb();
    const conditions = baseMessageConditions();
    conditions.push("m.ROWID > @lastSeen");
    const where = conditions.join(" AND ");

    const fromJoins = `
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat c ON cmj.chat_id = c.ROWID
      LEFT JOIN handle h ON m.handle_id = h.ROWID`;

    const senderRows = db
      .prepare(
        `SELECT h.id as handle, COUNT(*) as count
         ${fromJoins}
         WHERE ${where}
         GROUP BY h.id
         ORDER BY count DESC`,
      )
      .all({ lastSeen: lastNotifiedRowId }) as any[];

    const totalCount = senderRows.reduce((sum: number, r: any) => sum + r.count, 0);
    const senders = senderRows.slice(0, 5).map((r: any) => {
      const contact = r.handle ? lookupContact(r.handle) : null;
      return contact?.name ?? r.handle ?? "(unknown)";
    });

    const hint = `Use check_new_messages for details, or get_conversation with after_rowid: ${lastNotifiedRowId}`;

    await server.sendLoggingMessage({
      level: "info",
      data: {
        type: "new_messages",
        count: totalCount,
        senders,
        hint,
      },
    });

    // Only advance watermark after successful notification
    lastNotifiedRowId = currentMax;

    process.stderr.write(
      `[watcher] ${totalCount} new message(s) from ${senders.join(", ")}\n`,
    );
  } catch (err) {
    process.stderr.write(`[watcher] Notification error: ${err}\n`);
  }
}

function tryWatch(server: McpServer): void {
  const walPath = getWalPath();

  if (!existsSync(walPath)) {
    process.stderr.write(
      `[watcher] WAL file not found at ${walPath}, retrying in ${RETRY_MS / 1000}s\n`,
    );
    setTimeout(() => tryWatch(server), RETRY_MS);
    return;
  }

  try {
    fsWatcher = watch(walPath, () => {
      // Debounce: Messages.app writes multiple rows per message
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkAndNotify(server), DEBOUNCE_MS);
    });

    fsWatcher.on("error", (err) => {
      process.stderr.write(
        `[watcher] FSWatcher error: ${err.message}, restarting in ${RETRY_MS / 1000}s\n`,
      );
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
      setTimeout(() => tryWatch(server), RETRY_MS);
    });

    process.stderr.write(`[watcher] Watching ${walPath} via FSEvents\n`);
  } catch (err) {
    process.stderr.write(
      `[watcher] fs.watch failed: ${err}, falling back to poll:30\n`,
    );
    startPolling(server, 30);
  }
}

function startPolling(server: McpServer, seconds: number): void {
  process.stderr.write(`[watcher] Polling every ${seconds}s\n`);
  pollTimer = setInterval(() => checkAndNotify(server), seconds * 1000);
}

/** Start the watcher. Call after server.connect(). */
export function startWatcher(server: McpServer, mode: SyncMode): void {
  if (mode === "off") return;

  // Initialize watermark
  lastNotifiedRowId = getCurrentMaxRowId();
  process.stderr.write(
    `[watcher] Baseline ROWID: ${lastNotifiedRowId}, mode: ${typeof mode === "string" ? mode : `poll:${mode.poll}`}\n`,
  );

  if (mode === "watch") {
    tryWatch(server);
  } else {
    startPolling(server, mode.poll);
  }
}

/** Stop the watcher and clean up all timers. */
export function stopWatcher(): void {
  if (fsWatcher) {
    fsWatcher.close();
    fsWatcher = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
