import { prisma } from "@/lib/db";
import { fanoutByPermission } from "@/lib/notification/fanout";
import { emailTransport } from "@/lib/notification/email";

/** Fan out a new-report notification to triagers (external-reports.write holders). */
export async function notifyExternalReportReceived(
  orgId: string,
  report: { id: string; title: string; type: string },
): Promise<void> {
  try {
    const recipients = await fanoutByPermission(
      orgId,
      "external-reports.write",
    );
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        orgId,
        recipientUserId: uid,
        type: "external_report_received" as const,
        titleKey: "externalReports.received.title",
        bodyKey: "externalReports.received.body",
        paramsJson: { title: report.title, type: report.type },
        linkHref: `/external-reports/${report.id}`,
      })),
    });

    await Promise.allSettled(
      recipients.map((uid) =>
        emailTransport.send({
          toUserId: uid,
          subject: `[AIGP] New external report: ${report.title}`,
          textBody: `A new ${report.type} report was received.\nOpen: /external-reports/${report.id}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[external-reports] notify failed:", err);
  }
}
