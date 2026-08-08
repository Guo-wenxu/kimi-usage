import * as vscode from 'vscode';
import { Locale, makeT, resolveLocale } from './i18n';
import { QuotaState } from './types';
import { UsageTracker } from './usageTracker';
import { fmtHours, fmtTokens, getConfig, hoursUntil, paceLevel, weeklyElapsedPct } from './utils';

export interface DashboardCallbacks {
  refresh(): void | Promise<void>;
  clearHistory(): void | Promise<void>;
  openConsole(): void;
  signOut(): void | Promise<void>;
  openSettings(): void;
  toggleLanguage?(): void | Promise<void>;
}

type T = (key: string, ...params: Array<string | number>) => string;

type TabId = 'today' | 'week';

type Bucket = { key: string; label: string; weekly: number; window: number; samples: number };

export class DashboardPanel {
  private static current: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private tracker: UsageTracker | undefined;
  private callbacks: DashboardCallbacks | undefined;
  private currentTab: TabId = 'today';
  private version: string = 'dev';

  static show(
    state: QuotaState,
    context: vscode.ExtensionContext,
    tracker?: UsageTracker,
    callbacks?: DashboardCallbacks
  ): void {
    if (DashboardPanel.current) {
      if (callbacks) DashboardPanel.current.callbacks = callbacks;
      DashboardPanel.current.panel.reveal();
      DashboardPanel.current.update(state);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'kimiUsageDashboard',
      'Kimi Usage Dashboard',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DashboardPanel.current = new DashboardPanel(panel, state, context, tracker, callbacks);
  }

  static refreshIfOpen(state: QuotaState): void {
    DashboardPanel.current?.update(state);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    state: QuotaState,
    _context: vscode.ExtensionContext,
    tracker?: UsageTracker,
    callbacks?: DashboardCallbacks
  ) {
    this.panel = panel;
    this.tracker = tracker;
    this.callbacks = callbacks;
    this.version = _context?.extension?.packageJSON?.version ?? 'dev';

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg?.command) {
        case 'refresh': await this.callbacks?.refresh(); break;
        case 'clearHistory': await this.callbacks?.clearHistory(); break;
        case 'openConsole': this.callbacks?.openConsole(); break;
        case 'signOut': await this.callbacks?.signOut(); break;
        case 'openSettings': this.callbacks?.openSettings(); break;
        case 'toggleLanguage': await this.callbacks?.toggleLanguage?.(); break;
        case 'tabChanged':
          if (msg.tab === 'today' || msg.tab === 'week') {
            this.currentTab = msg.tab;
          }
          break;
      }
    }, null, this.disposables);

    this.update(state);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  update(state: QuotaState): void {
    this.panel.webview.html = this.renderHtml(state);
  }

  private dispose(): void {
    // Called from onDidDispose — panel is already closing; only clear bookkeeping.
    DashboardPanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  private fmtNum(n: number | null | undefined, dash: string = '—'): string {
    if (n === null || n === undefined) return dash;
    return n.toLocaleString();
  }

  private pct(used: number | null, limit: number | null): number {
    if (!limit || limit <= 0 || used === null) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  /**
   * SVG progress ring in three layers: a blurred bloom copy for a soft halo,
   * the crisp gradient arc on top, and a glowing head dot at the arc end.
   * The fill/bloom start at full offset and are animated to the target by the webview script.
   */
  private renderRing(
    pct: number,
    size: number,
    stroke: number,
    gradId: string,
    fromVar: string,
    toVar: string,
    withTicks: boolean = false
  ): string {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(100, Math.max(0, pct));
    const offset = c * (1 - clamped / 100);
    const center = size / 2;

    let ticks = '';
    if (withTicks) {
      const lines: string[] = [];
      const r1 = r - stroke / 2 - 4;
      const r2 = r1 - 4;
      for (let i = 0; i < 60; i++) {
        const a = ((i * 6 - 90) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        lines.push(
          `<line x1="${(center + r1 * cos).toFixed(1)}" y1="${(center + r1 * sin).toFixed(1)}" ` +
          `x2="${(center + r2 * cos).toFixed(1)}" y2="${(center + r2 * sin).toFixed(1)}"/>`
        );
      }
      ticks = `<g class="ring-ticks">${lines.join('')}</g>`;
    }

    // Glowing head dot at the arc end (fades in once the sweep finishes).
    const headAngle = ((clamped / 100) * 360 - 90) * (Math.PI / 180);
    const hx = (center + r * Math.cos(headAngle)).toFixed(1);
    const hy = (center + r * Math.sin(headAngle)).toFixed(1);
    const head = clamped > 0.5
      ? `<g class="ring-head">
        <circle class="ring-head-glow" style="fill: var(${toVar})" cx="${hx}" cy="${hy}" r="${(stroke * 0.95).toFixed(1)}" />
        <circle class="ring-head-core" cx="${hx}" cy="${hy}" r="${(stroke * 0.34).toFixed(1)}" />
      </g>`
      : '';

    const arc = (cls: string, extra: string = '') =>
      `<circle class="${cls}" cx="${center}" cy="${center}" r="${r}" stroke="url(#${gradId})" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
        data-target-offset="${offset.toFixed(1)}" transform="rotate(-90 ${center} ${center})"${extra} />`;

    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="var(${fromVar})" />
          <stop offset="100%" stop-color="var(${toVar})" />
        </linearGradient>
        <filter id="${gradId}Blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="${(stroke * 0.55).toFixed(1)}" />
        </filter>
      </defs>
      ${ticks}
      <circle class="ring-track" cx="${center}" cy="${center}" r="${r}" stroke-width="${stroke}" />
      ${arc('ring-bloom', ` filter="url(#${gradId}Blur)"`)}
      ${arc('ring-fill')}
      ${head}
    </svg>`;
  }

  private renderHero(s: QuotaState, t: T): string {
    const dash = t('app.dash');
    const wPct = this.pct(s.weeklyUsed, s.weeklyLimit);
    const winPct = this.pct(s.windowUsed, s.windowLimit);
    const wRemainPct = s.weeklyLimit !== null && s.weeklyLimit > 0 ? Math.max(0, 100 - wPct) : null;
    const winRemainPct = s.windowLimit !== null && s.windowLimit > 0 ? Math.max(0, 100 - winPct) : null;
    const fmtPct = (p: number | null): string => (p === null ? dash : `${p}%`);
    const weeklyRemaining =
      s.weeklyLimit !== null && s.weeklyUsed !== null ? Math.max(0, s.weeklyLimit - s.weeklyUsed) : null;
    const weeklyResetHours = hoursUntil(s.weeklyResetAt) ?? s.weeklyResetHours;
    const weeklyReset = weeklyResetHours !== null ? fmtHours(Math.max(0, weeklyResetHours)) : dash;
    const winResetHours = hoursUntil(s.windowResetAt);
    const winReset = winResetHours !== null ? fmtHours(Math.max(0, winResetHours)) : dash;

    // Pace analysis: compare usage progress against elapsed time of the 7-day cycle.
    let paceBadge = '';
    let projection = '';
    const usedPctRaw = s.weeklyUsedPct ?? (s.weeklyLimit && s.weeklyUsed !== null ? this.pct(s.weeklyUsed, s.weeklyLimit) : null);
    if (weeklyResetHours !== null && usedPctRaw !== null) {
      const elapsedPct = weeklyElapsedPct(weeklyResetHours);
      const level = paceLevel(usedPctRaw, elapsedPct);
      const cls = level === 'ahead' ? 'pace-fast' : level === 'relaxed' ? 'pace-relaxed' : 'pace-ok';
      const txt = level === 'ahead' ? t('pace.ahead') : level === 'relaxed' ? t('pace.relaxed') : t('pace.onTrack');
      paceBadge = `<div class="pace-badge ${cls}">${escapeHtml(txt)}</div>`;
      if (elapsedPct >= 1) {
        const proj = Math.min(999, Math.round((usedPctRaw / elapsedPct) * 100));
        projection = `<div class="projection muted">${escapeHtml(t('hero.projection', proj))}</div>`;
      }
    }

    return `<section class="hero">
      <div class="hero-main">
        <div class="ring-wrap">
          ${this.renderRing(wPct, 176, 13, 'gradWeekly', '--accent', '--accent-2', true)}
          <div class="ring-center">
            <div class="ring-value" data-countup="${wPct}">0%</div>
            <div class="ring-label">${escapeHtml(t('card.weeklyUsed'))}</div>
            <div class="ring-sub muted">${this.fmtNum(s.weeklyUsed, dash)} / ${this.fmtNum(s.weeklyLimit, dash)}</div>
            ${paceBadge}
          </div>
        </div>
      </div>
      <div class="hero-side">
        <div class="ring-wrap">
          ${this.renderRing(winPct, 96, 9, 'gradWindow', '--accent-2', '--accent')}
          <div class="ring-center">
            <div class="ring-value small" data-countup="${winPct}">0%</div>
            <div class="ring-label small">${escapeHtml(t('card.windowUsed'))}</div>
          </div>
        </div>
        <div class="hero-window-text">
          <div class="hero-window-title" title="${escapeHtml(t('card.windowHint'))}">${escapeHtml(t('card.windowRemaining'))}</div>
          <div class="hero-window-pct">${fmtPct(winRemainPct)}</div>
          <div class="muted">${this.fmtNum(s.windowRemaining, dash)} / ${this.fmtNum(s.windowLimit, dash)}</div>
          <div class="muted">${escapeHtml(t('card.windowResetsIn', winReset))}</div>
          ${projection}
        </div>
      </div>
      <div class="hero-chips">
        <div class="chip"><span class="chip-icon tone-accent">${icon('hourglass', 15)}</span><div>
          <div class="chip-value">${escapeHtml(weeklyReset)}</div>
          <div class="chip-label muted">${escapeHtml(t('card.weeklyResetIn'))}</div>
        </div></div>
        <div class="chip"><span class="chip-icon tone-ok">${icon('battery', 15)}</span><div>
          <div class="chip-value">${fmtPct(winRemainPct)}</div>
          <div class="chip-sub muted">${this.fmtNum(s.windowRemaining, dash)} / ${this.fmtNum(s.windowLimit, dash)}</div>
          <div class="chip-label muted">${escapeHtml(t('card.windowRemaining'))}</div>
        </div></div>
        <div class="chip"><span class="chip-icon tone-accent-2">${icon('layers', 15)}</span><div>
          <div class="chip-value">${this.fmtNum(s.parallelLimit, dash)}</div>
          <div class="chip-label muted">${escapeHtml(t('card.parallelLimit'))}</div>
        </div></div>
        <div class="chip"><span class="chip-icon tone-warn">${icon('coin', 15)}</span><div>
          <div class="chip-value">${fmtPct(wRemainPct)}</div>
          <div class="chip-sub muted">${this.fmtNum(weeklyRemaining, dash)} / ${this.fmtNum(s.weeklyLimit, dash)}</div>
          <div class="chip-label muted">${escapeHtml(t('card.weeklyRemaining'))}</div>
        </div></div>
      </div>
    </section>`;
  }

  private renderChart(buckets: Bucket[], _t: T): string {
    const max = Math.max(...buckets.map((b) => b.weekly), 1);
    const maxHeight = 160;
    return `<div class="chart-bars">${buckets
      .map((b, i) => {
        const height = b.weekly > 0 ? Math.max((b.weekly / max) * maxHeight, 4) : 0;
        return `<div class="chart-bar-container${b.weekly > 0 ? '' : ' bar-zero'}"
             data-key="${escapeHtml(b.key)}"
             data-weekly="${b.weekly}"
             data-window="${b.window}"
             data-samples="${b.samples}">
          <div class="chart-bar weekly-bar" style="height: ${height}px; animation-delay: ${i * 28}ms;"></div>
          <div class="chart-label">${escapeHtml(b.label)}</div>
        </div>`;
      })
      .join('')}</div>`;
  }

  private areaPoints(values: number[]): string {
    const max = Math.max(...values, 1);
    const n = values.length;
    return values
      .map((v, i) => {
        const x = n > 1 ? (i / (n - 1)) * 1000 : 500;
        const y = 190 - (v / max) * 170;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  private renderAreaChart(buckets: Bucket[], chartId: string): string {
    const pts = this.areaPoints(buckets.map((b) => b.weekly));
    const zones = buckets
      .map(
        (b) =>
          `<div class="hz" data-label="${escapeHtml(b.label)}" data-weekly="${b.weekly}" data-window="${b.window}" data-samples="${b.samples}"></div>`
      )
      .join('');
    return `<div class="area-wrap">
      <svg class="area-svg" viewBox="0 0 1000 200" preserveAspectRatio="none">
        <defs><linearGradient id="${chartId}AreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
        </linearGradient></defs>
        <polygon class="area-fill" points="${pts} 1000,200 0,200" fill="url(#${chartId}AreaGrad)" />
        <polyline class="area-line" points="${pts}" fill="none" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="area-hover-zones">${zones}</div>
    </div>`;
  }

  private renderBucketTable(buckets: Bucket[], timeHeader: string, t: T): string {
    const totalSamples = buckets.reduce((s, b) => s + b.samples, 0);
    if (totalSamples === 0) {
      return `<div class="no-data" style="padding:24px;text-align:center">
        <p class="muted">${escapeHtml(t('noData'))}</p>
      </div>`;
    }
    const rows = [...buckets].reverse();
    return `<div class="daily-table-container">
      <table class="daily-table">
        <thead>
          <tr>
            <th>${escapeHtml(timeHeader)}</th>
            <th>${escapeHtml(t('table.col.weeklyDelta'))}</th>
            <th>${escapeHtml(t('table.col.windowDelta'))}</th>
            <th>${escapeHtml(t('table.col.samples'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (b) => `<tr>
            <td class="date-cell">${escapeHtml(b.label)}</td>
            <td class="number-cell">${this.fmtNum(b.weekly)}</td>
            <td class="number-cell">${this.fmtNum(b.window)}</td>
            <td class="number-cell">${b.samples}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
  }

  private chartStatChips(buckets: Bucket[], t: T): string {
    const total = buckets.reduce((a, b) => a + b.weekly, 0);
    const avg = buckets.length ? Math.round(total / buckets.length) : 0;
    const peak = buckets.reduce<Bucket | null>((m, b) => (b.weekly > (m?.weekly ?? -1) ? b : m), null);
    return `<span class="stat-text">${escapeHtml(t('stats.total', fmtTokens(total)))}</span>
      <span class="stat-sep">·</span>
      <span class="stat-text">${escapeHtml(t('stats.avg', fmtTokens(avg)))}</span>
      ${peak ? `<span class="stat-sep">·</span><span class="stat-text peak">${escapeHtml(t('stats.peak', peak.label, fmtTokens(peak.weekly)))}</span>` : ''}`;
  }

  private renderActivityFeed(t: T): string {
    const deltas = (this.tracker?.getDeltas() ?? []).slice(-30).reverse();
    if (deltas.length === 0) {
      return `<div class="feed-empty muted">${escapeHtml(t('feed.empty'))}</div>`;
    }
    const items = deltas
      .map((d, i) => {
        const dt = new Date(d.timestamp);
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');
        const lines: string[] = [];
        if (d.weeklyDelta > 0) {
          lines.push(`<div class="feed-line"><span>${escapeHtml(t('feed.weekly'))}</span><b class="feed-plus tone-text-ok">+${escapeHtml(fmtTokens(d.weeklyDelta))}</b></div>`);
        }
        if (d.windowDelta > 0) {
          lines.push(`<div class="feed-line"><span>${escapeHtml(t('feed.window'))}</span><b class="feed-plus tone-text-accent">+${escapeHtml(fmtTokens(d.windowDelta))}</b></div>`);
        }
        const up = d.weeklyDelta > 0;
        return `<div class="feed-item${i >= 4 ? ' feed-extra hidden' : ''}">
          <span class="feed-icon ${up ? 'feed-icon-up' : 'feed-icon-right'}">${icon(up ? 'arrowUp' : 'arrowRight', 11)}</span>
          <div class="feed-body">
            <div class="feed-time muted">${hh}:${mm}</div>
            ${lines.join('')}
          </div>
        </div>`;
      })
      .join('');
    const toggle = deltas.length > 4
      ? `<button class="btn-ghost feed-toggle" data-expanded="0" data-more="${escapeHtml(t('feed.more'))}" data-less="${escapeHtml(t('feed.collapse'))}">${escapeHtml(t('feed.more'))}</button>`
      : '';
    return `<div class="feed-list">${items}</div>${toggle}`;
  }

  private renderChartBlock(
    title: string,
    buckets: Bucket[],
    chartId: string,
    timeHeader: string,
    t: T
  ): string {
    const hasData = buckets.some((b) => b.samples > 0);
    return `<div class="daily-breakdown">
      <div class="chart-head">
        <h3>${escapeHtml(title)}</h3>
      </div>
      ${hasData ? `<div class="chart-toolbar">
        <div class="chart-tabs">
          <button class="chart-tab active" data-metric="weekly">${escapeHtml(t('chart.metric.weekly'))}</button>
          <button class="chart-tab" data-metric="window">${escapeHtml(t('chart.metric.window'))}</button>
          <button class="chart-tab" data-metric="samples">${escapeHtml(t('chart.metric.samples'))}</button>
        </div>
        <div class="chart-views">
          <button class="chart-view-btn active" data-view="bars">${escapeHtml(t('chart.view.bars'))}</button>
          <button class="chart-view-btn" data-view="area">${escapeHtml(t('chart.view.area'))}</button>
        </div>
      </div>` : ''}
      <div class="chart-container">
        ${hasData ? `<div class="chart-view view-bars" id="${chartId}">
          ${this.renderChart(buckets, t)}
        </div>
        <div class="chart-view view-area hidden">
          ${this.renderAreaChart(buckets, chartId)}
        </div>` : `<div class="chart-empty muted">${escapeHtml(t('chart.empty'))}</div>`}
      </div>
      <div class="bucket-details hidden">${this.renderBucketTable(buckets, timeHeader, t)}</div>
      <button class="btn-ghost details-toggle" data-expanded="0" data-more="${escapeHtml(t('btn.details'))}" data-less="${escapeHtml(t('feed.collapse'))}">${icon('chevron', 12)}<span>${escapeHtml(t('btn.details'))}</span></button>
    </div>`;
  }

  private renderTodayTab(buckets: Bucket[], t: T): string {
    return this.renderChartBlock(t('chart.title.today'), buckets, 'hourlyChart', t('table.col.hour'), t);
  }

  private renderWeekTab(buckets: Bucket[], t: T): string {
    return this.renderChartBlock(t('chart.title.week'), buckets, 'dailyChart', t('table.col.date'), t);
  }

  private relativeUpdated(s: QuotaState, t: T): string {
    if (!s.lastUpdated) return t('app.dash');
    const mins = Math.floor((Date.now() - s.lastUpdated) / 60_000);
    if (mins < 1) return t('app.updatedJustNow');
    if (mins < 60) return t('app.updatedMinutesAgo', mins);
    return t('app.updatedHoursAgo', Math.floor(mins / 60));
  }

  private renderHtml(s: QuotaState): string {
    const config = getConfig();
    const locale: Locale = resolveLocale(config.language, vscode.env.language);
    const t = makeT(locale);
    const updated = this.relativeUpdated(s, t);
    const tab = this.currentTab;
    const totalDeltas = this.tracker?.getDeltas().length ?? 0;
    const hourlyBuckets = this.tracker?.getHourlyBuckets(24) ?? [];
    const dailyBuckets = this.tracker?.getDailyBuckets(7) ?? [];
    const refreshSecs = Math.max(30, config.refreshIntervalSeconds);
    const langLabel = locale === 'zh-CN' ? 'EN' : '中文';

    const tabClass = (id: TabId): string => (tab === id ? 'active' : '');

    const banner = s.authFailed
      ? `<div class="banner banner-error">${t('banner.authFailed')}</div>`
      : s.error
        ? `<div class="banner banner-error">${t('banner.error', escapeHtml(s.error))}</div>`
        : '';

    return /* html */ `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>${escapeHtml(t('app.title'))}</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-block">
        <h1>
          <span class="title-dot"></span>${escapeHtml(t('app.title'))}
          <span class="live-badge"><span class="live-dot"></span>${escapeHtml(t('app.monitoring'))}</span>
        </h1>
        <div class="muted subtitle">${escapeHtml(t('app.subtitle'))}</div>
        <div class="muted last-updated">
          ${escapeHtml(t('app.lastUpdated'))}: ${escapeHtml(updated)}
          · <span class="countdown-text" id="countdown" data-template="${escapeHtml(t('app.nextRefresh', '{0}'))}">${escapeHtml(t('app.nextRefresh', refreshSecs))}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn" onclick="doRefresh(this)"><span class="btn-icon">${icon('refresh', 13)}</span>${escapeHtml(t('btn.refresh'))}</button>
        <button class="btn-secondary" onclick="postCmd('toggleLanguage')" title="${escapeHtml(t('btn.language.tooltip'))}">${langLabel}</button>
        <button class="btn-secondary" onclick="postCmd('openSettings')">${icon('settings', 13)}${escapeHtml(t('btn.settings'))}</button>
        <button class="btn-secondary" onclick="postCmd('openConsole')">${icon('external', 13)}${escapeHtml(t('btn.console'))}</button>
        <button class="btn-secondary" onclick="postCmd('signOut')">${icon('power', 13)}${escapeHtml(t('btn.signOut'))}</button>
      </div>
    </header>

    ${banner}

    ${this.renderHero(s, t)}

    <div class="tabs-row">
      <div class="tabs">
        <button id="tab-today" class="tab ${tabClass('today')}" onclick="showTab('today')">${escapeHtml(t('tab.today'))}</button>
        <button id="tab-week" class="tab ${tabClass('week')}" onclick="showTab('week')">${escapeHtml(t('tab.week'))}</button>
      </div>
      <div class="tab-stats-wrap">
        <span id="stats-today" class="tab-stats ${tabClass('today')}">${this.chartStatChips(hourlyBuckets, t)}</span>
        <span id="stats-week" class="tab-stats ${tabClass('week')}">${this.chartStatChips(dailyBuckets, t)}</span>
      </div>
    </div>

    <div class="main-grid" id="mainGrid" data-tab="${tab}">
      <div class="main-col">
        <div id="today" class="tab-content ${tabClass('today')}">${this.renderTodayTab(hourlyBuckets, t)}</div>
        <div id="week" class="tab-content ${tabClass('week')}">${this.renderWeekTab(dailyBuckets, t)}</div>
      </div>
      <aside class="feed-card">
        <div class="feed-head"><h3>${escapeHtml(t('feed.title'))}</h3></div>
        ${this.renderActivityFeed(t)}
      </aside>
    </div>

    <footer>
      <span class="footer-left muted">${icon('shield', 12)} ${escapeHtml(t('footer.security'))} · ${t('footer', totalDeltas)}</span>
      <span class="footer-right">
        <span class="version-badge">v${escapeHtml(this.version)}</span>
        <button class="btn-ghost" onclick="postCmd('clearHistory')" title="${escapeHtml(t('btn.clearHistory.tooltip'))}">${icon('trash', 12)} ${escapeHtml(t('btn.clearHistory'))}</button>
      </span>
    </footer>
  </div>
  <div id="chartTip" class="chart-tip"></div>
  <script>${this.getScript(t, refreshSecs)}</script>
</body>
</html>`;
  }

  private getStyles(): string {
    return `
      /* ── Design tokens: dark = deep-navy tech (default), light = clean gray ── */
      :root {
        --radius: 12px;
        --bg: #0a0f1a;
        --card: rgba(255, 255, 255, 0.03);
        --card-2: rgba(255, 255, 255, 0.05);
        --border: rgba(255, 255, 255, 0.08);
        --border-strong: rgba(255, 255, 255, 0.16);
        --text: #e8eef6;
        --text-2: #8b98a9;
        --text-3: #5c6878;
        --accent: #38bdf8;
        --accent-2: #818cf8;
        --ok: #34d399;
        --warn: #fbbf24;
        --danger: #f87171;
        --accent-bg: rgba(56, 189, 248, 0.12);
        --accent-2-bg: rgba(129, 140, 248, 0.12);
        --ok-bg: rgba(52, 211, 153, 0.12);
        --warn-bg: rgba(251, 191, 36, 0.12);
        --accent-br: rgba(56, 189, 248, 0.35);
        --ok-br: rgba(52, 211, 153, 0.35);
        --warn-br: rgba(251, 191, 36, 0.35);
        --ring-track: rgba(255, 255, 255, 0.06);
        --btn-bg: #2563eb;
        --btn-hover: #1d4ed8;
        --btn-text: #ffffff;
        --tip-bg: #0d1526;
        --glow-text: rgba(56, 189, 248, 0.35);
        --bg-glow: rgba(56, 189, 248, 0.06);
        --bar-weekly: linear-gradient(to top, #1d4ed8, #38bdf8);
        --bar-window: linear-gradient(to top, #6d28d9, #818cf8);
        --bar-samples: linear-gradient(to top, #3f4c63, #7d8aa0);
      }
      body.vscode-light {
        --bg: #f6f8fb;
        --card: #ffffff;
        --card-2: #f0f3f8;
        --border: rgba(15, 23, 42, 0.08);
        --border-strong: rgba(15, 23, 42, 0.18);
        --text: #16202e;
        --text-2: #5c6b7d;
        --text-3: #8b98a9;
        --accent: #0284c7;
        --accent-2: #6366f1;
        --ok: #059669;
        --warn: #b45309;
        --danger: #dc2626;
        --accent-bg: rgba(2, 132, 199, 0.10);
        --accent-2-bg: rgba(99, 102, 241, 0.10);
        --ok-bg: rgba(5, 150, 105, 0.10);
        --warn-bg: rgba(180, 83, 9, 0.10);
        --accent-br: rgba(2, 132, 199, 0.35);
        --ok-br: rgba(5, 150, 105, 0.35);
        --warn-br: rgba(180, 83, 9, 0.35);
        --ring-track: rgba(15, 23, 42, 0.08);
        --tip-bg: #ffffff;
        --glow-text: rgba(2, 132, 199, 0.22);
        --bg-glow: rgba(37, 99, 235, 0.05);
      }

      body { font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--text); background: var(--bg); margin: 0; padding: 24px 20px 20px; }
      body::before { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(720px 320px at 18% -6%, var(--bg-glow), transparent 70%); }
      .container { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto; animation: fade-in 0.35s ease; }
      @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes head-in { to { opacity: 1; } }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes rot { to { transform: rotate(360deg); } }
      @keyframes bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }

      /* ── Flat surfaces ── */
      header, .hero, .chip, .chart-container, .tabs, .daily-table-container, .banner, .feed-card {
        background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
      }
      .muted { color: var(--text-2); }
      code { font-family: var(--vscode-editor-font-family, monospace); }
      .ic { display: inline-block; vertical-align: -2px; }

      /* ── Header ── */
      header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; padding: 18px 22px; flex-wrap: wrap; }
      .title-block h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.2px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .title-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 10px var(--ok); animation: pulse 2.2s infinite; flex: none; }
      .live-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 600; color: var(--ok); background: var(--ok-bg); border: 1px solid var(--ok-br); border-radius: 999px; padding: 2px 9px; }
      .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); animation: pulse 1.6s infinite; }
      .subtitle { font-size: 12px; margin-top: 5px; }
      .last-updated { font-size: 11px; margin-top: 6px; }
      .countdown-text { font-variant-numeric: tabular-nums; color: var(--text-3); }

      /* ── Buttons ── */
      .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .btn, .btn-secondary { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; border-radius: 8px; padding: 7px 14px; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease; }
      .btn { background: var(--btn-bg); color: var(--btn-text); border: 1px solid transparent; font-weight: 600; }
      .btn:hover { background: var(--btn-hover); }
      .btn:active, .btn-secondary:active { transform: scale(0.98); }
      .btn-icon { display: inline-flex; }
      .btn.spinning .btn-icon .ic { animation: rot 0.8s linear infinite; }
      .btn-secondary { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
      .btn-secondary:hover { color: var(--text); border-color: var(--border-strong); background: var(--card-2); }
      .btn-ghost { display: inline-flex; align-items: center; gap: 5px; background: transparent; border: none; color: var(--text-3); font-size: 11px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: color 0.15s ease, background 0.15s ease; }
      .btn-ghost:hover { color: var(--danger); background: var(--card-2); }
      .details-toggle:hover, .feed-toggle:hover { color: var(--accent); }

      /* ── Banner ── */
      .banner { padding: 10px 14px; margin-bottom: 16px; font-size: 12px; }
      .banner-error { border-left: 3px solid var(--danger); }

      /* ── Hero ── */
      .hero { display: flex; align-items: center; gap: 30px; flex-wrap: wrap; padding: 26px 30px; margin-bottom: 20px; animation: fade-up 0.45s ease backwards; }
      .hero-main { flex: none; }
      .hero-main .ring-wrap, .hero-side .ring-wrap { margin: 8px; }
      .ring-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
      .ring { display: block; overflow: visible; }
      .ring-track { fill: none; stroke: var(--ring-track); }
      .ring-fill, .ring-bloom { fill: none; transition: stroke-dashoffset 1.2s cubic-bezier(0.33, 1, 0.68, 1); }
      .ring-bloom { opacity: 0.55; }
      .ring-ticks line { stroke: var(--text-3); stroke-width: 1; opacity: 0.25; }
      .ring-head { opacity: 0; animation: head-in 0.45s ease 0.95s forwards; }
      .ring-head-glow { opacity: 0.45; filter: blur(5px); }
      .ring-head-core { fill: var(--text); }
      .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
      .ring-value { font-size: 34px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.5px; line-height: 1.1; color: var(--text); text-shadow: 0 0 22px var(--glow-text); }
      .ring-value.small { font-size: 20px; }
      .ring-label { font-size: 12px; color: var(--text); margin-top: 2px; }
      .ring-label.small { font-size: 10px; color: var(--text-2); margin-top: 1px; }
      .ring-sub { font-size: 11px; margin-top: 2px; font-variant-numeric: tabular-nums; }
      .pace-badge { margin-top: 8px; font-size: 10px; padding: 2px 10px; border-radius: 999px; font-weight: 600; }
      .pace-fast { color: var(--warn); background: var(--warn-bg); border: 1px solid var(--warn-br); }
      .pace-ok { color: var(--accent); background: var(--accent-bg); border: 1px solid var(--accent-br); }
      .pace-relaxed { color: var(--ok); background: var(--ok-bg); border: 1px solid var(--ok-br); }
      .hero-side { display: flex; align-items: center; gap: 14px; flex: none; }
      .hero-window-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
      .hero-window-pct { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.3px; line-height: 1.15; margin-bottom: 2px; }
      .hero-window-text .muted { font-size: 12px; line-height: 1.6; font-variant-numeric: tabular-nums; }
      .projection { margin-top: 6px; font-size: 11px; }
      .hero-chips { flex: 1; min-width: 240px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
      .chip { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; transition: border-color 0.2s ease; animation: fade-up 0.45s ease backwards; }
      .chip:nth-child(1) { animation-delay: 0.08s; }
      .chip:nth-child(2) { animation-delay: 0.14s; }
      .chip:nth-child(3) { animation-delay: 0.2s; }
      .chip:nth-child(4) { animation-delay: 0.26s; }
      .chip:hover { border-color: var(--border-strong); }
      .chip-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex: none; }
      .chip-icon.tone-accent { color: var(--accent); background: var(--accent-bg); }
      .chip-icon.tone-ok { color: var(--ok); background: var(--ok-bg); }
      .chip-icon.tone-accent-2 { color: var(--accent-2); background: var(--accent-2-bg); }
      .chip-icon.tone-warn { color: var(--warn); background: var(--warn-bg); }
      .chip-value { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .chip-sub { font-size: 11px; margin-top: 1px; font-variant-numeric: tabular-nums; }
      .chip-label { font-size: 11px; margin-top: 2px; }

      /* ── Tabs row (tabs left, period stats right) ── */
      .tabs-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
      .tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; }
      .tab { background: transparent; color: var(--text-2); border: none; padding: 6px 18px; cursor: pointer; border-radius: 999px; font-size: 13px; transition: color 0.15s ease, background 0.15s ease; }
      .tab:hover { color: var(--text); }
      .tab.active { background: var(--btn-bg); color: var(--btn-text); font-weight: 600; }
      .tab-content { display: none; }
      .tab-content.active { display: block; animation: fade-up 0.3s ease; }
      .tab-stats-wrap { display: flex; align-items: center; }
      .tab-stats { display: none; align-items: baseline; gap: 8px; font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
      .tab-stats.active { display: inline-flex; }
      .stat-sep { color: var(--text-3); }
      .stat-text.peak { color: var(--warn); font-weight: 600; }

      /* ── Chart block ── */
      .daily-breakdown { margin-top: 4px; }
      .chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .chart-head h3 { margin: 0; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .chart-head h3::before { content: ''; width: 8px; height: 8px; border-radius: 2px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); flex: none; }
      .chart-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .chart-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .chart-views { display: flex; gap: 6px; }
      .chart-tab, .chart-view-btn { background: transparent; color: var(--text-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px 14px; font-size: 11px; cursor: pointer; transition: all 0.15s ease; }
      .chart-tab:hover, .chart-view-btn:hover { color: var(--text); border-color: var(--border-strong); }
      .chart-tab.active, .chart-view-btn.active { background: var(--accent-bg); color: var(--accent); border-color: var(--accent-br); font-weight: 600; }
      .chart-container { padding: 20px 16px 12px; margin-bottom: 12px; height: 260px; overflow-x: auto; }
      .chart-view { width: 100%; height: 100%; }
      .chart-view.hidden { display: none; }
      .chart-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; }
      .view-bars { display: flex; align-items: end; justify-content: flex-start; }
      .chart-bars { display: flex; align-items: end; gap: 4px; min-width: fit-content; width: 100%; height: 100%; padding: 0 4px; }
      .chart-bar-container { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1 1 28px; min-width: 26px; height: 100%; position: relative; padding-bottom: 22px; }
      .chart-bar { width: 26px; max-width: 100%; border-radius: 5px 5px 2px 2px; transition: height 0.3s ease, filter 0.15s ease; margin-bottom: 8px; transform-origin: bottom; animation: bar-grow 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) backwards; }
      .bar-zero .chart-bar { visibility: hidden; }
      .chart-bar-container:hover .chart-bar { filter: brightness(1.18); }
      .weekly-bar { background: var(--bar-weekly); }
      .window-bar { background: var(--bar-window); }
      .samples-bar { background: var(--bar-samples); }
      .chart-label { font-size: 9px; color: var(--text-3); text-align: center; line-height: 12px; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; white-space: nowrap; }
      .bucket-details.hidden { display: none; }
      .details-toggle { margin-top: 2px; }
      .details-toggle .ic { transition: transform 0.2s ease; }
      .details-toggle.open .ic { transform: rotate(180deg); }

      /* ── Area chart ── */
      .area-wrap { position: relative; width: 100%; height: 100%; animation: fade-up 0.3s ease; }
      .area-svg { width: 100%; height: 100%; display: block; overflow: visible; }
      .area-line { stroke: var(--accent); stroke-width: 2.5px; stroke-linejoin: round; stroke-linecap: round; }
      .area-hover-zones { position: absolute; inset: 0; display: flex; }
      .hz { flex: 1; }
      .hz:hover { background: var(--card-2); }

      /* ── Custom tooltip ── */
      .chart-tip { position: fixed; z-index: 99; pointer-events: none; opacity: 0; transition: opacity 0.12s ease; background: var(--tip-bg); border: 1px solid var(--border-strong); border-radius: 8px; padding: 8px 10px; font-size: 11px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); min-width: 130px; }
      .chart-tip .tip-title { font-weight: 700; margin-bottom: 5px; }
      .chart-tip .tip-row { display: flex; justify-content: space-between; gap: 14px; line-height: 1.7; font-variant-numeric: tabular-nums; }
      .chart-tip .tip-row span:last-child { font-family: var(--vscode-editor-font-family, monospace); }

      /* ── Table ── */
      .daily-table-container { overflow-x: auto; margin-top: 10px; }
      .daily-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .daily-table th, .daily-table td { padding: 9px 14px; text-align: left; border-bottom: 1px solid var(--border); }
      .daily-table tbody tr:last-child td { border-bottom: none; }
      .daily-table th { background: var(--card-2); font-weight: 600; color: var(--text-2); font-size: 11px; letter-spacing: 0.4px; }
      .daily-table tbody tr:hover { background: var(--card-2); }
      .date-cell { font-weight: 600; color: var(--accent); white-space: nowrap; }
      .number-cell { text-align: right; font-family: var(--vscode-editor-font-family, monospace); font-variant-numeric: tabular-nums; }
      .no-data { padding: 40px 20px; text-align: center; color: var(--text-2); }

      /* ── Main grid (chart column + activity feed column) ── */
      .main-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; align-items: stretch; }
      @media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }
      @media (max-width: 900px) { .feed-list { max-height: 460px; flex: none; } }

      /* ── Slim scrollbars ── */
      .chart-container::-webkit-scrollbar, .feed-list::-webkit-scrollbar { height: 6px; width: 6px; }
      .chart-container::-webkit-scrollbar-thumb, .feed-list::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
      .chart-container::-webkit-scrollbar-track, .feed-list::-webkit-scrollbar-track { background: transparent; }

      /* ── Activity feed ── */
      .feed-card { padding: 16px; display: flex; flex-direction: column; animation: fade-up 0.45s ease backwards; animation-delay: 0.12s; }
      .feed-head h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .feed-head h3::before { content: ''; width: 8px; height: 8px; border-radius: 2px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); flex: none; }
      .feed-list { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; max-height: 640px; overflow-y: auto; }
      .feed-item { display: flex; gap: 10px; padding: 9px 11px; border-radius: 10px; background: var(--card-2); border: 1px solid var(--border); animation: fade-up 0.3s ease backwards; }
      .feed-icon { width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 2px; }
      .feed-icon-up { color: var(--ok); background: var(--ok-bg); }
      .feed-icon-right { color: var(--accent); background: var(--accent-bg); }
      .feed-body { flex: 1; min-width: 0; }
      .feed-time { font-size: 10px; color: var(--text-3); font-variant-numeric: tabular-nums; margin-bottom: 2px; }
      .feed-line { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; line-height: 1.55; color: var(--text-2); }
      .feed-plus { font-family: var(--vscode-editor-font-family, monospace); font-variant-numeric: tabular-nums; font-weight: 600; }
      .tone-text-ok { color: var(--ok); }
      .tone-text-accent { color: var(--accent); }
      .feed-extra.hidden { display: none; }
      .feed-toggle { width: 100%; margin-top: 10px; justify-content: center; }
      .feed-empty { padding: 24px 10px; text-align: center; font-size: 12px; }

      /* ── Footer ── */
      footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 11px; flex-wrap: wrap; }
      .footer-left { display: inline-flex; align-items: center; gap: 6px; color: var(--text-3); }
      .footer-left .ic { color: var(--ok); }
      .footer-right { display: flex; align-items: center; gap: 10px; }
      .version-badge { font-size: 10px; padding: 2px 9px; border-radius: 999px; background: var(--card-2); border: 1px solid var(--border); color: var(--text-3); font-variant-numeric: tabular-nums; }

      /* ── no-anim: skip entrance animations on state-restored re-renders ── */
      .no-anim .container, .no-anim .hero, .no-anim .chip, .no-anim .summary-item, .no-anim .tab-content.active, .no-anim .chart-bar, .no-anim .feed-card, .no-anim .feed-item { animation: none !important; }
      .no-anim .ring-fill, .no-anim .ring-bloom { transition: none !important; }
      .no-anim .ring-head { animation: none !important; opacity: 1 !important; }
    `;
  }

  private getScript(t: T, refreshSecs: number): string {
    const labels = JSON.stringify({
      weekly: t('script.weeklyShort'),
      window: t('script.windowShort'),
      samples: t('script.samplesShort')
    });
    return `
      const vscode = acquireVsCodeApi();
      const REFRESH_SECS = ${refreshSecs};

      /* ── Persistent webview state (survives full HTML re-renders) ── */
      const persisted = vscode.getState() || {};
      const noAnim = !!persisted.booted;
      if (noAnim) { document.body.classList.add('no-anim'); } else { vscode.setState(Object.assign({}, persisted, { booted: true })); }
      function saveState(patch) { const cur = vscode.getState() || {}; vscode.setState(Object.assign({}, cur, patch)); }

      function postCmd(cmd) { vscode.postMessage({ command: cmd }); }
      function doRefresh(btn) { btn.classList.add('spinning'); postCmd('refresh'); }
      function showTab(id) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-stats').forEach(s => s.classList.remove('active'));
        const tabBtn = document.getElementById('tab-' + id);
        const tabContent = document.getElementById(id);
        const tabStats = document.getElementById('stats-' + id);
        const mainGrid = document.getElementById('mainGrid');
        if (mainGrid) mainGrid.dataset.tab = id;
        if (tabBtn && tabContent) {
          tabBtn.classList.add('active');
          tabContent.classList.add('active');
          if (tabStats) tabStats.classList.add('active');
          vscode.postMessage({ command: 'tabChanged', tab: id });
        }
      }
      function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

      /* ── Animated progress rings (instant on state-restored re-renders) ── */
      document.querySelectorAll('.ring-fill, .ring-bloom').forEach(function(c) {
        if (noAnim) { c.style.strokeDashoffset = c.dataset.targetOffset; return; }
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            c.style.strokeDashoffset = c.dataset.targetOffset;
          });
        });
      });

      /* ── Count-up numbers ── */
      function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
      document.querySelectorAll('[data-countup]').forEach(function(el) {
        const target = parseFloat(el.dataset.countup) || 0;
        if (noAnim) { el.textContent = Math.round(target) + '%'; return; }
        const dur = 900;
        let start = null;
        function step(ts) {
          if (start === null) start = ts;
          const p = Math.min(1, (ts - start) / dur);
          el.textContent = Math.round(target * easeOutCubic(p)) + '%';
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });

      /* ── Next-refresh countdown ── */
      const cd = document.getElementById('countdown');
      if (cd) {
        let remain = REFRESH_SECS;
        setInterval(function() {
          remain = remain > 0 ? remain - 1 : REFRESH_SECS;
          cd.textContent = cd.dataset.template.replace('{0}', String(remain));
        }, 1000);
      }

      const METRIC_CLASS = { weekly: 'weekly-bar', window: 'window-bar', samples: 'samples-bar' };
      const METRIC_LABEL = ${labels};

      function rebuildChart(container, metric) {
        const cols = container.querySelectorAll('.chart-bar-container');
        if (!cols.length) return;
        const values = Array.from(cols).map(c => parseFloat(c.dataset[metric]) || 0);
        const max = Math.max.apply(null, values.concat([1]));
        const maxHeight = 160;
        const cls = METRIC_CLASS[metric] || 'weekly-bar';
        cols.forEach((col, i) => {
          const v = values[i];
          const bar = col.querySelector('.chart-bar');
          if (!bar) return;
          bar.style.height = (v > 0 ? Math.max((v / max) * maxHeight, 4) : 0) + 'px';
          bar.className = 'chart-bar ' + cls;
          col.classList.toggle('bar-zero', v <= 0);
        });
      }

      function areaPoints(values) {
        const max = Math.max.apply(null, values.concat([1]));
        const n = values.length;
        return values.map(function(v, i) {
          const x = n > 1 ? (i / (n - 1)) * 1000 : 500;
          const y = 190 - (v / max) * 170;
          return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
      }

      function rebuildArea(block, metric) {
        const wrap = block.querySelector('.view-area .area-wrap');
        if (!wrap) return;
        const zones = wrap.querySelectorAll('.hz');
        const values = Array.from(zones).map(z => parseFloat(z.dataset[metric]) || 0);
        const pts = areaPoints(values);
        const line = wrap.querySelector('.area-line');
        const fill = wrap.querySelector('.area-fill');
        if (line) line.setAttribute('points', pts);
        if (fill) fill.setAttribute('points', pts + ' 1000,200 0,200');
      }

      /* ── Custom tooltip ── */
      const tip = document.getElementById('chartTip');
      document.addEventListener('mousemove', function(e) {
        const zone = e.target && e.target.closest ? e.target.closest('[data-weekly]') : null;
        if (!zone) { tip.style.opacity = '0'; return; }
        const lbl = zone.dataset.label || (zone.querySelector('.chart-label') || {}).textContent || '';
        const rows = ['weekly', 'window', 'samples'].map(function(m) {
          const v = parseFloat(zone.dataset[m]) || 0;
          return '<div class="tip-row"><span>' + esc(METRIC_LABEL[m] || m) + '</span><span>' + v.toLocaleString() + '</span></div>';
        }).join('');
        tip.innerHTML = '<div class="tip-title">' + esc(lbl) + '</div>' + rows;
        tip.style.opacity = '1';
        const rect = tip.getBoundingClientRect();
        let x = e.clientX + 14, y = e.clientY + 14;
        if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - 14;
        if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - 14;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      });

      document.addEventListener('click', function(e) {
        const t = e.target;
        if (!t || !t.classList) return;

        /* activity feed expand/collapse */
        if (t.classList.contains('feed-toggle')) {
          const card = t.closest('.feed-card');
          const expanding = t.dataset.expanded !== '1';
          if (card) card.querySelectorAll('.feed-extra').forEach(x => x.classList.toggle('hidden', !expanding));
          t.dataset.expanded = expanding ? '1' : '0';
          t.textContent = expanding ? t.dataset.less : t.dataset.more;
          return;
        }

        /* bucket table details expand/collapse */
        const detTgl = t.closest ? t.closest('.details-toggle') : null;
        if (detTgl) {
          const block = detTgl.closest('.daily-breakdown');
          const expanding = detTgl.dataset.expanded !== '1';
          const det = block ? block.querySelector('.bucket-details') : null;
          if (det) det.classList.toggle('hidden', !expanding);
          detTgl.dataset.expanded = expanding ? '1' : '0';
          const lbl = detTgl.querySelector('span');
          if (lbl) lbl.textContent = expanding ? detTgl.dataset.less : detTgl.dataset.more;
          detTgl.classList.toggle('open', expanding);
          return;
        }

        /* chart view toggle (bars / area) */
        if (t.classList.contains('chart-view-btn')) {
          const block = t.closest('.daily-breakdown');
          if (!block) return;
          block.querySelectorAll('.chart-view-btn').forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          const view = t.dataset.view;
          block.querySelector('.view-bars').classList.toggle('hidden', view !== 'bars');
          block.querySelector('.view-area').classList.toggle('hidden', view !== 'area');
          saveState({ view: view });
          return;
        }

        /* metric tabs */
        if (t.classList.contains('chart-tab')) {
          const block = t.closest('.daily-breakdown');
          if (!block) return;
          block.querySelectorAll('.chart-tab').forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          const chart = block.querySelector('.view-bars');
          if (chart) rebuildChart(chart, t.dataset.metric);
          rebuildArea(block, t.dataset.metric);
          saveState({ metric: t.dataset.metric });
        }
      });

      /* ── Restore chart metric/view selection from persisted state ── */
      document.querySelectorAll('.daily-breakdown').forEach(function(block) {
        const barsView = block.querySelector('.view-bars');
        const areaView = block.querySelector('.view-area');
        if (barsView && areaView && (persisted.view === 'area' || persisted.view === 'bars')) {
          block.querySelectorAll('.chart-view-btn').forEach(function(x) { x.classList.toggle('active', x.dataset.view === persisted.view); });
          barsView.classList.toggle('hidden', persisted.view !== 'bars');
          areaView.classList.toggle('hidden', persisted.view !== 'area');
        }
        if (persisted.metric && METRIC_CLASS[persisted.metric]) {
          block.querySelectorAll('.chart-tab').forEach(function(x) { x.classList.toggle('active', x.dataset.metric === persisted.metric); });
          const chart = block.querySelector('.view-bars');
          if (chart) rebuildChart(chart, persisted.metric);
          rebuildArea(block, persisted.metric);
        }
      });

      /* ── Restore + persist scroll position ── */
      if (persisted.scrollY) { window.scrollTo(0, persisted.scrollY); }
      let scrollTimer = null;
      window.addEventListener('scroll', function() {
        if (scrollTimer) return;
        scrollTimer = setTimeout(function() { scrollTimer = null; saveState({ scrollY: window.scrollY }); }, 300);
      });
    `;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string));
}

/** Minimal line-icon set (feather-style, 24×24, stroke = currentColor). */
const ICONS: Record<string, string> = {
  refresh:
    '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  external:
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
    '<path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  hourglass:
    '<path d="M6 2h12"/><path d="M6 22h12"/>' +
    '<path d="M8 2v4.5L12 10l4-3.5V2"/><path d="M8 22v-4.5L12 14l4 3.5V22"/>',
  battery:
    '<rect x="1" y="8" width="18" height="8" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/>' +
    '<line x1="5" y1="12" x2="12" y2="12"/>',
  layers:
    '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  coin: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 11.5l2 2 4-4.5"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  trash:
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>'
};

function icon(name: string, size: number = 14): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}
