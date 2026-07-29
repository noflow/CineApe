import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cineape.com"),
  title: "CineApe — Trusted movie recommendations",
  description: "Discover, share, and rate movie and TV recommendations with the people who know your taste.",
  manifest: "/manifest.webmanifest",
  applicationName: "CineApe",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CineApe",
  },
  icons: {
    icon: [
      { url: "/cineape-pwa-192.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/cineape-pwa-512.png?v=4", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/cineape-pwa-192.png?v=4",
    apple: "/cineape-apple-touch-icon.png?v=4",
  },
};

export const viewport: Viewport = {
  themeColor: "#6e4df6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ClerkProvider><PwaRegister />{children}</ClerkProvider></body></html>;
}
