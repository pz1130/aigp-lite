import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ModelCard({
  md,
  emptyText,
}: {
  md: string;
  emptyText: string;
}) {
  if (!md.trim())
    return <p className="text-secondary text-small">{emptyText}</p>;
  return (
    <article className="prose prose-zinc max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </article>
  );
}
