"use client";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export interface TemplateStepInput {
  stepName: string;
  assigneeRole: string;
  assigneeUserId: string;
  instructions: string;
}

const ROLES = [
  { value: "", label: "—" },
  { value: "admin", label: "Admin" },
  { value: "risk_officer", label: "Risk Officer" },
  { value: "ai_owner", label: "AI Owner" },
  { value: "security_team", label: "Security Team" },
  { value: "legal", label: "Legal" },
  { value: "compliance", label: "Compliance" },
];

interface SortableStepProps {
  id: string;
  step: TemplateStepInput;
  index: number;
  onChange: (index: number, updated: Partial<TemplateStepInput>) => void;
  onRemove: (index: number) => void;
}

function SortableStep({
  id,
  step,
  index,
  onChange,
  onRemove,
}: SortableStepProps) {
  const t = useTranslations("workflow.templates.form");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-border-default bg-surface p-4 ${isDragging ? "opacity-50 shadow-md" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-2 cursor-grab text-tertiary hover:text-secondary active:cursor-grabbing"
          title={t("dragToReorder")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-small font-medium text-tertiary">
              {index + 1}.
            </span>
            <Input
              type="text"
              aria-label={t("stepNamePlaceholder")}
              className="flex-1"
              placeholder={t("stepNamePlaceholder")}
              value={step.stepName}
              onChange={(e) => onChange(index, { stepName: e.target.value })}
              maxLength={80}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 text-tertiary hover:text-danger hover:bg-danger/10"
              onClick={() => onRemove(index)}
              title={t("delete")}
            >
              <Trash2 size={14} />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                {t("assigneeRole")}
              </label>
              <Select
                value={step.assigneeRole}
                onValueChange={(v) => onChange(index, { assigneeRole: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                {t("instructions")}
              </label>
              <Input
                type="text"
                placeholder={t("instructionsPlaceholder")}
                value={step.instructions}
                onChange={(e) =>
                  onChange(index, { instructions: e.target.value })
                }
                maxLength={500}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemplateBuilderProps {
  steps: TemplateStepInput[];
  onChange: (steps: TemplateStepInput[]) => void;
}

export function TemplateBuilder({ steps, onChange }: TemplateBuilderProps) {
  const t = useTranslations("workflow.templates.form");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex((_, i) => `step-${i}` === active.id);
      const newIndex = steps.findIndex((_, i) => `step-${i}` === over.id);
      onChange(arrayMove(steps, oldIndex, newIndex));
    }
  };

  const handleChange = (index: number, updated: Partial<TemplateStepInput>) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...updated } : s)));
  };

  const handleRemove = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([
      ...steps,
      { stepName: "", assigneeRole: "", assigneeUserId: "", instructions: "" },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-small font-semibold text-accent">{t("steps")}</h3>
        <Button variant="ghost" size="sm" type="button" onClick={handleAdd}>
          <Plus size={14} />
          {t("addStep")}
        </Button>
      </div>

      {steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default py-8 text-center">
          <p className="text-small text-secondary">{t("noSteps")}</p>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="mt-2"
            onClick={handleAdd}
          >
            <Plus size={14} />
            {t("addStep")}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={steps.map((_, i) => `step-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {steps.map((step, index) => (
                <SortableStep
                  key={`step-${index}`}
                  id={`step-${index}`}
                  step={step}
                  index={index}
                  onChange={handleChange}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
