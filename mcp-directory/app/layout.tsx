import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "MCP Server Directory",
  description:
    "Discover Model Context Protocol servers and the tools they expose. Search, filter, and browse MCP integrations for developers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <a href="/" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm text-white">
                MCP
              </span>
              <span>Server Directory</span>
            </a>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-slate-500 transition hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
            >
              About MCP →
            </a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>MCP Server Directory — community-maintained listing for developers.</p>
        </footer>
      </body>
    </html>
  );
}
