interface ToolChipProps {
  name: string;
  compact?: boolean;
}

export default function ToolChip({ name, compact = false }: ToolChipProps) {
  return (
    <span
      className={`inline-block rounded-md border border-slate-200 bg-slate-50 font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      }`}
    >
      {name}
    </span>
  );
}
