import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE } from "@/lib/api/activities-markdown-import";
import { markdownActions } from "@/server-fcts/markdown";
import { CheckIcon, XIcon } from "../assets";
import { Textarea } from "../Forms";
import { Modal, ModalContent } from ".";

export const MarkdownModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const importMarkdown = useServerFn(markdownActions.importActivitiesMarkdown);

  const { isCopied, copy } = useCopyToClipboard();

  const [uploadMarkdown, setUploadMarkdown] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadIssues, setUploadIssues] = useState<
    { line?: number; message: string }[]
  >([]);

  const importMarkdownMutation = useMutation({
    mutationFn: () => importMarkdown({ data: { markdown: uploadMarkdown } }),
    onMutate: () => {
      setUploadError(null);
      setUploadIssues([]);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setUploadError(result.error);
        setUploadIssues(result.issues);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity-viz"] });
      onClose();
    },
    onError: (e) => {
      setUploadError(e instanceof Error ? e.message : "Import failed");
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || importMarkdownMutation.isPending) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importMarkdownMutation.isPending, onClose]);

  return (
    <Modal onClose={onClose}>
      <ModalContent>
        <div className="flex items-start justify-between  pb-6">
          <h2
            id="activities-link-all-title"
            className="text-lg font-semibold text-zinc-100"
          >
            Upload planned workouts (markdown)
          </h2>
          <button type="button" onClick={onClose}>
            <XIcon className="size-4" />
          </button>
        </div>

        <Textarea
          value={uploadMarkdown}
          onChange={(e) => {
            const next = e.target.value;
            setUploadMarkdown(next.trim() === "" ? "" : next);
          }}
          placeholder={ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE}
          rows={14}
          className="min-h-48 w-full resize-y rounded border border-zinc-700/80 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          spellCheck={false}
        />
        {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}
        {uploadIssues.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs text-amber-200/90">
            {uploadIssues.map((iss) => (
              <li key={`${iss.line ?? "row"}-${iss.message}`}>
                {iss.line != null ? (
                  <span className="tabular-nums text-zinc-500">
                    Line {iss.line}:{" "}
                  </span>
                ) : null}
                {iss.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800/80 pt-3 mt-3">
          <button
            type="button"
            disabled={importMarkdownMutation.isPending}
            onClick={() => copy(ACTIVITIES_PLANNED_MARKDOWN_TEMPLATE)}
            className="mr-auto h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            {isCopied ? (
              <CheckIcon className="size-4 stroke-green-400" />
            ) : (
              <span>Copy template</span>
            )}
          </button>
          <button
            type="button"
            disabled={importMarkdownMutation.isPending}
            onClick={onClose}
            className="h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              importMarkdownMutation.isPending || uploadMarkdown.trim() === ""
            }
            onClick={() => importMarkdownMutation.mutate()}
            className="h-8 rounded border border-emerald-600/60 bg-emerald-950/35 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-950/55 disabled:opacity-50"
          >
            {importMarkdownMutation.isPending ? "Importing…" : "Import"}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
};
