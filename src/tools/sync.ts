// Sync tools -- check_new_messages for delta tracking

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb, DATE_EXPR, getMessageText, safeText, baseMessageConditions } from "../db.js";
import { lookupContact, resolveByName } from "../contacts.js";
import { clamp, MAX_LIMIT } from "../helpers.js";

let lastSeenRowId: number | null = null;

export function registerSyncTools(server: McpServer) {
  server.tool(
    "check_new_messages",
    "Check for new messages since your last check. First call sets a baseline. Subsequent calls report what arrived since.",
    {
      reset: z.boolean().optional().describe("Reset baseline to current latest message"),
      include_text: z.boolean().optional().describe("Include message text previews (default false)"),
      limit: z.number().optional().describe("Max messages to return in detail (default 50)"),
      contact: z.string().optional().describe("Filter to a specific contact"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async (params) => {
      const db = getDb();
      const limit = clamp(params.limit ?? 50, 1, MAX_LIMIT);

      // Get current max ROWID
      const currentMax: number =
        (db.prepare("SELECT MAX(ROWID) as max_rowid FROM message").get() as any)
          ?.max_rowid ?? 0;

      // First call or explicit reset: set baseline
      if (params.reset || lastSeenRowId === null) {
        lastSeenRowId = currentMax;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "baseline_set", baseline_rowid: currentMax }, null, 2),
            },
          ],
        };
      }

      // Delta query: messages since lastSeenRowId
      const conditions = baseMessageConditions();
      const bindings: Record<string, any> = { lastSeen: lastSeenRowId };

      conditions.push("m.ROWID > @lastSeen");

      if (params.contact) {
        const isHandle = /^[+\d]|@/.test(params.contact.trim());
        if (isHandle) {
          conditions.push("h.id LIKE @contact");
          bindings.contact = `%${params.contact}%`;
        } else {
          const nameKeys = resolveByName(params.contact);
          if (nameKeys.length > 0) {
            const orClauses = nameKeys.map((_, i) => `h.id LIKE @nk${i}`);
            conditions.push(`(${orClauses.join(" OR ")})`);
            nameKeys.forEach((key, i) => {
              bindings[`nk${i}`] = `%${key}%`;
            });
          } else {
            conditions.push("h.id LIKE @contact");
            bindings.contact = `%${params.contact}%`;
          }
        }
      }

      const where = conditions.join(" AND ");
      const fromJoins = `
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        JOIN chat c ON cmj.chat_id = c.ROWID
        LEFT JOIN handle h ON m.handle_id = h.ROWID`;

      // Total count
      const totalRow = db
        .prepare(`SELECT COUNT(*) as cnt ${fromJoins} WHERE ${where}`)
        .get(bindings) as any;
      const totalCount: number = totalRow?.cnt ?? 0;

      // Per-sender summary (top 10)
      const senderRows = db
        .prepare(
          `SELECT h.id as handle, COUNT(*) as count
           ${fromJoins}
           WHERE ${where}
           GROUP BY h.id
           ORDER BY count DESC
           LIMIT 10`,
        )
        .all(bindings) as any[];

      const senders = senderRows.map((r: any) => ({
        handle: r.handle,
        name: r.handle ? lookupContact(r.handle).name : "(unknown)",
        count: r.count,
      }));

      // Optional: detailed messages
      let messages: any[] | undefined;
      if (params.include_text) {
        const detailRows = db
          .prepare(
            `SELECT
              m.ROWID as rowid,
              m.text,
              m.attributedBody,
              m.is_from_me,
              ${DATE_EXPR} as date,
              h.id as handle,
              c.display_name as group_name
            ${fromJoins}
            WHERE ${where}
            ORDER BY m.date ASC
            LIMIT @limit`,
          )
          .all({ ...bindings, limit }) as any[];

        messages = detailRows.map((row: any) => {
          const text = safeText(getMessageText(row));
          return {
            rowid: row.rowid,
            text,
            is_from_me: row.is_from_me,
            date: row.date,
            handle: row.handle,
            contact_name: row.handle ? lookupContact(row.handle).name : undefined,
            group_name: row.group_name,
          };
        });
      }

      // Advance watermark (only when unfiltered — filtered calls shouldn't
      // skip messages from other contacts)
      const previousRowId = lastSeenRowId;
      if (!params.contact) {
        lastSeenRowId = currentMax;
      }

      const result = {
        status: "delta",
        new_message_count: totalCount,
        since_rowid: previousRowId,
        current_rowid: currentMax,
        senders,
        ...(messages ? { messages } : {}),
        cursor: { after_rowid: previousRowId },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
