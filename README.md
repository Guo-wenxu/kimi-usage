# Kimi Usage

A VSCode (and Trae IDE) extension that shows your **Kimi Code** weekly / session / rate-window quota in the status bar — using the same **OAuth device-code** sign-in flow as the official `kimi-cli`. Tokens are stored in the OS keychain and auto-refreshed for you. An optional API-key fallback is also available.

Inspired by:
- [`yur1y/kimi-quota-tracker`](https://github.com/yur1y/kimi-quota-tracker) — the quota math and status-bar layout
- [`MoonshotAI/kimi-cli`](https://github.com/MoonshotAI/kimi-cli) — the OAuth device-flow protocol

## Features

- 🟢 **Status bar at a glance** — `🟢 Kimi 37% | $(pulse) 12%` with pace-aware traffic-light colour (weekly % | rate-window %)
- 📊 **Detailed dashboard** — weekly quota, rate-limit window, usage-trend charts and a live activity feed in a Webview (UI state persists across auto-refreshes)
- 🔐 **OAuth device sign-in** — one-click `Sign In`, confirm in the browser, never paste a token. Refresh tokens are stored in the OS keychain and rotated automatically before they expire.
- 🔑 **Optional API key fallback** — paste an `sk-...` key from the [Kimi Code console](https://www.kimi.com/code/console) if you prefer (kept in SecretStorage, never written to settings).
- 🔁 **Auto-refresh** with a configurable interval

## Status bar reference

| Status bar | Meaning |
|---|---|
| 🟢 `Kimi 37% \| $(pulse) 12%` | 37 % of weekly quota used, **under** pace; rate window at 12 % |
| 🟡 `Kimi 55% \| $(pulse) 40%` | Slightly **ahead** of pace (used % above elapsed % of the week) |
| 🔴 `Kimi 80% \| $(pulse) 90%` | Over-consuming vs elapsed time (ahead by more than 5 pp) |
| ⚠️ `Kimi: auth failed` | Token rejected (401/403) — click to sign in again |
| 🔑 `Kimi: sign in` | Not configured yet — click to start the OAuth flow |

## Install & run (development)

```bash
# 1. Install dependencies
npm install

# 2. Compile / bundle
npm run compile        # tsc one-shot
# or
npm run watch          # tsc watch
# or
npm run build          # esbuild bundle (dev)
npm run package        # esbuild bundle (production, used by vsce)

# 3. Press F5 in VSCode to launch the Extension Development Host
#    Or package a VSIX:
npm install -g @vscode/vsce
vsce package           # creates kimi-usage-0.3.0.vsix
code --install-extension kimi-usage-0.3.0.vsix
```

## Sign in (OAuth device flow)

1. Run **`Kimi Usage: Sign In`** from the command palette (or click the status-bar item when it shows `Kimi: sign in`).
2. The extension requests a device code from Kimi and shows a notification:
   `visit https://auth.kimi.com/device and confirm code "ABCD-EFGH"` — the code is **already in your clipboard**.
3. Click **Open Browser**, paste the code (already in clipboard), and approve the request on Kimi's site.
4. The extension polls for completion. Once you confirm, you'll see `Kimi sign-in successful` and the status bar starts updating.

The `access_token` and `refresh_token` are persisted in VSCode's [`SecretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) (which uses the OS keychain on macOS / libsecret on Linux / Credential Manager on Windows). Tokens are auto-refreshed before each quota poll.

## Optional: long-lived API key

If you'd rather use a long-lived `sk-...` key (each Kimi Code account is limited to **5 active keys** and a leak is high-risk — prefer OAuth):

1. Create a key at <https://www.kimi.com/code/console>.
2. Run **`Kimi Usage: Set API Key (sk-...)`** and paste it.

The key is stored in SecretStorage too — never written to `settings.json`. OAuth, when present, takes precedence.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `kimiUsage.refreshIntervalSeconds` | `60` | Polling interval in seconds (minimum `30`) |
| `kimiUsage.language` | `zh-CN` | Dashboard language: `auto` / `en` / `zh-CN` (`auto` follows the VS Code display language) |

> Credentials are intentionally **not** exposed as settings; they live in SecretStorage and are managed via the `Sign In` / `Sign Out` / `Set API Key` commands.

## Commands

| Command | What it does |
|---|---|
| `Kimi Usage: Refresh` | Force a quota refresh now |
| `Kimi Usage: Sign In (OAuth)` | Start the device-code sign-in flow |
| `Kimi Usage: Sign Out` | Clear stored OAuth tokens and API key |
| `Kimi Usage: Set API Key (sk-...)` | Paste a long-lived API key as a fallback |
| `Kimi Usage: Show Usage Dashboard` | Open the detailed Webview |
| `Kimi Usage: Clear Auto-tracked History` | Clear locally stored usage deltas |
| `Kimi Usage: Open Kimi Code Console` | Open <https://www.kimi.com/code/console> |
| `Kimi Usage: Show Output` | Open the extension's output channel |

## Privacy & API notes

- Quota requests use `User-Agent: KimiCLI/1.6` because the Kimi coding API rejects non-agent clients with `access_terminated_error`.
- OAuth device-flow requests send a device id plus hostname / platform headers to `auth.kimi.com`, matching the official CLI client shape.
- No third-party telemetry is collected; credentials never leave SecretStorage except as `Authorization` headers to Kimi hosts.

## License

MIT
