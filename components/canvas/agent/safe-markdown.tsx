import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Keep model-authored Markdown useful without allowing it to inject HTML,
 * active content, or unsafe URL schemes into the page.
 */
export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  return (
    <div
      className={cn(
        "min-w-0 break-words text-sm leading-6 text-zinc-800",
        "[&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-600",
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold",
        "[&_hr]:my-4 [&_hr]:border-zinc-200",
        "[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:text-zinc-100",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs",
        "[&_td]:border [&_td]:border-zinc-200 [&_td]:p-2 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:p-2 [&_th]:font-semibold",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img", "input"]}
        urlTransform={safeUrlTransform}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents: Components = {
  a({ href, children, title }) {
    if (!href) return <span>{children}</span>;

    const external = /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        title={title}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer nofollow" : undefined}
      >
        {children}
      </a>
    );
  },
  code({ className, children }) {
    return (
      <code
        className={cn(
          "font-mono",
          !className && "rounded bg-zinc-100 px-1 py-0.5 text-[0.9em] text-zinc-800",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-zinc-200">
        <table>{children}</table>
      </div>
    );
  },
};

function safeUrlTransform(value: string) {
  const url = value.trim();
  const isAllowed =
    /^(https?:|mailto:)/i.test(url) ||
    url.startsWith("/") ||
    url.startsWith("./") ||
    url.startsWith("../") ||
    url.startsWith("#") ||
    url.startsWith("?");

  return isAllowed ? defaultUrlTransform(url) : null;
}
