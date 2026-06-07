import type { Metadata } from "next";
import "./globals.css";
import "./reference.css";

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
