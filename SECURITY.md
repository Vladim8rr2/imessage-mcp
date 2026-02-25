# Security

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it through [GitHub's private vulnerability reporting](https://github.com/anipotts/imessage-mcp/security/advisories/new).

Do not open a public issue for security vulnerabilities.

## Design

- **Read-only access**: The database is opened with `readonly: true` and `query_only = ON`. No writes are possible.
- **Local only**: All queries run against your local `~/Library/Messages/chat.db`. No data is sent to external servers.
- **No network calls**: imessage-mcp makes zero network requests. Contact resolution uses your local macOS AddressBook.
- **Parameterized queries**: All SQL queries use better-sqlite3's built-in parameter binding. No string interpolation of user input.
