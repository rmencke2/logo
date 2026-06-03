import Link from "next/link";
import { getCategoryColor, getServerIcon } from "@/lib/icons";
import ToolChip from "./ToolChip";
import type { Server } from "@/data/servers";

interface ServerCardProps {
  server: Server;
}

export default function ServerCard({ server }: ServerCardProps) {
  const Icon = getServerIcon(server.icon);
  const colorClass = getCategoryColor(server.category);
  const visibleTools = server.tools.slice(0, 3);
  const extraCount = server.tools.length - visibleTools.length;

  return (
    <Link
      href={`/server/${server.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-violet-700"
    >
      <div className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorClass}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900 group-hover:text-violet-600 dark:text-slate-100 dark:group-hover:text-violet-400">
              {server.name}
            </h2>
            {server.official ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                Official
              </span>
            ) : null}
          </div>
          <span className="mt-1 inline-block text-xs text-slate-500 dark:text-slate-400">
            {server.category}
          </span>
        </div>
      </div>
      <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {server.description}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visibleTools.map((tool) => (
          <ToolChip key={tool.name} name={tool.name} compact />
        ))}
        {extraCount > 0 ? (
          <span className="self-center text-[10px] font-medium text-slate-400">
            +{extraCount} more
          </span>
        ) : null}
      </div>
    </Link>
  );
}
