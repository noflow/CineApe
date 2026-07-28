import type { Metadata } from "next";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

export type SeoTitleType = "movie" | "tv";
export type SeoTitle = { id: number; type: SeoTitleType; name: string; year: string | null; overview: string; poster: string | null; backdrop: string | null; score: number | null; votes: number; genres: string[]; runtime: number | null; cast: Array<{ id: number; name: string; character: string; image: string | null }> };

function image(path: string | null | undefined, size: "w500" | "w780" | "w1280" = "w780") { return path ? `${IMAGE_BASE}/${size}${path}` : null; }
export function idFromSlug(slug: string) { const match = slug.match(/^(\d+)(?:-|$)/); return match ? Number(match[1]) : null; }

export async function getSeoTitle(type: SeoTitleType, slug: string): Promise<SeoTitle | null> {
  const id = idFromSlug(slug); const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!id || !token) return null;
  const response = await fetch(`${API_BASE}/${type}/${id}?language=en-US&append_to_response=credits`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, next: { revalidate: 60 * 60 * 12 } });
  if (!response.ok) return null;
  const data = await response.json() as { title?: string; name?: string; release_date?: string; first_air_date?: string; overview?: string; poster_path?: string | null; backdrop_path?: string | null; vote_average?: number; vote_count?: number; runtime?: number; episode_run_time?: number[]; genres?: Array<{ name: string }>; credits?: { cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null }> } };
  return { id, type, name: data.title ?? data.name ?? "Untitled", year: data.release_date?.slice(0, 4) ?? data.first_air_date?.slice(0, 4) ?? null, overview: data.overview ?? "", poster: image(data.poster_path, "w500"), backdrop: image(data.backdrop_path, "w1280"), score: data.vote_average ? Number(data.vote_average.toFixed(1)) : null, votes: data.vote_count ?? 0, genres: data.genres?.map(genre => genre.name) ?? [], runtime: data.runtime ?? data.episode_run_time?.[0] ?? null, cast: data.credits?.cast?.slice(0, 8).map(person => ({ id: person.id, name: person.name, character: person.character ?? "", image: image(person.profile_path, "w500") })) ?? [] };
}

export function seoMetadata(title: SeoTitle, slug: string): Metadata {
  const label = title.type === "tv" ? "TV Series" : "Movie"; const description = title.overview || `Find out whether ${title.name} belongs on your next watchlist with CineApe.`;
  return { title: `${title.name}${title.year ? ` (${title.year})` : ""} ${label} | CineApe`, description, alternates: { canonical: `/${title.type}/${slug}` }, openGraph: { title: `${title.name}${title.year ? ` (${title.year})` : ""} | CineApe`, description, type: "website", url: `/${title.type}/${slug}`, images: title.backdrop || title.poster ? [{ url: title.backdrop ?? title.poster!, alt: `${title.name} artwork` }] : [] } };
}
