import { DashboardPanel } from '../src/dashboard';
import { defaultQuotaState } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const stub = require('./vscode-stub.js');

const state = {
  ...defaultQuotaState(),
  weeklyLimit: 1_000_000,
  weeklyUsed: 623_450,
  weeklyResetHours: 37.5,
  windowLimit: 100_000,
  windowUsed: 42_310,
  windowRemaining: 57_690,
  windowResetAt: Date.now() + 2.7 * 3_600_000,
  parallelLimit: 5,
  lastUpdated: Date.now()
};

function hourlyBuckets(n: number) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3_600_000);
    out.push({
      key: d.toISOString(),
      label: `${String(d.getHours()).padStart(2, '0')}:00`,
      weekly: Math.round(40_000 * Math.abs(Math.sin(i / 3)) + 2_000),
      window: Math.round(8_000 * Math.abs(Math.sin(i / 2)) + 500),
      samples: Math.round(5 * Math.abs(Math.sin(i)) + 1)
    });
  }
  return out;
}

function dailyBuckets(n: number) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    out.push({
      key: d.toISOString(),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekly: Math.round(120_000 * Math.abs(Math.cos(i / 2)) + 10_000),
      window: Math.round(30_000 * Math.abs(Math.cos(i)) + 1_000),
      samples: Math.round(12 * Math.abs(Math.cos(i / 3)) + 1)
    });
  }
  return out;
}

function recentDeltas(n: number) {
  const out: Array<{ timestamp: number; weeklyDelta: number; windowDelta: number }> = [];
  let ts = Date.now() - 12 * 3_600_000;
  for (let i = 0; i < n; i++) {
    ts += Math.round((10 + 20 * Math.abs(Math.sin(i * 1.7))) * 60_000);
    out.push({
      timestamp: Math.min(ts, Date.now()),
      weeklyDelta: Math.round(6_000 * Math.abs(Math.sin(i / 2)) + 800),
      windowDelta: Math.round(2_000 * Math.abs(Math.cos(i)) + 200)
    });
  }
  return out;
}

const tracker = {
  getHourlyBuckets: hourlyBuckets,
  getDailyBuckets: dailyBuckets,
  getDeltas: () => recentDeltas(22)
};

DashboardPanel.show(state, {} as never, tracker as never, {} as never);

// Inject dark-theme variable defaults so the page renders like a VS Code dark webview.
// The acquireVsCodeApi stub persists webview state in localStorage so state-restore
// behavior (chart selection, scroll position, no-anim re-renders) can be exercised
// in a plain browser by reloading the page.
const apiStub = `<script>window.acquireVsCodeApi = function () {
  var KEY = 'kimi.preview.state';
  return {
    postMessage: function () {},
    getState: function () { try { return JSON.parse(localStorage.getItem(KEY)) || undefined; } catch (e) { return undefined; } },
    setState: function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  };
};</script>`;

const darkVars = `<style>:root{
  --vscode-foreground:#cccccc; --vscode-editor-background:#1f1f1f;
  --vscode-font-family:'Segoe UI',sans-serif; --vscode-font-size:13px;
  --vscode-editor-font-family:Consolas,monospace;
  --vscode-descriptionForeground:#989898;
  --vscode-input-background:#313131; --vscode-input-border:#3c3c3c;
  --vscode-button-background:#0e639c; --vscode-button-foreground:#ffffff;
  --vscode-button-hoverBackground:#1177bb; --vscode-button-secondaryHoverBackground:#3c3c3c;
  --vscode-panel-border:#2b2b2b; --vscode-sideBar-background:#252526;
  --vscode-editorWidget-background:#252526; --vscode-list-hoverBackground:#2a2d2e;
  --vscode-symbolIcon-functionForeground:#dcdcaa; --vscode-focusBorder:#007fd4;
  --vscode-charts-green:#89d185; --vscode-charts-blue:#3794ff; --vscode-charts-purple:#b180d7;
  --vscode-charts-yellow:#e5c07b; --vscode-charts-orange:#d18616; --vscode-charts-red:#f14c4c;
}</style></head>`;

const lightVars = `<style>:root{
  --vscode-foreground:#1f1f1f; --vscode-editor-background:#ffffff;
  --vscode-font-family:'Segoe UI',sans-serif; --vscode-font-size:13px;
  --vscode-editor-font-family:Consolas,monospace;
  --vscode-descriptionForeground:#6e6e6e;
  --vscode-input-background:#f3f3f3; --vscode-input-border:#cecece;
  --vscode-button-background:#0078d4; --vscode-button-foreground:#ffffff;
  --vscode-button-hoverBackground:#026ec1; --vscode-button-secondaryHoverBackground:#e5e5e5;
  --vscode-panel-border:#e0e0e0; --vscode-sideBar-background:#f3f3f3;
  --vscode-editorWidget-background:#f3f3f3; --vscode-list-hoverBackground:#e8e8e8;
  --vscode-symbolIcon-functionForeground:#795e26; --vscode-focusBorder:#0078d4;
  --vscode-charts-green:#388a34; --vscode-charts-blue:#0078d4; --vscode-charts-purple:#7b4fa6;
  --vscode-charts-yellow:#bf8803; --vscode-charts-orange:#d18616; --vscode-charts-red:#e51400;
}</style></head>`;

const raw = stub.__getCapturedHtml() as string;
// Inject the theme-kind class that VS Code adds to webview bodies, so the
// dashboard's own design tokens pick the right palette (dark / light).
const withBodyClass = (html: string, cls: string) => html.replace('<body>', `<body class="${cls}">`);
fs.writeFileSync(path.join(__dirname, 'preview.html'), withBodyClass(raw.replace('</head>', apiStub + darkVars), 'vscode-dark'));
fs.writeFileSync(path.join(__dirname, 'preview-light.html'), withBodyClass(raw.replace('</head>', apiStub + lightVars), 'vscode-light'));
console.log('preview.html + preview-light.html written,', raw.length, 'bytes');
