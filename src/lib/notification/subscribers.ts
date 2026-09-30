import {
  workflowEvents,
  type StepAssignedPayload,
  type WorkflowCancelledPayload,
  type GoLiveDecidedPayload,
  type IncidentTrendsAlertPayload,
  type UsecaseDeprecatedPayload,
  type GoLiveStalePayload,
} from "@/lib/events/workflow-bus";
import { McpEventBus, type McpDriftPayload } from "@/lib/events/mcp-bus";
import { prisma } from "@/lib/db";
import { fanoutRecipients, fanoutByPermission } from "./fanout";
import { emailTransport } from "./email";

async function handleStepAssigned(p: StepAssignedPayload) {
  try {
    const recipients = await fanoutRecipients(
      p.orgId,
      p.assigneeUserId,
      p.assigneeRole,
    );
    if (recipients.length === 0) return;

    const usecase = await prisma.aiUsecase.findUnique({
      where: { id: p.usecaseId },
      select: { name: true },
    });
    const usecaseName = usecase?.name ?? "";

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: p.orgId,
        recipientUserId: uid,
        type: "step_assigned" as const,
        titleKey: "stepAssigned.title",
        bodyKey: "stepAssigned.body",
        paramsJson: { usecaseName, stepName: p.stepName },
        linkHref: `/workflow/${p.instanceId}`,
        workflowInstanceId: p.instanceId,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] New approval awaiting you: ${usecaseName}`,
          textBody: `Step: ${p.stepName}\nOpen: /workflow/${p.instanceId}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[notification] handleStepAssigned failed:", err);
  }
}

async function handleWorkflowCancelled(p: WorkflowCancelledPayload) {
  try {
    const usecase = await prisma.aiUsecase.findUnique({
      where: { id: p.usecaseId },
      select: { name: true, ownerId: true },
    });
    if (!usecase) return;

    await prisma.notification.create({
      data: {
        orgId: p.orgId,
        recipientUserId: usecase.ownerId,
        type: "workflow_cancelled",
        titleKey: "workflowCancelled.title",
        bodyKey: "workflowCancelled.body",
        paramsJson: { usecaseName: usecase.name },
        linkHref: `/workflow/${p.instanceId}`,
        workflowInstanceId: p.instanceId,
      },
    });

    await emailTransport.send({
      toUserId: usecase.ownerId,
      subject: `[AIGP] Workflow rejected: ${usecase.name}`,
      textBody: `Your workflow was rejected.${p.comment ? `\nComment: ${p.comment}` : ""}\nOpen: /workflow/${p.instanceId}`,
    });
  } catch (err) {
    console.error("[notification] handleWorkflowCancelled failed:", err);
  }
}

async function handleGoLiveDecided(p: GoLiveDecidedPayload) {
  try {
    const usecase = await prisma.aiUsecase.findUnique({
      where: { id: p.usecaseId },
      select: { name: true, ownerId: true },
    });
    if (!usecase) return;
    if (usecase.ownerId === p.decidedByUserId) return; // suppress self-decision

    await prisma.notification.create({
      data: {
        orgId: p.orgId,
        recipientUserId: usecase.ownerId,
        type: "go_live_decision",
        titleKey: `goLiveDecision.${p.status}.title`,
        bodyKey: `goLiveDecision.${p.status}.body`,
        paramsJson: { usecaseName: usecase.name },
        linkHref: `/inventory/${p.usecaseId}`,
      },
    });

    await emailTransport.send({
      toUserId: usecase.ownerId,
      subject: `[AIGP] Go-live decision (${p.status}): ${usecase.name}`,
      textBody: `A go-live decision was recorded: ${p.status}\nOpen: /inventory/${p.usecaseId}`,
    });
  } catch (err) {
    console.error("[notification] handleGoLiveDecided failed:", err);
  }
}

async function handleIncidentTrendsAlert(p: IncidentTrendsAlertPayload) {
  try {
    const recipients = (
      await fanoutByPermission(p.orgId, "incident-trends.write")
    ).filter((uid) => uid !== p.publishedByUserId);
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: p.orgId,
        recipientUserId: uid,
        type: "incident_trends_alert" as const,
        titleKey: "incidentTrendsAlert.title",
        bodyKey: "incidentTrendsAlert.body",
        paramsJson: { version: p.version, count: p.signalCount },
        linkHref: `/incident-trends/${p.reportId}`,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] Incident trend alert — report v${p.version}`,
          textBody: `${p.signalCount} worsening trend signal(s) detected.\nOpen: /incident-trends/${p.reportId}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[notification] handleIncidentTrendsAlert failed:", err);
  }
}

async function handleUsecaseDeprecated(p: UsecaseDeprecatedPayload) {
  try {
    const usecase = await prisma.aiUsecase.findUnique({
      where: { id: p.usecaseId },
      select: { name: true, ownerId: true },
    });
    if (!usecase) return;

    const writers = await fanoutByPermission(p.orgId, "inventory.write");
    const recipients = [...new Set([usecase.ownerId, ...writers])];
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: p.orgId,
        recipientUserId: uid,
        type: "usecase_deprecated" as const,
        titleKey: "usecaseDeprecated.title",
        bodyKey: "usecaseDeprecated.body",
        paramsJson: { usecaseName: usecase.name },
        linkHref: `/inventory/${p.usecaseId}`,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] System deprecated: ${usecase.name}`,
          textBody: `${usecase.name} has been deprecated.${
            p.sunsetDate ? `\nSunset date: ${p.sunsetDate}` : ""
          }\nOpen: /inventory/${p.usecaseId}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[notification] handleUsecaseDeprecated failed:", err);
  }
}

async function handleGoLiveStale(p: GoLiveStalePayload) {
  try {
    const usecase = await prisma.aiUsecase.findUnique({
      where: { id: p.usecaseId },
      select: { name: true, ownerId: true },
    });
    if (!usecase) return;

    const deciders = await fanoutByPermission(p.orgId, "go-live.approve");
    const recipients = [...new Set([usecase.ownerId, ...deciders])].filter(
      (uid) => uid !== p.triggeredByUserId,
    );
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: p.orgId,
        recipientUserId: uid,
        type: "go_live_decision" as const,
        titleKey: "goLiveDecision.staleApproval.title",
        bodyKey: "goLiveDecision.staleApproval.body",
        paramsJson: { usecaseName: usecase.name },
        linkHref: `/inventory/${p.usecaseId}`,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] Go-live approval stale: ${usecase.name}`,
          textBody: `The go-live approval for ${usecase.name} no longer matches the current capability tier or model version.\nOpen: /inventory/${p.usecaseId}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[notification] handleGoLiveStale failed:", err);
  }
}

async function handleMcpDriftDetected(p: McpDriftPayload) {
  try {
    const recipients = await fanoutByPermission(p.orgId, "mcp.write");
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId: p.orgId,
        recipientUserId: uid,
        type: "mcp_drift_alert" as const,
        titleKey: "mcpDriftAlert.title",
        bodyKey: "mcpDriftAlert.body",
        paramsJson: {
          serverName: p.serverName,
          added: p.addedCount,
          removed: p.removedCount,
          changed: p.changedCount,
        },
        linkHref: `/mcp/${p.serverId}`,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] MCP tool drift detected — ${p.serverName}`,
          textBody: `Toolset changed on MCP server "${p.serverName}": ${p.addedCount} added, ${p.removedCount} removed, ${p.changedCount} changed.\nReview: /mcp/${p.serverId}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[notification] handleMcpDriftDetected failed:", err);
  }
}

workflowEvents.onStepAssigned(handleStepAssigned);
workflowEvents.onWorkflowCancelled(handleWorkflowCancelled);
workflowEvents.onGoLiveDecided(handleGoLiveDecided);
workflowEvents.onIncidentTrendsAlert(handleIncidentTrendsAlert);
workflowEvents.onUsecaseDeprecated(handleUsecaseDeprecated);
workflowEvents.onGoLiveStale(handleGoLiveStale);
McpEventBus.instance.onDriftDetected(handleMcpDriftDetected);
