"use client";

interface CategoryFilterProps {
  categories: { name: string; count: number }[];
  selected: string;
  onSelect: (category: string) => void;
}

export default function CategoryFilter({
  categories,
  selected,
  onSelect,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      {categories.map(({ name, count }) => {
        const active = selected === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
            }`}
          >
            {name}
            <span className={`ml-1.5 ${active ? "text-violet-200" : "text-slate-400"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
