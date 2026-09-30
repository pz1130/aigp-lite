"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

interface RuleEditorHelperProps {
  onInsert: (json: string) => void;
}

const TEMPLATES = [
  {
    key: "regex",
    i18nLabel: "tplRegex",
    i18nDesc: "tplRegexDesc",
    json: { regex_match: [{ var: ["text"] }, "PATTERN"] },
  },
  {
    key: "keywords",
    i18nLabel: "tplKeywords",
    i18nDesc: "tplKeywordsDesc",
    json: { contains_any: [{ var: ["text"] }, ["keyword1", "keyword2"]] },
  },
  {
    key: "length",
    i18nLabel: "tplLength",
    i18nDesc: "tplLengthDesc",
    json: { length_gt: [{ var: ["text"] }, 5000] },
  },
  {
    key: "and",
    i18nLabel: "tplAnd",
    i18nDesc: "tplAndDesc",
    json: {
      and: [
        { regex_match: [{ var: ["text"] }, "PATTERN_A"] },
        { contains_any: [{ var: ["text"] }, ["keyword"]] },
      ],
    },
  },
  {
    key: "or",
    i18nLabel: "tplOr",
    i18nDesc: "tplOrDesc",
    json: {
      or: [
        { regex_match: [{ var: ["text"] }, "PATTERN_A"] },
        { contains_any: [{ var: ["text"] }, ["keyword"]] },
      ],
    },
  },
  {
    key: "autonomy",
    i18nLabel: "tplAutonomy",
    i18nDesc: "tplAutonomyDesc",
    json: {
      or: [
        { "==": [{ var: ["usecase.autonomyLevel"] }, "full"] },
        { regex_match: [{ var: ["text"] }, "PATTERN"] },
      ],
    },
  },
] as const;

const CONTEXT_VARS: { var: string; desc: string }[] = [
  { var: "text", desc: "refVarText" },
  { var: "scope", desc: "refVarScope" },
  { var: "usecase.id", desc: "refVarUseCaseId" },
  { var: "usecase.autonomyLevel", desc: "refVarAutonomy" },
  { var: "org.id", desc: "refVarOrgId" },
];

const OPERATORS: { op: string; example: string; desc: string }[] = [
  { op: "regex_match", example: '["text", "pattern"]', desc: "refOpRegex" },
  {
    op: "contains_any",
    example: '["text", ["kw1","kw2"]]',
    desc: "refOpContains",
  },
  { op: "length_gt", example: '["text", 5000]', desc: "refOpLength" },
  { op: "and", example: "[condA, condB]", desc: "refOpAnd" },
  { op: "or", example: "[condA, condB]", desc: "refOpOr" },
  { op: "!", example: "[condition]", desc: "refOpNot" },
  { op: "==", example: '["a", "b"]', desc: "refOpEq" },
  { op: "var", example: '["text"]', desc: "refOpVar" },
];

export function RuleEditorHelper({ onInsert }: RuleEditorHelperProps) {
  const t = useTranslations("policy.ruleHelper");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border-default bg-surface">
      <Button
        type="button"
        variant="ghost"
        className="flex w-full justify-between px-4 py-2.5 text-sm font-medium h-auto rounded-lg"
        onClick={() => setOpen(!open)}
      >
        {t("toggle")}
        <span className="text-xs text-secondary">{open ? "▲" : "▼"}</span>
      </Button>

      {open && (
        <div className="border-t border-border-default px-4 pb-4 pt-3">
          <Tabs defaultValue="templates">
            <TabsList>
              <TabsTrigger value="templates">{t("templates")}</TabsTrigger>
              <TabsTrigger value="reference">{t("reference")}</TabsTrigger>
            </TabsList>

            <TabsContent value="templates">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((tpl) => (
                  <Button
                    variant="secondary"
                    className="flex flex-col items-start text-left h-auto py-3 px-3 group hover:border-accent"
                    onClick={() => onInsert(JSON.stringify(tpl.json, null, 2))}
                  >
                    <span className="font-medium text-primary">
                      {t(tpl.i18nLabel)}
                    </span>
                    <span className="text-xs text-secondary">
                      {t(tpl.i18nDesc)}
                    </span>
                    <span className="mt-auto pt-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                      {t("insert")} →
                    </span>
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="reference">
              <div className="space-y-5 text-sm">
                {/* Context Variables */}
                <div>
                  <h4 className="mb-2 font-medium text-primary">
                    {t("refVars")}
                  </h4>
                  <Table>
                    <TBody>
                      {CONTEXT_VARS.map((v) => (
                        <Tr key={v.var}>
                          <Td className="py-1.5 pr-3 font-mono text-accent">{`{var: ["${v.var}"]}`}</Td>
                          <Td className="py-1.5 text-secondary">{t(v.desc)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>

                {/* Operators */}
                <div>
                  <h4 className="mb-2 font-medium text-primary">
                    {t("refOps")}
                  </h4>
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Operator</Th>
                        <Th>Args</Th>
                        <Th>Description</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {OPERATORS.map((op) => (
                        <Tr key={op.op}>
                          <Td className="py-1.5 pr-3 font-mono text-accent">
                            {op.op}
                          </Td>
                          <Td className="py-1.5 pr-3 font-mono text-secondary">
                            {op.example}
                          </Td>
                          <Td className="py-1.5 text-secondary">
                            {t(op.desc)}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>

                {/* Combinators */}
                <div>
                  <h4 className="mb-1 font-medium text-primary">
                    {t("refCombinators")}
                  </h4>
                  <p className="text-xs text-secondary">
                    {t("refCombinatorsDesc")}
                  </p>
                </div>

                <p className="rounded-md bg-accent-subtle px-3 py-2 text-xs text-accent">
                  {t("refTip")}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
