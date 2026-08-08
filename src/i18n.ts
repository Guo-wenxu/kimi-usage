import { LanguageSetting } from './types';

export type Locale = 'en' | 'zh-CN';

type Dict = Record<string, string>;

const en: Dict = {
  'app.title': 'Kimi Usage Monitor',
  'app.subtitle': 'Real-time stats & analysis of your Kimi usage',
  'app.monitoring': 'Live',
  'app.lastUpdated': 'Last updated',
  'app.updatedJustNow': 'just now',
  'app.updatedMinutesAgo': '{0} min ago',
  'app.updatedHoursAgo': '{0} h ago',
  'app.nextRefresh': 'refresh in {0}s',
  'app.dash': '—',
  'pace.ahead': 'Ahead of pace',
  'pace.onTrack': 'On track',
  'pace.relaxed': 'Comfortable',
  'hero.projection': 'At this pace: ~{0}% by reset',
  'stats.total': 'Total {0}',
  'stats.avg': 'Avg {0}',
  'stats.peak': 'Peak {0} ({1})',
  'feed.title': 'Live Activity',
  'feed.empty': 'No activity yet. Usage events appear here as your quota changes.',
  'feed.weekly': 'Weekly quota',
  'feed.window': 'Rate window',
  'feed.more': 'View all activity',
  'feed.collapse': 'Collapse',
  'chart.view.bars': 'Bars',
  'chart.view.area': 'Area',
  'btn.refresh': 'Refresh',
  'btn.settings': 'Settings',
  'btn.console': 'Console',
  'btn.language.tooltip': 'Switch to 中文',
  'btn.clearHistory': 'Clear history',
  'btn.clearHistory.tooltip': 'Clear auto-tracked history',
  'btn.details': 'Details',
  'btn.signOut': 'Sign out',
  'banner.authFailed': 'Authentication failed. Please run <code>Kimi Usage: Sign In</code> or update your API key.',
  'banner.error': 'Error: {0}',
  'card.weeklyUsed': 'Weekly used',
  'card.weeklyResetIn': 'Weekly resets in',
  'card.weeklyCycle': '7-day cycle',
  'card.windowUsed': 'Rate window used',
  'card.windowRemaining': 'Window remaining',
  'card.windowResetsIn': 'Resets in {0}',
  'card.windowHint': 'Short-term rate-limit allowance (auto-resets every few minutes)',
  'card.parallelLimit': 'Parallel limit',
  'card.parallelSub': 'Concurrent requests',
  'card.weeklyRemaining': 'Weekly remaining',
  'card.remainingPct': 'remaining {0}%',
  'card.requests.one': '{0} request',
  'card.requests.other': '{0} requests',
  'tab.today': 'Last 24h',
  'tab.week': 'Last 7 days',
  'chart.title.today': 'Last 24 hours',
  'chart.title.week': 'Last 7 days',
  'chart.metric.weekly': 'Weekly usage',
  'chart.metric.window': 'Window usage',
  'chart.metric.samples': 'Samples',
  'chart.tooltip.weekly': '{0}: {1} weekly tokens',
  'chart.empty': 'No usage data in this period.',
  'table.col.hour': 'Hour',
  'table.col.date': 'Date',
  'table.col.weeklyDelta': 'Weekly',
  'table.col.windowDelta': 'Window',
  'table.col.samples': 'Samples',
  'noData': 'No usage recorded yet for this period. Snapshots are captured on every quota refresh.',
  'footer': 'Total log entries: {0} · Retained for 7 days',
  'footer.security': 'All data is computed & stored locally only',
  'script.weeklyShort': 'Weekly',
  'script.windowShort': 'Window',
  'script.samplesShort': 'Samples'
};

const zhCN: Dict = {
  'app.title': 'Kimi 用量监控',
  'app.subtitle': '为您提供 Kimi 用量的实时统计与分析',
  'app.monitoring': '实时监控中',
  'app.lastUpdated': '上次更新',
  'app.updatedJustNow': '刚刚',
  'app.updatedMinutesAgo': '{0} 分钟前',
  'app.updatedHoursAgo': '{0} 小时前',
  'app.nextRefresh': '{0}s 后刷新',
  'app.dash': '—',
  'pace.ahead': '节奏偏快',
  'pace.onTrack': '节奏正常',
  'pace.relaxed': '节奏充裕',
  'hero.projection': '按当前节奏，本周预计用到 {0}%',
  'stats.total': '合计 {0}',
  'stats.avg': '均值 {0}',
  'stats.peak': '峰值 {0}（{1}）',
  'feed.title': '实时动态',
  'feed.empty': '暂无动态，配额变化后会显示在这里。',
  'feed.weekly': '周配额增量',
  'feed.window': '频限增量',
  'feed.more': '查看全部动态',
  'feed.collapse': '收起',
  'chart.view.bars': '柱状',
  'chart.view.area': '面积',
  'btn.refresh': '刷新',
  'btn.settings': '设置',
  'btn.console': '控制台',
  'btn.language.tooltip': 'Switch to English',
  'btn.clearHistory': '清除历史',
  'btn.clearHistory.tooltip': '清除自动追踪的用量历史',
  'btn.details': '查看明细',
  'btn.signOut': '退出登录',
  'banner.authFailed': '鉴权失败，请执行 <code>Kimi Usage: Sign In</code> 或更新 API Key。',
  'banner.error': '错误：{0}',
  'card.weeklyUsed': '周配额已用',
  'card.weeklyResetIn': '周配额重置',
  'card.weeklyCycle': '7 天周期',
  'card.windowUsed': '频限已用',
  'card.windowRemaining': '频限剩余',
  'card.windowResetsIn': '{0} 后重置',
  'card.windowHint': '短时间窗口内的限速额度（每隔几分钟自动重置）',
  'card.parallelLimit': '并发上限',
  'card.parallelSub': '同时请求数',
  'card.weeklyRemaining': '周配额剩余',
  'card.remainingPct': '剩余 {0}%',
  'card.requests.one': '{0} 次请求',
  'card.requests.other': '{0} 次请求',
  'tab.today': '近 24 小时',
  'tab.week': '近 7 天',
  'chart.title.today': '近 24 小时',
  'chart.title.week': '近 7 天',
  'chart.metric.weekly': '周配额增量',
  'chart.metric.window': '频限增量',
  'chart.metric.samples': '采样次数',
  'chart.tooltip.weekly': '{0}：{1} 周配额 tokens',
  'chart.empty': '该时段暂无用量数据',
  'table.col.hour': '小时',
  'table.col.date': '日期',
  'table.col.weeklyDelta': '周配额',
  'table.col.windowDelta': '频限',
  'table.col.samples': '采样',
  'noData': '该时段暂无用量记录。每次配额刷新会生成一次快照。',
  'footer': '共 {0} 条记录 · 保留 7 天',
  'footer.security': '数据仅在本地计算与存储',
  'script.weeklyShort': '周配额',
  'script.windowShort': '频限',
  'script.samplesShort': '采样'
};

const dictionaries: Record<Locale, Dict> = { 'en': en, 'zh-CN': zhCN };

/**
 * Resolve the effective locale.
 * - 'auto': pick zh-CN if VS Code UI language starts with 'zh', else en.
 * - 'en' / 'zh-CN': honor explicit setting.
 */
export function resolveLocale(setting: LanguageSetting | undefined, vscodeLang?: string): Locale {
  if (setting === 'en' || setting === 'zh-CN') return setting;
  const lang = (vscodeLang ?? 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

/** Build a translator bound to the given locale. */
export function makeT(locale: Locale): (key: string, ...params: Array<string | number>) => string {
  const dict = dictionaries[locale] ?? en;
  return (key, ...params) => {
    const raw = dict[key] ?? en[key] ?? key;
    if (params.length === 0) return raw;
    return raw.replace(/\{(\d+)\}/g, (_, i) => {
      const v = params[Number(i)];
      return v === undefined ? '' : String(v);
    });
  };
}
