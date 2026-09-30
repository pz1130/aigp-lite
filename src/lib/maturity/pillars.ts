export const PILLARS = [
  "mandate_and_scope",
  "structure_and_roles",
  "processes",
  "decision_rights",
  "culture",
  "communication",
] as const;
export type Pillar = (typeof PILLARS)[number];

export interface MaturityQuestion {
  id: string;
  en: string;
  zh: string;
}

export const QUESTIONS: Record<Pillar, MaturityQuestion[]> = {
  mandate_and_scope: [
    {
      id: "ms.1",
      en: "AI principles are documented and approved by leadership.",
      zh: "AI 原则已文档化并经领导层批准。",
    },
    {
      id: "ms.2",
      en: "An AI governance charter exists.",
      zh: "存在 AI 治理章程。",
    },
    {
      id: "ms.3",
      en: "An executive sponsor is named for AI governance.",
      zh: "已任命 AI 治理高管发起人。",
    },
    {
      id: "ms.4",
      en: "Scope of AI governance is defined and reviewed annually.",
      zh: "AI 治理范围已定义并每年复审。",
    },
  ],
  structure_and_roles: [
    {
      id: "sr.1",
      en: "Governance functions for AI are formally assigned.",
      zh: "AI 治理职能已正式分工。",
    },
    {
      id: "sr.2",
      en: "A cross-functional AI governance committee meets regularly.",
      zh: "存在定期开会的跨职能 AI 治理委员会。",
    },
    {
      id: "sr.3",
      en: "Roles for AI risk, security, ethics are explicit.",
      zh: "AI 风险/安全/伦理角色清晰。",
    },
    {
      id: "sr.4",
      en: "Skills gaps for AI governance are identified and closed.",
      zh: "AI 治理技能差距已识别并补齐。",
    },
  ],
  processes: [
    {
      id: "pr.1",
      en: "Use cases go through a documented intake process.",
      zh: "用例走文档化的接入流程。",
    },
    {
      id: "pr.2",
      en: "Risk assessments are repeatable across teams.",
      zh: "各团队的风险评估方法一致可复用。",
    },
    {
      id: "pr.3",
      en: "Continuous monitoring/auditing of AI systems exists.",
      zh: "存在 AI 系统的持续监控/审计。",
    },
    {
      id: "pr.4",
      en: "Incident response procedures cover AI-specific failures.",
      zh: "事件响应流程覆盖 AI 特定失败模式。",
    },
  ],
  decision_rights: [
    {
      id: "dr.1",
      en: "Approval authorities for AI use cases are documented.",
      zh: "AI 用例审批权限已文档化。",
    },
    {
      id: "dr.2",
      en: "Escalation paths for high-risk AI are clear.",
      zh: "高风险 AI 升级路径清晰。",
    },
    {
      id: "dr.3",
      en: "Investment decisions reference governance outputs.",
      zh: "投资决策参考治理产出。",
    },
    {
      id: "dr.4",
      en: "Sunset/retirement decisions are systematic.",
      zh: "下线/退役决策系统化。",
    },
  ],
  culture: [
    {
      id: "cu.1",
      en: "Responsible AI training is provided.",
      zh: "提供负责任 AI 培训。",
    },
    {
      id: "cu.2",
      en: "Reporting concerns about AI is psychologically safe.",
      zh: "对 AI 担忧的反馈在心理上安全。",
    },
    {
      id: "cu.3",
      en: "Innovation and governance are seen as compatible.",
      zh: "创新与治理被视为相容。",
    },
    {
      id: "cu.4",
      en: "Diverse perspectives are sought during AI design.",
      zh: "AI 设计中主动寻求多元视角。",
    },
  ],
  communication: [
    {
      id: "co.1",
      en: "Stakeholders receive regular AI governance updates.",
      zh: "利益相关者定期收到 AI 治理更新。",
    },
    {
      id: "co.2",
      en: "External regulator-ready summaries are produced.",
      zh: "可对外（监管）输出摘要。",
    },
    {
      id: "co.3",
      en: "Internal users are informed when AI is used on them.",
      zh: "对内告知 AI 何时被用于用户。",
    },
    {
      id: "co.4",
      en: "Decisions and rationale are recorded for auditability.",
      zh: "决策与理由可被审计地记录。",
    },
  ],
};

export function maxScoreForPillar(p: Pillar): number {
  return QUESTIONS[p].length * 3; // 12 per pillar
}
