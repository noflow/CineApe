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
  vote_average?: number;
};

const poster = (path?: string | null, size = "w500") => path ? `${IMAGE_BASE}/${size}${path}` : null;

export async function GET(request: Request) {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim().slice(0, 80);
  const mode = params.get("mode");
  const id = Number(params.get("id"));
  const type = params.get("type") === "tv" ? "tv" : "movie";
  const edgeCountry = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country");
  const requestedCountry = params.get("country")?.toUpperCase();
  const country = edgeCountry === "CA" || edgeCountry === "US" ? edgeCountry : requestedCountry === "CA" ? "CA" : "US";
  if (!token) return Response.json({ configured: false, image: null });

  try {
    if (mode === "home") {
      const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
      const [moviesResponse, showsResponse] = await Promise.all([
        fetch(`${API_BASE}/movie/now_playing?language=en-US&page=1`, { headers, next: { revalidate: 60 * 60 * 6 } }),
        fetch(`${API_BASE}/tv/on_the_air?language=en-US&page=1`, { headers, next: { revalidate: 60 * 60 * 6 } }),
      ]);
      if (!moviesResponse.ok || !showsResponse.ok) return Response.json({ movies: [], shows: [] }, { status: 502 });
      const [moviesData, showsData] = await Promise.all([moviesResponse.json() as Promise<{ results?: SearchItem[] }>, showsResponse.json() as Promise<{ results?: SearchItem[] }>]);
      const format = (items: SearchItem[], type: "movie" | "tv") => items.filter(item => item.poster_path).slice(0, 8).map(item => ({
        id: item.id, type, title: item.title ?? item.name ?? "Untitled", year: item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null,
        image: poster(item.poster_path), score: item.vote_average ? item.vote_average.toFixed(1) : "—",
      }));
      return Response.json({ movies: format(moviesData.results ?? [], "movie"), shows: format(showsData.results ?? [], "tv") }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=21600" } });
    }
    if (mode === "discover") {
      const requestedType = params.get("type");
      const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
      const endpoints = requestedType === "movie" ? [{ path: "/movie/popular", type: "movie" as const }]
        : requestedType === "tv" ? [{ path: "/tv/popular", type: "tv" as const }]
        : [{ path: "/trending/movie/week", type: "movie" as const }, { path: "/trending/tv/week", type: "tv" as const }];
      const responses = await Promise.all(endpoints.map(async endpoint => ({ endpoint, response: await fetch(`${API_BASE}${endpoint.path}?language=en-US&page=1`, { headers, next: { revalidate: 60 * 60 * 6 } }) })));
      if (responses.some(({ response }) => !response.ok)) return Response.json({ titles: [] }, { status: 502 });
      const collections = await Promise.all(responses.map(async ({ endpoint, response }) => ({ type: endpoint.type, items: (await response.json() as { results?: SearchItem[] }).results ?? [] })));
      const titles = collections.flatMap(collection => collection.items.filter(item => item.poster_path).slice(0, 20).map(item => ({
        id: item.id, type: collection.type, title: item.title ?? item.name ?? "Untitled",
        year: item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null,
        image: poster(item.poster_path), score: item.vote_average ? item.vote_average.toFixed(1) : "—",
      }))).sort((a, b) => Number(b.score) - Number(a.score));
      return Response.json({ titles: titles.slice(0, 24) }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=21600" } });
    }
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
      const providers = data["watch/providers"]?.results?.[country];
      const priority = ["Netflix", "Amazon Prime Video", "Disney Plus", "Apple TV", "Paramount Plus", "Paramount+", "Crave", "Hulu", "Max", "Max Amazon Channel", "Peacock Premium"];
      const streaming = providers?.flatrate ?? [];
      const primaryProvider = [...streaming].sort((a, b) => {
        const aIndex = priority.findIndex(name => a.provider_name === name);
        const bIndex = priority.findIndex(name => b.provider_name === name);
        return (aIndex === -1 ? priority.length : aIndex) - (bIndex === -1 ? priority.length : bIndex);
      })[0] ?? null;
      return Response.json({
        id, type, configured: true, title: data.title ?? data.name ?? "Untitled", overview: data.overview ?? "",
        year: data.release_date?.slice(0, 4) ?? data.first_air_date?.slice(0, 4) ?? null,
        poster: poster(data.poster_path), backdrop: poster(data.backdrop_path, "w1280"),
        tmdbScore: data.vote_average ? Number(data.vote_average.toFixed(1)) : null, tmdbVotes: data.vote_count ?? 0,
        runtime: data.runtime ?? data.episode_run_time?.[0] ?? null, genres: data.genres?.map(genre => genre.name) ?? [],
        trailer: trailer ? `https://www.youtube.com/embed/${trailer.key}` : null,
        cast: data.credits?.cast?.slice(0, 10).map(person => ({ name: person.name, character: person.character ?? "", image: poster(person.profile_path, "w185") })) ?? [],
        country, providers: primaryProvider ? [{ name: primaryProvider.provider_name, image: poster(primaryProvider.logo_path, "w92") }] : [],
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
