import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CineApe",
    short_name: "CineApe",
    description: "Discover, share, and track movie and TV picks with your Circle.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7fa",
    theme_color: "#6e4df6",
    icons: [
      { src: "/cineape-pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/cineape-pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
