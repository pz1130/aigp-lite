import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { BUILTIN_PROMPTS, getBuiltinPrompt } from "@/lib/redteam/library";
import { CATEGORIES } from "@/lib/redteam/types";
import type { Category } from "@/lib/redteam/types";
import { imdaCoverage } from "@/lib/redteam/imda-map";
import { isMoonshotEngineEnabled } from "@/lib/redteam/moonshot/config";
import { parseCustomPrompts } from "@/lib/redteam/custom-parser";
import { aggregateModelCard } from "@/lib/redteam/model-card/aggregator";
import { renderMarkdown } from "@/lib/redteam/model-card/markdown";
import { renderModelCardPdf } from "@/lib/redteam/model-card/pdf";
import { isNemoEnabled, getNemoConfig } from "@/lib/redteam/nemo/config";
import { runHitlDemo } from "@/lib/redteam/nemo/hitl-demo";
import { buildEvidenceRow } from "@/lib/redteam/nemo/evidence";

export const redteamRouter = router({
  library: router({
    builtin: orgProcedure.query(({ ctx }) => {
      assertPermission(ctx.session.role, "redteam.read");
      const countsByCategory: Record<string, number> = {};
      for (const c of CATEGORIES) {
        countsByCategory[c] = BUILTIN_PROMPTS.filter(
          (p) => p.category === c,
        ).length;
      }
      // Drop full text from list payload (the detail endpoint returns it).
      const summaries = BUILTIN_PROMPTS.map(({ text: _text, ...rest }) => rest);
      return {
        total: BUILTIN_PROMPTS.length,
        countsByCategory,
        prompts: summaries,
        engineEnabled: isMoonshotEngineEnabled(),
      };
    }),

    builtinDetail: orgProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.read");
        const p = getBuiltinPrompt(input.slug);
        if (!p) throw new TRPCError({ code: "NOT_FOUND" });
        return p;
      }),

    customList: orgProcedure
      .input(z.object({ setName: z.string().optional() }).default({}))
      .query(({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.read");
        return ctx.db.redteamPromptCustom.findMany({
          where: input.setName ? { setName: input.setName } : {},
          orderBy: { createdAt: "desc" },
        });
      }),

    customUpload: orgProcedure
      .input(
        z.object({
          setName: z.string().min(1).max(64),
          format: z.enum(["csv", "jsonl"]),
          text: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.write");
        const { prompts, errors } = parseCustomPrompts(
          input.text,
          input.format,
        );
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errors.slice(0, 10).join("; "),
          });
        }
        if (prompts.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "no valid prompts in upload",
          });
        }

        for (const p of prompts) {
          await ctx.db.redteamPromptCustom.upsert({
            where: {
              orgId_setName_promptId: {
                orgId: ctx.session.orgId,
                setName: input.setName,
                promptId: p.promptId,
              },
            },
            update: {
              category: p.category,
              severity: p.severity,
              text: p.text,
              checker: p.checker,
              expectedBehavior: p.expectedBehavior,
            },
            create: {
              orgId: ctx.session.orgId,
              setName: input.setName,
              promptId: p.promptId,
              category: p.category,
              severity: p.severity,
              text: p.text,
              checker: p.checker,
              expectedBehavior: p.expectedBehavior,
              createdBy: ctx.session.userId,
            },
          });
        }

        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "redteam.library.upload",
          resourceType: "redteam_set",
          resourceId: input.setName,
          after: { count: prompts.length },
        });

        return { uploaded: prompts.length };
      }),

    customDelete: orgProcedure
      .input(z.object({ setName: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.delete");
        const deleted = await ctx.db.redteamPromptCustom.deleteMany({
          where: { setName: input.setName },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "redteam.library.delete",
          resourceType: "redteam_set",
          resourceId: input.setName,
          after: { count: deleted.count },
        });
        return { ok: true, deleted: deleted.count };
      }),
  }),

  runs: router({
    list: orgProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(200).default(50) })
          .default({ limit: 50 }),
      )
      .query(({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.read");
        return ctx.db.evaluation.findMany({
          orderBy: { createdAt: "desc" },
          take: input.limit,
        });
      }),

    get: orgProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.read");
        const ev = await ctx.db.evaluation.findFirst({
          where: { id: input.id },
        });
        if (!ev) throw new TRPCError({ code: "NOT_FOUND" });
        const findings = await ctx.db.evaluationFinding.findMany({
          where: { evaluationId: ev.id },
          take: 200,
          orderBy: { id: "asc" },
        });
        const categories = [
          ...new Set(findings.map((f) => f.category)),
        ] as Category[];
        return { ...ev, findings, imdaCoverage: imdaCoverage(categories) };
      }),

    linkSystem: orgProcedure
      .input(z.object({ id: z.string(), usecaseId: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.write");
        const run = await ctx.db.evaluation.findFirst({
          where: { id: input.id },
        });
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.usecaseId !== null) {
          const uc = await ctx.db.aiUsecase.findFirst({
            where: { id: input.usecaseId, orgId: ctx.session.orgId },
          });
          if (!uc) throw new TRPCError({ code: "NOT_FOUND" });
        }
        const updated = await ctx.db.evaluation.update({
          where: { id: input.id },
          data: { usecaseId: input.usecaseId },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "redteam.run.link_system",
          resourceType: "evaluation",
          resourceId: input.id,
          after: { usecaseId: input.usecaseId },
        });
        return updated;
      }),
  }),

  modelCard: router({
    generate: orgProcedure
      .input(
        z.object({
          usecaseId: z.string(),
          format: z.enum(["markdown", "pdf"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.write");
        const user = await ctx.db.user.findUniqueOrThrow({
          where: { id: ctx.session.userId },
        });
        const data = await aggregateModelCard({
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          generatedBy: { id: user.id, name: user.name ?? user.email },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "redteam.modelcard.generate",
          resourceType: "model_card",
          resourceId: input.usecaseId,
          after: { format: input.format },
        });
        if (input.format === "markdown") {
          return { markdown: renderMarkdown(data) };
        }
        const pdfBuf = await renderModelCardPdf(data);
        return { pdfBase64: pdfBuf.toString("base64") };
      }),
  }),

  nemoHitl: router({
    run: orgProcedure
      .input(z.object({ obligationCode: z.string().default("ART-14") }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "redteam.write");
        if (!isNemoEnabled()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "NeMo sidecar not configured",
          });
        }
        const demo = await runHitlDemo({ cfg: getNemoConfig() });
        const row = buildEvidenceRow({
          orgId: ctx.session.orgId,
          userId: ctx.session.userId,
          obligationCode: input.obligationCode,
          configRef: "nemo-configs/hitl-killswitch",
          demo,
        });
        const created = await ctx.db.nemoGuardrailEvidence.create({
          data: row,
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "redteam.nemo.hitl_demo",
          resourceType: "nemo_guardrail_evidence",
          resourceId: created.id,
          after: {
            obligationCode: input.obligationCode,
            approvalGatePassed: demo.approvalGate.passed,
            killSwitchPassed: demo.killSwitch.passed,
          },
        });
        return { ...demo, evidenceId: created.id };
      }),
  }),
});
