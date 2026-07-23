import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quecircle — Trusted movie recommendations",
  description: "Discover, share, and rate movie and TV recommendations with the people who know your taste.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ClerkProvider>{children}</ClerkProvider></body></html>;
}
