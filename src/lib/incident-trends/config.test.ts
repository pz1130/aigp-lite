import { describe, it, expect, afterEach } from "vitest";
import { getTrendsConfig } from "./config";

const KEYS = [
  "INCIDENT_TRENDS_WINDOW_DAYS",
  "INCIDENT_TRENDS_CLUSTER_THRESHOLD",
  "INCIDENT_TRENDS_MAX_INCIDENTS",
  "INCIDENT_TRENDS_MIN_CLUSTER_SIZE",
  "INCIDENT_TRENDS_ALERT_TOTAL_INCREASE_PCT",
  "INCIDENT_TRENDS_ALERT_MIN_INCIDENT_FLOOR",
  "INCIDENT_TRENDS_ALERT_CLUSTER_MIN_SIZE",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("getTrendsConfig", () => {
  it("returns documented defaults when env is unset", () => {
    expect(getTrendsConfig()).toEqual({
      windowDays: 90,
      clusterThreshold: 0.82,
      maxIncidents: 500,
      minClusterSize: 2,
      insufficientDataFloor: 3,
      alertTotalIncreasePct: 25,
      alertMinIncidentFloor: 3,
      alertClusterMinSize: 3,
    });
  });

  it("reads overrides from env", () => {
    process.env.INCIDENT_TRENDS_WINDOW_DAYS = "30";
    process.env.INCIDENT_TRENDS_CLUSTER_THRESHOLD = "0.9";
    process.env.INCIDENT_TRENDS_MAX_INCIDENTS = "100";
    process.env.INCIDENT_TRENDS_MIN_CLUSTER_SIZE = "3";
    expect(getTrendsConfig()).toMatchObject({
      windowDays: 30,
      clusterThreshold: 0.9,
      maxIncidents: 100,
      minClusterSize: 3,
    });
  });

  it("falls back to the default when an override is non-numeric", () => {
    process.env.INCIDENT_TRENDS_WINDOW_DAYS = "abc";
    expect(getTrendsConfig().windowDays).toBe(90);
  });
});

describe("getTrendsConfig alert knobs", () => {
  afterEach(() => {
    delete process.env.INCIDENT_TRENDS_ALERT_TOTAL_INCREASE_PCT;
    delete process.env.INCIDENT_TRENDS_ALERT_MIN_INCIDENT_FLOOR;
    delete process.env.INCIDENT_TRENDS_ALERT_CLUSTER_MIN_SIZE;
  });

  it("defaults the alert knobs", () => {
    const c = getTrendsConfig();
    expect(c.alertTotalIncreasePct).toBe(25);
    expect(c.alertMinIncidentFloor).toBe(3);
    expect(c.alertClusterMinSize).toBe(3);
  });

  it("reads alert knobs from env", () => {
    process.env.INCIDENT_TRENDS_ALERT_TOTAL_INCREASE_PCT = "40";
    process.env.INCIDENT_TRENDS_ALERT_MIN_INCIDENT_FLOOR = "5";
    process.env.INCIDENT_TRENDS_ALERT_CLUSTER_MIN_SIZE = "4";
    const c = getTrendsConfig();
    expect(c.alertTotalIncreasePct).toBe(40);
    expect(c.alertMinIncidentFloor).toBe(5);
    expect(c.alertClusterMinSize).toBe(4);
  });
});
