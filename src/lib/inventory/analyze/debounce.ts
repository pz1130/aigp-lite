import { runAnalysisInBackground, type AnalyzeArgs } from "./index";

const DEBOUNCE_MS = 30_000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleAnalysisDebounced(args: AnalyzeArgs): void {
  const existing = pending.get(args.usecaseId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pending.delete(args.usecaseId);
    runAnalysisInBackground(args);
  }, DEBOUNCE_MS);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  pending.set(args.usecaseId, timer);
}

export function clearPendingAnalysis(): void {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
}

export function _pendingCountForTest(): number {
  return pending.size;
}
