// Group chat tools -- list_group_chats, get_group_chat

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb, DATE_EXPR, MSG_FILTER } from "../db.js";
import { lookupContact } from "../contacts.js";
import { clamp, DEFAULT_LIMIT, MAX_LIMIT } from "../helpers.js";

export function registerGroupTools(server: McpServer) {
  // -- list_group_chats --
  server.tool(
    "list_group_chats",
    "List all group chats with member counts, message volumes, and activity dates. Group chats have multiple participants.",
    {
      min_messages: z.number().optional().describe("Minimum message count to include"),
      sort_by: z.enum(["messages", "name", "recent"]).optional().describe("Sort order (default: messages)"),
      limit: z.number().optional().describe("Max results (default 50, max 500)"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async (params) => {
      const db = getDb();
      const limit = clamp(params.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
      const minMessages = params.min_messages ?? 0;

      const orderBy = params.sort_by === "name" ? "c.display_name"
        : params.sort_by === "recent" ? "last_message DESC"
        : "message_count DESC";

      const sql = `
        SELECT
          c.ROWID as chat_rowid,
          c.chat_identifier,
          c.display_name,
          c.group_id,
          COUNT(DISTINCT m.ROWID) as message_count,
          COUNT(DISTINCT h.id) as member_count,
          MIN(${DATE_EXPR}) as first_message,
          MAX(${DATE_EXPR}) as last_message
        FROM chat c
        JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
        JOIN message m ON cmj.message_id = m.ROWID
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE c.chat_identifier LIKE 'chat%'
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL) ${MSG_FILTER}
        GROUP BY c.ROWID
        HAVING message_count >= @min_messages
        ORDER BY ${orderBy}
        LIMIT @limit
      `;
      const rows = db.prepare(sql).all({ min_messages: minMessages, limit });

      return {
        content: [{
          type: "text",
          text: `${(rows as any[]).length} group chat(s)\n\n${JSON.stringify(rows, null, 2)}`,
        }],
      };
    },
  );

  // -- get_group_chat --
  server.tool(
    "get_group_chat",
    "Detailed info on a specific group chat: all members with per-member message counts, activity timeline, and recent messages.",
    {
      chat_id: z.string().optional().describe("Chat identifier (e.g. chat123456789)"),
      name: z.string().optional().describe("Group chat display name (fuzzy match)"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async (params) => {
      const db = getDb();

      if (!params.chat_id && !params.name) {
        return { content: [{ type: "text", text: "Error: provide either 'chat_id' or 'name'" }] };
      }

      // Find the chat
      let chat: any;
      if (params.chat_id) {
        chat = db.prepare("SELECT ROWID, chat_identifier, display_name, group_id FROM chat WHERE chat_identifier = ?")
          .get(params.chat_id);
      } else {
        chat = db.prepare("SELECT ROWID, chat_identifier, display_name, group_id FROM chat WHERE display_name LIKE ? AND chat_identifier LIKE 'chat%' LIMIT 1")
          .get(`%${params.name}%`);
      }

      if (!chat) {
        return { content: [{ type: "text", text: `No group chat found matching "${params.chat_id || params.name}"` }] };
      }

      // Members with stats
      const members = db.prepare(`
        SELECT
          h.id as handle,
          COUNT(*) as message_count,
          ROUND(AVG(LENGTH(m.text)), 1) as avg_length,
          MAX(${DATE_EXPR}) as last_active
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE cmj.chat_id = @chat_rowid
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL) ${MSG_FILTER}
        GROUP BY h.id
        ORDER BY message_count DESC
      `).all({ chat_rowid: chat.ROWID }) as any[];

      // Enrich with contact names
      const enrichedMembers = members.map((m: any) => {
        const contact = m.handle ? lookupContact(m.handle) : { name: "(me)", tier: "known" };
        return {
          handle: m.handle || "(me)",
          name: contact.name,
          tier: contact.tier,
          message_count: m.message_count,
          avg_length: m.avg_length,
          last_active: m.last_active,
        };
      });

      // Monthly activity
      const monthly = db.prepare(`
        SELECT
          strftime('%Y-%m', ${DATE_EXPR}) as month,
          COUNT(*) as messages
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        WHERE cmj.chat_id = @chat_rowid
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL) ${MSG_FILTER}
        GROUP BY month
        ORDER BY month
      `).all({ chat_rowid: chat.ROWID });

      // Overall stats
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_messages,
          MIN(${DATE_EXPR}) as first_message,
          MAX(${DATE_EXPR}) as last_message
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        WHERE cmj.chat_id = @chat_rowid
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL) ${MSG_FILTER}
      `).get({ chat_rowid: chat.ROWID });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            chat_identifier: chat.chat_identifier,
            display_name: chat.display_name,
            stats,
            members: enrichedMembers,
            monthly_activity: monthly,
          }, null, 2),
        }],
      };
    },
  );
}
