"use client";
import { useTranslations } from "next-intl";
import { Pillar } from "@/lib/maturity/pillars";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface PillarQuestionProps {
  pillar: Pillar;
  questions: Array<{ id: string; en: string; zh: string }>;
  onChange: (qid: string, score: number) => void;
}

export function PillarQuestion({
  pillar: _pillar,
  questions,
  onChange,
}: PillarQuestionProps) {
  const t = useTranslations("maturity");

  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <p className="text-body font-medium">{q.en}</p>
          <Select onValueChange={(val) => onChange(q.id, Number(val))}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("selectScore")} />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3].map((score) => (
                <SelectItem key={score} value={String(score)}>
                  {score} — {t(`scoreLabels.${score}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
