"use client";

import { useMemo, useState } from "react";
import { servers, type Server } from "@/data/servers";
import SearchBar from "./SearchBar";
import CategoryFilter from "./CategoryFilter";
import ServerCard from "./ServerCard";

export type SortOption = "name" | "tools" | "official";

interface DirectoryClientProps {
  categoryList: { name: string; count: number }[];
}

function matchesQuery(server: Server, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (server.name.toLowerCase().includes(q)) return true;
  if (server.description.toLowerCase().includes(q)) return true;
  if (server.category.toLowerCase().includes(q)) return true;
  if (server.tools.some((t) => t.name.toLowerCase().includes(q))) return true;
  if (server.tools.some((t) => t.description.toLowerCase().includes(q))) return true;
  return false;
}

export default function DirectoryClient({ categoryList }: DirectoryClientProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortOption>("name");

  const filtered = useMemo(() => {
    let list = servers.filter((s) => matchesQuery(s, query));
    if (category !== "All") {
      list = list.filter((s) => s.category === category);
    }
    list = [...list].sort((a, b) => {
      if (sort === "tools") return b.tools.length - a.tools.length;
      if (sort === "official") {
        if (a.official !== b.official) return a.official ? -1 : 1;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [query, category, sort]);

  return (
    <>
      <div className="mb-6">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CategoryFilter
          categories={categoryList}
          selected={category}
          onSelect={setCategory}
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="name">Name A–Z</option>
            <option value="tools">Most tools</option>
            <option value="official">Official first</option>
          </select>
        </label>
      </div>

      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Showing {filtered.length} {filtered.length === 1 ? "server" : "servers"}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-slate-600 dark:text-slate-300">No servers match your filters.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
            className="mt-3 text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </div>
      )}
    </>
  );
}
