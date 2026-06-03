import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import CopyInstallButton from "@/components/CopyInstallButton";
import { getServerBySlug, servers } from "@/data/servers";
import { getCategoryColor, getServerIcon } from "@/lib/icons";

export function generateStaticParams() {
  return servers.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const server = getServerBySlug(params.slug);
  if (!server) return { title: "Server not found" };
  return {
    title: `${server.name} — MCP Server Directory`,
    description: server.description,
  };
}

function transportLabel(transport: string): string {
  if (transport === "sse") return "SSE (deprecated)";
  return transport.toUpperCase();
}

export default function ServerDetailPage({ params }: { params: { slug: string } }) {
  const server = getServerBySlug(params.slug);
  if (!server) notFound();

  const Icon = getServerIcon(server.icon);
  const colorClass = getCategoryColor(server.category);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </Link>

      <div className="mb-8 flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${colorClass}`}
        >
          <Icon className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            {server.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {server.category}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                server.official
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {server.official ? "Official" : "Community"}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              {transportLabel(server.transport)}
            </span>
          </div>
        </div>
      </div>

      <p className="mb-8 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        {server.description}
      </p>

      {(server.github_url || server.docs_url) && (
        <div className="mb-8 flex flex-wrap gap-3">
          {server.github_url ? (
            <a
              href={server.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          ) : null}
          {server.docs_url ? (
            <a
              href={server.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ExternalLink className="h-4 w-4" />
              Documentation
            </a>
          ) : null}
        </div>
      )}

      {server.install_command ? (
        <div className="mb-10">
          <CopyInstallButton command={server.install_command} />
        </div>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Tools ({server.tools.length})
        </h2>
        <ul className="space-y-3">
          {server.tools.map((tool) => (
            <li
              key={tool.name}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80"
            >
              <code className="font-mono text-sm font-semibold text-violet-600 dark:text-violet-400">
                {tool.name}
              </code>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {tool.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
