// Minimal vscode API stub for offline dashboard rendering.
let capturedHtml = '';

const fakePanel = {
  webview: {
    onDidReceiveMessage() {},
    set html(v) { capturedHtml = v; },
    get html() { return capturedHtml; }
  },
  reveal() {},
  onDidDispose() {},
  dispose() {}
};

module.exports = {
  window: {
    createWebviewPanel: () => fakePanel,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} })
  },
  workspace: {
    getConfiguration: () => ({ get: (_k, d) => d })
  },
  env: { language: 'zh-CN' },
  ViewColumn: { Active: 1 },
  __getCapturedHtml: () => capturedHtml
};
