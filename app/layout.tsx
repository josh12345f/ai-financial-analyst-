import type { Metadata } from "next";
import "./globals.css";
import "./reference.css";
import "./map.css";
import "./depth.css";
import "./intelligence-extra.css";
import "./osint-layers.css";
import "./visual-upgrade.css";
import "./dcf-terminal.css";

export const metadata: Metadata = {
  title: "World Market Watcher",
  description: "AI global market intelligence terminal"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
