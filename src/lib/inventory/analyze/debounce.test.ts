import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./index", () => ({
  runAnalysisInBackground: vi.fn(),
}));

import {
  scheduleAnalysisDebounced,
  clearPendingAnalysis,
  _pendingCountForTest,
} from "./debounce";
import { runAnalysisInBackground } from "./index";

const mockRun = runAnalysisInBackground as unknown as ReturnType<typeof vi.fn>;

describe("scheduleAnalysisDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRun.mockClear();
    clearPendingAnalysis();
  });

  afterEach(() => {
    clearPendingAnalysis();
    vi.useRealTimers();
  });

  const args = (usecaseId: string) => ({
    orgId: "org1",
    usecaseId,
    reason: "auto_updated" as const,
    actorId: "user1",
  });

  it("coalesces multiple calls within the window into one run", () => {
    scheduleAnalysisDebounced(args("u1"));
    vi.advanceTimersByTime(5_000);
    scheduleAnalysisDebounced(args("u1"));
    vi.advanceTimersByTime(5_000);
    scheduleAnalysisDebounced(args("u1"));

    expect(mockRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("fires after the window when no further calls arrive", () => {
    scheduleAnalysisDebounced(args("u1"));
    vi.advanceTimersByTime(30_000);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("debounces per-usecase independently", () => {
    scheduleAnalysisDebounced(args("u1"));
    scheduleAnalysisDebounced(args("u2"));
    expect(_pendingCountForTest()).toBe(2);
    vi.advanceTimersByTime(30_000);
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it("clearPendingAnalysis cancels pending runs", () => {
    scheduleAnalysisDebounced(args("u1"));
    scheduleAnalysisDebounced(args("u2"));
    clearPendingAnalysis();
    vi.advanceTimersByTime(60_000);
    expect(mockRun).not.toHaveBeenCalled();
    expect(_pendingCountForTest()).toBe(0);
  });
});
