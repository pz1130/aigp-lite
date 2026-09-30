import {
  policyEvents,
  type PolicyBlockedPayload,
} from "@/lib/events/policy-bus";
import { prisma } from "@/lib/db";
import { info as logInfo, error as logError } from "@/lib/observability/logger";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";

/**
 * Subscribes to policy.blocked events and auto-creates an incident.
 * Per M6 plan: every blocked LLM call creates an incident record for
 * triage by the risk/audit team.
 */
async function handlePolicyBlocked(payload: PolicyBlockedPayload) {
  const {
    orgId,
    policyId,
    policyName,
    severity,
    snippet,
    usecaseId,
    invocationId,
  } = payload;
  try {
    const severityEnum = (
      ["low", "medium", "high", "critical"].includes(severity)
        ? severity
        : "high"
    ) as "low" | "medium" | "high" | "critical";

    await prisma.incident.create({
      data: {
        orgId,
        title: `Blocked: ${policyName}`,
        severity: severityEnum,
        status: "open",
        rootCause: snippet
          ? `Blocked snippet: ${snippet}`
          : "No snippet captured",
        relatedUsecaseId: usecaseId,
        relatedLlmInvocationId: invocationId,
        openedById: SYSTEM_USER_ID,
      },
    });

    logInfo("incident-subscriber: created incident for blocked policy", {
      orgId,
      policyId,
      policyName,
      severity: severityEnum,
      usecaseId,
      invocationId,
    });
  } catch (err) {
    logError("incident-subscriber: failed to create incident", {
      orgId,
      policyId,
      err: String(err),
    });
  }
}

policyEvents.onBlocked(handlePolicyBlocked);
