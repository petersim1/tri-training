import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  useMemo,
} from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessageItem } from "@/types/responses/chats";

type Tone = "user" | "assistant";

function textFromNodes(node: ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromNodes).join("");
  }
  if (
    isValidElement<{ children?: ReactNode }>(node) &&
    node.props.children != null
  ) {
    return textFromNodes(node.props.children);
  }
  return "";
}

function mdComponentsForTone(tone: Tone): Components {
  const user = tone === "user";
  const bodyText = user ? "text-white" : "text-zinc-100";
  const quiet = user ? "text-emerald-100/90" : "text-zinc-400";
  const inlineCode = user
    ? "rounded bg-emerald-900/85 px-[0.35em] py-[0.12em] text-[0.93em]"
    : "rounded border border-zinc-700/80 bg-black/35 px-[0.35em] py-[0.12em] text-[0.93em]";

  const blockShell = user
    ? "my-2 max-h-[min(40vh,16rem)] max-w-[min(19rem,calc(100vw-10rem))] overflow-x-auto overflow-y-auto rounded-lg bg-emerald-950/90 px-3 py-2.5 text-[12.65px] leading-relaxed [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:thin] first:mt-0 last:mb-0 sm:max-w-none"
    : "my-2 max-h-[min(40vh,16rem)] max-w-[min(19rem,calc(100vw-10rem))] overflow-x-auto overflow-y-auto rounded-lg bg-black/40 px-3 py-2.5 text-[12.65px] leading-relaxed ring-1 ring-zinc-800/95 [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:thin] first:mt-0 last:mb-0 sm:max-w-none";

  return {
    p: ({ children }) => (
      <p className={`my-2 first:mt-0 last:mb-0 ${bodyText}`}>{children}</p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-inherit">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ children, href }) => (
      <a
        href={href ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={
          user
            ? "font-medium text-emerald-50 underline decoration-emerald-200/60 underline-offset-2 hover:text-white"
            : "font-medium text-emerald-400 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-300"
        }
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className={`my-2 list-disc pl-5 first:mt-0 last:mb-0 ${bodyText}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-2 list-decimal pl-5 first:mt-0 last:mb-0 ${bodyText}`}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={`my-2 border-l-2 pl-3 first:mt-0 last:mb-0 ${user ? "border-white/35 text-emerald-50" : "border-zinc-600 text-zinc-300"} [&_p]:my-1`}
      >
        {children}
      </blockquote>
    ),
    h1: ({ children }) => (
      <h1
        className={`mb-2 mt-3 font-semibold tracking-tight text-[16px] first:mt-0 last:mb-0 ${user ? "text-white" : "text-zinc-50"}`}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={`mb-2 mt-3 font-semibold tracking-tight text-[15px] first:mt-0 last:mb-0 ${user ? "text-white" : "text-zinc-50"}`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`mb-1.5 mt-3 font-semibold text-[14px] first:mt-0 last:mb-0 ${user ? "text-white" : "text-zinc-50"}`}
      >
        {children}
      </h3>
    ),
    hr: () => (
      <hr
        className={`my-3 ${user ? "border-white/28" : "border-zinc-700/95"}`}
      />
    ),
    pre: ({ children }) => (
      <pre className={`${blockShell} font-mono wrap-anywhere`}>{children}</pre>
    ),
    code: ({ className, children }) => {
      const cls = typeof className === "string" ? className : "";
      const fenced = /\blanguage-[\w+#.-]+\b/.test(cls);
      const content = textFromNodes(children);
      const multiline = content.includes("\n");
      const isBlockLike = fenced || multiline;

      if (isBlockLike) {
        return (
          <code
            className={`block whitespace-pre font-mono wrap-anywhere ${bodyText}`}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={`font-mono wrap-anywhere ${inlineCode}`}>
          {children}
        </code>
      );
    },
    table: ({ children }) => (
      <div className="my-2 max-w-full overflow-x-auto first:mt-0 last:mb-0">
        <table className="w-max min-w-full border-collapse text-left">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead
        className={
          user
            ? "border-b border-emerald-700/95"
            : "border-b border-zinc-600/98"
        }
      >
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th
        className={`px-2 pb-2 pt-1 text-left align-bottom text-[11.75px] font-semibold uppercase tracking-wide ${quiet}`}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className={`border-t px-2 py-1.5 align-top text-[12.85px] ${bodyText} ${user ? "border-emerald-800/85" : "border-zinc-800/98"}`}
      >
        {children}
      </td>
    ),
  };
}

const REMARK_PLUGINS = [remarkGfm];

export function ChatMarkdownBody(props: {
  tone: Tone;
  text: string;
}): ReactElement | null {
  const components = useMemo(
    () => mdComponentsForTone(props.tone),
    [props.tone],
  );

  if (!props.text.trim()) {
    return null;
  }

  return (
    <div className="-my-px min-w-0 wrap-break-word text-[13.75px] leading-snug **:max-w-none">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {props.text}
      </ReactMarkdown>
    </div>
  );
}

type Props = {
  bubble: "user" | "assistant";
  text: string;
  contextLine?: string | null;
  proposalSet?: ChatMessageItem["proposalSet"];
  onProposalSubmit?: (approved: boolean) => Promise<void>;
};

export const MessageBubble: React.FC<Props> = ({
  bubble,
  text,
  contextLine,
  proposalSet,
  onProposalSubmit,
}) => {
  const body =
    text.trim() !== "" ? <ChatMarkdownBody tone={bubble} text={text} /> : null;
  const showCtx = Boolean(contextLine?.trim());

  return (
    <div
      className={
        bubble === "user"
          ? showCtx
            ? "flex flex-col items-end gap-1 pl-10 pr-0.5"
            : "flex justify-end pl-10 pr-0.5"
          : "flex flex-col items-start gap-2 pr-9 pl-0.5"
      }
    >
      <div
        className={
          bubble === "user"
            ? "inline-block max-w-[min(19rem,calc(100vw-8rem))] rounded-[20px] rounded-br-md bg-emerald-600 px-[0.9rem] py-[0.65rem] text-[13.75px] font-normal leading-snug text-white shadow-[0_10px_30px_-12px_rgba(16,185,129,0.55)] ring-[0.5px] ring-emerald-300/55"
            : "inline-block max-w-[min(21rem,calc(100vw-8rem))] rounded-[20px] rounded-bl-md border border-zinc-700/60 bg-zinc-800/94 px-[0.92rem] py-[0.65rem] text-[13.75px] font-normal leading-snug text-zinc-100 shadow-sm shadow-black/40"
        }
      >
        {body}
      </div>
      {showCtx && (
        <p className="max-w-[min(19rem,calc(100vw-8rem))] text-right text-[10px] leading-snug tracking-tight text-zinc-400">
          {contextLine}
        </p>
      )}
      {proposalSet &&
        proposalSet.length > 0 &&
        (() => {
          const status = proposalSet[0].status;
          const ops = [...new Set(proposalSet.map((p) => p.op))];

          return (
            <div className="w-full max-w-[min(21rem,calc(100vw-8rem))] rounded-2xl border border-zinc-700/60 bg-zinc-900 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Proposal
                </p>
                <p className="text-[10px] text-zinc-500 capitalize">
                  {ops.join(" · ")}
                </p>
              </div>
              {status === "pending" ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onProposalSubmit?.(true)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onProposalSubmit?.(false)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-700"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p
                  className={`text-[12px] font-semibold ${status === "approved" ? "text-emerald-400" : "text-zinc-500"}`}
                >
                  {status === "approved" ? "✓ Accepted" : "✕ Rejected"}
                </p>
              )}
            </div>
          );
        })()}
    </div>
  );
};
