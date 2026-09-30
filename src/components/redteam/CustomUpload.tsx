"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function CustomUpload() {
  const t = useTranslations("redteam.library");
  const [setName, setSetName] = useState("");
  const [format, setFormat] = useState<"csv" | "jsonl">("jsonl");
  const [text, setText] = useState("");
  const upload = trpc.redteam.library.customUpload.useMutation();
  const utils = trpc.useUtils();

  async function onFile(f: File) {
    setText(await f.text());
    if (f.name.endsWith(".csv")) setFormat("csv");
    if (f.name.endsWith(".jsonl") || f.name.endsWith(".ndjson"))
      setFormat("jsonl");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upload.mutateAsync({ setName, format, text });
      alert(t("uploadOk", { defaultValue: "Upload successful" }));
      utils.redteam.library.customList.invalidate();
      setSetName("");
      setText("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-3">
      <Input
        required
        value={setName}
        onChange={(e) => setSetName(e.target.value)}
        placeholder={t("setName", { defaultValue: "Set name" })}
        aria-label="Set name"
      />
      <div className="flex items-center gap-3">
        <Select
          value={format}
          onValueChange={(v) => setFormat(v as "csv" | "jsonl")}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="jsonl">JSONL</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
          </SelectContent>
        </Select>
        <label className="text-sm text-tertiary">
          Accepted: .csv, .jsonl, .ndjson, .txt
        </label>
      </div>
      <Input
        type="file"
        accept=".csv,.jsonl,.ndjson,.txt"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        aria-label="Upload prompt file"
        className="text-sm"
      />
      <Textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("pasteOrUpload", {
          defaultValue: "Paste prompt text here or upload a file above",
        })}
        aria-label="Prompt text"
        className="font-mono text-xs"
      />
      <Button type="submit" disabled={!setName || !text || upload.isPending}>
        {upload.isPending
          ? "Uploading..."
          : t("upload", { defaultValue: "Upload" })}
      </Button>
    </form>
  );
}
