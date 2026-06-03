import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  Cloud,
  CreditCard,
  Database,
  FileText,
  Figma,
  Folder,
  GitBranch,
  Github,
  Globe,
  HardDrive,
  Image,
  LayoutList,
  ListOrdered,
  MapPin,
  MessageSquare,
  Monitor,
  MonitorPlay,
  Search,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  folder: Folder,
  github: Github,
  "git-branch": GitBranch,
  search: Search,
  globe: Globe,
  database: Database,
  figma: Figma,
  cloud: Cloud,
  boxes: Boxes,
  "message-square": MessageSquare,
  "hard-drive": HardDrive,
  "file-text": FileText,
  "bar-chart": BarChart3,
  "shield-alert": ShieldAlert,
  activity: Activity,
  "credit-card": CreditCard,
  brain: Brain,
  monitor: Monitor,
  "monitor-play": MonitorPlay,
  "layout-list": LayoutList,
  "book-open": BookOpen,
  "list-ordered": ListOrdered,
  image: Image,
  "map-pin": MapPin,
};

const colorMap: Record<string, string> = {
  "Dev Tools": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "Search & Web": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Databases: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Design: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  "Cloud & Infra": "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Communication: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "Data & Analytics": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "Security & Monitoring": "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "Payments & Commerce": "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  "AI & Memory": "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  "Files & Docs": "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Automation: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
};

export function getServerIcon(name: string): LucideIcon {
  return iconMap[name] ?? Boxes;
}

export function getCategoryColor(category: string): string {
  return colorMap[category] ?? "bg-slate-500/15 text-slate-600 dark:text-slate-400";
}
