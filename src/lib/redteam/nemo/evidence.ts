import type { Prisma } from "@/lib/prisma";
import type { HitlDemoResult } from "./hitl-demo";

export interface BuildEvidenceArgs {
  orgId: string;
  userId: string;
  obligationCode: string;
  configRef: string;
  demo: HitlDemoResult;
}

export function buildEvidenceRow(
  args: BuildEvidenceArgs,
): Prisma.NemoGuardrailEvidenceUncheckedCreateInput {
  return {
    orgId: args.orgId,
    obligationCode: args.obligationCode,
    configRef: args.configRef,
    approvalGatePassed: args.demo.approvalGate.passed,
    killSwitchPassed: args.demo.killSwitch.passed,
    transcript: args.demo as unknown as Prisma.InputJsonValue,
    createdBy: args.userId,
  };
}
