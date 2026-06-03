import DirectoryClient from "@/components/DirectoryClient";
import { getCategoryCounts, servers } from "@/data/servers";

export default function HomePage() {
  const counts = getCategoryCounts();
  const categoryList = [
    { name: "All", count: servers.length },
    ...Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ name, count })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="mb-10 text-center sm:mb-12">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Model Context Protocol
        </p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          MCP Server Directory
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-400">
          Search and discover MCP servers, the tools they expose, and how to connect them to your AI
          workflows.
        </p>
      </section>

      <DirectoryClient categoryList={categoryList} />
    </div>
  );
}
