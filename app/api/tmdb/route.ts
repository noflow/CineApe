const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

type SearchItem = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  poster_path?: string | null;
  profile_path?: string | null;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  known_for_department?: string;
  known_for?: Array<{ title?: string; name?: string }>;
};

const poster = (path?: string | null, size = "w500") => path ? `${IMAGE_BASE}/${size}${path}` : null;

export async function GET(request: Request) {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim().slice(0, 80);
  const mode = params.get("mode");
  const id = Number(params.get("id"));
  const type = params.get("type") === "tv" ? "tv" : "movie";
  if (!token) return Response.json({ configured: false, image: null });

  try {
    if (id) {
      const response = await fetch(`${API_BASE}/${type}/${id}?language=en-US&append_to_response=credits,videos,watch/providers`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        next: { revalidate: 60 * 60 * 12 },
      });
      if (!response.ok) return Response.json({ error: "Title details are unavailable." }, { status: 502 });
      const data = await response.json() as {
        title?: string; name?: string; release_date?: string; first_air_date?: string; overview?: string;
        poster_path?: string | null; backdrop_path?: string | null; vote_average?: number; vote_count?: number;
        runtime?: number; episode_run_time?: number[]; genres?: Array<{ id: number; name: string }>;
        credits?: { cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null }> };
        videos?: { results?: Array<{ key: string; site: string; type: string; official?: boolean }> };
        "watch/providers"?: { results?: Record<string, { flatrate?: Array<{ provider_name: string; logo_path?: string | null }>; rent?: Array<{ provider_name: string; logo_path?: string | null }>; buy?: Array<{ provider_name: string; logo_path?: string | null }>; link?: string }> };
      };
      const trailer = data.videos?.results?.find(video => video.site === "YouTube" && video.type === "Trailer" && video.official)
        ?? data.videos?.results?.find(video => video.site === "YouTube" && video.type === "Trailer");
      const providers = data["watch/providers"]?.results?.US ?? data["watch/providers"]?.results?.CA ?? data["watch/providers"]?.results?.GB;
      const streaming = providers?.flatrate ?? [];
      const paidOptions = [...(providers?.rent ?? []), ...(providers?.buy ?? [])];
      const uniqueProviders = [...streaming, ...paidOptions].filter((provider, index, list) => list.findIndex(item => item.provider_name === provider.provider_name) === index).slice(0, 5);
      return Response.json({
        id, type, configured: true, title: data.title ?? data.name ?? "Untitled", overview: data.overview ?? "",
        year: data.release_date?.slice(0, 4) ?? data.first_air_date?.slice(0, 4) ?? null,
        poster: poster(data.poster_path), backdrop: poster(data.backdrop_path, "w1280"),
        tmdbScore: data.vote_average ? Number(data.vote_average.toFixed(1)) : null, tmdbVotes: data.vote_count ?? 0,
        runtime: data.runtime ?? data.episode_run_time?.[0] ?? null, genres: data.genres?.map(genre => genre.name) ?? [],
        trailer: trailer ? `https://www.youtube.com/embed/${trailer.key}` : null,
        cast: data.credits?.cast?.slice(0, 10).map(person => ({ name: person.name, character: person.character ?? "", image: poster(person.profile_path, "w185") })) ?? [],
        providers: uniqueProviders.map(provider => ({ name: provider.provider_name, image: poster(provider.logo_path, "w92") })), providerLink: providers?.link ?? null,
      }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=43200" } });
    }

    if (!query) return Response.json({ error: "A title query is required." }, { status: 400 });
    const url = new URL(`${API_BASE}/search/multi`);
    url.searchParams.set("query", query);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("include_adult", "false");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return Response.json({ configured: true, image: null }, { status: 502 });
    const data = (await response.json()) as { results?: SearchItem[] };
    if (mode === "search") {
      const results = (data.results ?? []).filter((item) => item.media_type === "movie" || item.media_type === "tv" || item.media_type === "person").slice(0, 10).map(item => {
        const type = item.media_type as "movie" | "tv" | "person";
        const title = item.title ?? item.name ?? "Untitled";
        const year = item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null;
        const knownFor = item.known_for?.map(title => title.title ?? title.name).filter(Boolean).slice(0, 2).join(" · ");
        return {
          id: item.id, type, title, year, image: poster(type === "person" ? item.profile_path : item.poster_path, "w185"),
          subtitle: type === "person" ? `${item.known_for_department ?? "Person"}${knownFor ? ` · ${knownFor}` : ""}` : `${year ?? "—"} · ${type === "tv" ? "TV series" : "Movie"}`,
        };
      });
      return Response.json({ configured: true, results }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
    }
    const match = data.results?.find((item) => (item.media_type === "movie" || item.media_type === "tv") && item.poster_path);
    return Response.json({
      configured: true, image: poster(match?.poster_path), id: match?.id ?? null, type: match?.media_type ?? null,
      title: match?.title ?? match?.name ?? null,
      year: match?.release_date?.slice(0, 4) ?? match?.first_air_date?.slice(0, 4) ?? null,
    }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
  } catch {
    return Response.json({ configured: true, image: null }, { status: 502 });
  }
}
