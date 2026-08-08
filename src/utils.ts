import * as vscode from 'vscode';
import { KimiConfig, KimiOAuthCredentials, LanguageSetting } from './types';

const SECRET_API_KEY = 'kimiUsage.apiKey';
const SECRET_OAUTH = 'kimiUsage.oauthCredentials';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Kimi Usage');
  }
  return outputChannel;
}

export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}

export function log(message: string): void {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const line = `[${ts}] ${message}`;
  getOutputChannel().appendLine(line);
}

export function getConfig(): KimiConfig {
  const cfg = vscode.workspace.getConfiguration('kimiUsage');
  const lang = cfg.get<LanguageSetting>('language', 'auto');
  return {
    refreshIntervalSeconds: cfg.get<number>('refreshIntervalSeconds', 60),
    language: (['auto', 'en', 'zh-CN'].includes(lang) ? lang : 'auto') as LanguageSetting
  };
}

export async function readApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_API_KEY);
}

export async function writeApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store(SECRET_API_KEY, key);
}

export async function deleteApiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_API_KEY);
}

export async function readOAuth(secrets: vscode.SecretStorage): Promise<KimiOAuthCredentials | undefined> {
  const raw = await secrets.get(SECRET_OAUTH);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as KimiOAuthCredentials;
  } catch {
    return undefined;
  }
}

export async function writeOAuth(secrets: vscode.SecretStorage, creds: KimiOAuthCredentials): Promise<void> {
  await secrets.store(SECRET_OAUTH, JSON.stringify(creds));
}

export async function deleteOAuth(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_OAUTH);
}

export function toInt(s: string | undefined): number {
  const n = parseInt(s ?? '', 10);
  return isNaN(n) ? 0 : n;
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/** Shared pace thresholds (percentage points of used vs elapsed). */
export const PACE_AHEAD_DELTA = 5;
export const PACE_RELAXED_DELTA = -5;

export type PaceLevel = 'ahead' | 'onTrack' | 'relaxed';

export function paceLevel(usedPct: number, elapsedPct: number): PaceLevel {
  const delta = usedPct - elapsedPct;
  if (delta > PACE_AHEAD_DELTA) return 'ahead';
  if (delta < PACE_RELAXED_DELTA) return 'relaxed';
  return 'onTrack';
}

/** Hours remaining until `resetAt` (ms epoch), or null if unknown. */
export function hoursUntil(resetAt: number | null | undefined): number | null {
  if (resetAt === null || resetAt === undefined || !Number.isFinite(resetAt)) return null;
  return (resetAt - Date.now()) / 3_600_000;
}

/** Elapsed % of a 7-day (168h) weekly cycle given hours remaining until reset. */
export function weeklyElapsedPct(resetHours: number): number {
  const remain = Math.max(0, resetHours);
  const elapsedHours = Math.min(168, Math.max(0, 168 - remain));
  return Math.round((elapsedHours / 168) * 100);
}
