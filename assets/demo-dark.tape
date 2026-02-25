Output assets/demo-dark.gif
Set Shell zsh
Set FontSize 13
Set FontFamily "JetBrains Mono"
Set Width 860
Set Height 520
Set Padding 20
Set WindowBar Colorful
Set BorderRadius 10
Set Margin 20
Set MarginFill "#1e1e2e"
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

# Clear all IDE/VSCode env vars so no selection context leaks in
Env CLAUDECODE ""
Env CLAUDE_CODE_ENTRYPOINT ""
Env CLAUDE_AGENT_SDK_VERSION ""
Env CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING ""
Env CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS ""
Env VSCODE_IPC_HOOK ""
Env VSCODE_PID ""
Env VSCODE_CWD ""
Env CURSOR_SPAWNED_BY_EXTENSION_ID ""
Env CURSOR_SPAWN_CHAIN ""
Env CURSOR_EXTENSION_HOST_ROLE ""
Env CURSOR_TRACE_ID ""

# Change to project directory so .mcp.json loads imessage-mcp
Type "cd ~/Code/imessage-mcp"
Enter
Sleep 300ms

# Launch Claude with imessage MCP available
Type "claude --dangerously-skip-permissions"
Sleep 200ms
Enter
Sleep 7s

# Q1: Message stats — no contact names, shows impressive scale
Type "how many iMessages do I have total? sent vs received, and what year did I start"
Sleep 200ms
Enter
Sleep 35s

# Q2: Search sent messages only — "You" as sender, no contact names
Type "find 3 messages I sent mentioning 'dinner' — just date and message text"
Sleep 200ms
Enter
Sleep 35s

# Q3: Analytics — temporal heatmap, no contact names
Type "am I a night owl or morning texter? one sentence"
Sleep 200ms
Enter
Sleep 35s

Sleep 2s
