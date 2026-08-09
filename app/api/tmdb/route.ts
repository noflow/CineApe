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
  original_language?: string;
};

const poster = (path?: string | null, size = "w500") => path ? `${IMAGE_BASE}/${size}${path}` : null;

export async function GET(request: Request) {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim().slice(0, 80);
  const mode = params.get("mode");
  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), 500);
  const id = Number(params.get("id"));
  const person = params.get("person")?.trim().slice(0, 100);
  const type = params.get("type") === "tv" ? "tv" : "movie";
  const edgeCountry = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country");
  const requestedCountry = params.get("country")?.toUpperCase();
  const country = edgeCountry === "CA" || edgeCountry === "US" ? edgeCountry : requestedCountry === "CA" ? "CA" : "US";
  if (!token) return Response.json({ configured: false, image: null });

  try {
    if (mode === "home") {
      const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
      const period = params.get("period") === "week" ? "week" : "day";
      const requestedMedia = params.get("media");
      const media = requestedMedia === "movie" || requestedMedia === "tv" ? requestedMedia : "all";
      const response = await fetch(`${API_BASE}/trending/${media}/${period}?language=en-US`, { headers, next: { revalidate: 60 * 30 } });
      if (!response.ok) return Response.json({ titles: [] }, { status: 502 });
      const data = await response.json() as { results?: SearchItem[] };
      const titles = (data.results ?? []).map(item => ({ ...item, media_type: media === "all" ? item.media_type : media })).filter(item => (item.media_type === "movie" || item.media_type === "tv") && item.poster_path && (!item.original_language || item.original_language === "en")).slice(0, 20).map(item => ({
        id: item.id,
        type: item.media_type as "movie" | "tv",
        title: item.title ?? item.name ?? "Untitled",
        year: item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null,
        date: item.release_date ?? item.first_air_date ?? null,
        image: poster(item.poster_path),
        score: item.vote_average ? item.vote_average.toFixed(1) : "—",
      }));
      return Response.json({ titles, period, media }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
    }
    if (mode === "discover") {
      const requestedType = params.get("type");
      const category = params.get("category") ?? "all";
      const currentYear = new Date().getUTCFullYear();
      const parseReleaseYear = (value: string | null) => {
        const year = Number(value);
        return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : null;
      };
      const requestedYearFrom = parseReleaseYear(params.get("yearFrom"));
      const requestedYearTo = parseReleaseYear(params.get("yearTo"));
      const yearFrom = requestedYearFrom !== null && requestedYearTo !== null ? Math.min(requestedYearFrom, requestedYearTo) : requestedYearFrom;
      const yearTo = requestedYearFrom !== null && requestedYearTo !== null ? Math.max(requestedYearFrom, requestedYearTo) : requestedYearTo;
      const hasReleaseYearFilter = yearFrom !== null || yearTo !== null;
      const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
      const endpoints = requestedType === "movie" ? [{ path: "/discover/movie", type: "movie" as const }]
        : requestedType === "tv" ? [{ path: "/discover/tv", type: "tv" as const }]
        : [{ path: "/discover/movie", type: "movie" as const }, { path: "/discover/tv", type: "tv" as const }];
      const responses = await Promise.all(endpoints.map(async endpoint => {
        const url = new URL(`${API_BASE}${endpoint.path}`);
        url.searchParams.set("language", "en-US");
        url.searchParams.set("page", String(page));
        url.searchParams.set("region", country);
        url.searchParams.set("with_original_language", "en");
        url.searchParams.set("include_adult", "false");
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
        const dateField = endpoint.type === "movie" ? "primary_release_date" : "first_air_date";
        url.searchParams.set("sort_by", `${dateField}.desc`);
        const genreByType = endpoint.type === "movie"
          ? { action: "28", adventure: "12", animation: "16", comedy: "35", crime: "80", documentary: "99", drama: "18", family: "10751", fantasy: "14", horror: "27", romance: "10749", scifi: "878", thriller: "53" }
          : { action: "10759", animation: "16", comedy: "35", crime: "80", documentary: "99", drama: "18", fantasy: "10765", kids: "10762", mystery: "9648", reality: "10764", scifi: "10765", thriller: "9648" };
        const genre = genreByType[category as keyof typeof genreByType];
        if (genre) url.searchParams.set("with_genres", genre);
        // Keep reality, talk, and news programming out of the regular TV shelves.
        // Reality remains available through its own deliberate filter.
        if (endpoint.type === "tv" && category !== "reality") url.searchParams.set("without_genres", "10764,10763,10767");
        // Recent titles need enough audience signal to prevent the latest
        // low-budget catalog filler from crowding out relevant releases.
        if (category !== "upcoming") {
          const quality = endpoint.type === "movie" ? { votes: "80", score: "5.8" } : { votes: "50", score: "5.6" };
          url.searchParams.set("vote_count.gte", quality.votes);
          url.searchParams.set("vote_average.gte", quality.score);
          // Avoid shorts and most straight-to-catalog filler while keeping
          // feature films, documentaries, and animation that people seek out.
          if (endpoint.type === "movie") url.searchParams.set("with_runtime.gte", "70");
        }
        if (hasReleaseYearFilter) {
          if (yearFrom !== null) url.searchParams.set(`${dateField}.gte`, `${yearFrom}-01-01`);
          if (yearTo !== null) url.searchParams.set(`${dateField}.lte`, `${yearTo}-12-31`);
        } else if (category === "new" || category === "past6months" || category === "pastyear") {
          const date = new Date();
          // "New releases" should feel like the things people are actually
          // hearing about, not every low-traffic title added this week.
          const daysBack = category === "past6months" ? 183 : category === "pastyear" ? 365 : 75;
          date.setDate(date.getDate() - daysBack);
          url.searchParams.set("sort_by", `${dateField}.desc`);
          url.searchParams.set(`${dateField}.gte`, date.toISOString().slice(0, 10));
          url.searchParams.set(`${dateField}.lte`, today);
          if (category === "new") {
            // Movies under an hour are overwhelmingly shorts, specials, or
            // catalog filler rather than the releases CineApe members seek out.
            if (endpoint.type === "movie") url.searchParams.set("with_runtime.gte", "70");
          }
        } else if (category === "upcoming") {
          url.searchParams.set("sort_by", `${dateField}.asc`);
          url.searchParams.set(`${dateField}.gte`, tomorrow);
        } else {
          // Popular and genre browsing should never surface unreleased titles.
          url.searchParams.set(`${dateField}.lte`, today);
        }
        return { endpoint, response: await fetch(url, { headers, next: { revalidate: 60 * 60 * 6 } }) };
      }));
      if (responses.some(({ response }) => !response.ok)) return Response.json({ titles: [] }, { status: 502 });
      const collections = await Promise.all(responses.map(async ({ endpoint, response }) => { const data = await response.json() as { results?: SearchItem[]; total_pages?: number }; return { type: endpoint.type, items: data.results ?? [], totalPages: data.total_pages ?? page }; }));
      const titledResults = collections.flatMap(collection => collection.items.filter(item => item.poster_path && (!item.original_language || item.original_language === "en")).slice(0, 20).map(item => ({
        id: item.id, type: collection.type, title: item.title ?? item.name ?? "Untitled",
        year: item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null,
        releaseDate: item.release_date ?? item.first_air_date ?? "",
        image: poster(item.poster_path), score: item.vote_average ? item.vote_average.toFixed(1) : "—",
      })));
      const sorted = titledResults.sort((a, b) => category === "upcoming" ? a.releaseDate.localeCompare(b.releaseDate) : b.releaseDate.localeCompare(a.releaseDate) || (Number(b.score) || 0) - (Number(a.score) || 0));
      const titles = sorted.slice(0, 24).map(({ releaseDate: _releaseDate, ...title }) => title);
      return Response.json({ titles, page, hasMore: collections.some(collection => page < collection.totalPages) }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=21600" } });
    }
    if (person) {
      const searchUrl = new URL(`${API_BASE}/search/person`);
      searchUrl.searchParams.set("query", person);
      searchUrl.searchParams.set("language", "en-US");
      searchUrl.searchParams.set("include_adult", "false");
      const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
      const searchResponse = await fetch(searchUrl, { headers, next: { revalidate: 60 * 60 * 24 } });
      if (!searchResponse.ok) return Response.json({ error: "Person details are unavailable." }, { status: 502 });
      const searchData = await searchResponse.json() as { results?: Array<{ id: number; name: string; profile_path?: string | null }> };
      const match = searchData.results?.find(item => item.name.toLowerCase() === person.toLowerCase()) ?? searchData.results?.[0];
      if (!match) return Response.json({ error: "Person not found." }, { status: 404 });
      const personResponse = await fetch(`${API_BASE}/person/${match.id}?language=en-US&append_to_response=combined_credits`, { headers, next: { revalidate: 60 * 60 * 24 } });
      if (!personResponse.ok) return Response.json({ error: "Person details are unavailable." }, { status: 502 });
      const data = await personResponse.json() as { name?: string; profile_path?: string | null; known_for_department?: string; biography?: string; combined_credits?: { cast?: Array<{ id: number; media_type?: "movie" | "tv"; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; character?: string }> } };
      const credits = (data.combined_credits?.cast ?? []).filter(item => (item.media_type === "movie" || item.media_type === "tv") && (item.title || item.name)).map(item => ({
        id: item.id, type: item.media_type as "movie" | "tv", title: item.title ?? item.name ?? "Untitled",
        year: item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? null, image: poster(item.poster_path, "w185"), character: item.character ?? "",
      })).sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));
      return Response.json({ id: match.id, name: data.name ?? match.name, image: poster(data.profile_path ?? match.profile_path, "w342"), department: data.known_for_department ?? "Cast", biography: data.biography?.slice(0, 520) ?? "", filmography: { movies: credits.filter(item => item.type === "movie"), tv: credits.filter(item => item.type === "tv") } }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
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
        seasons?: Array<{ season_number?: number; episode_count?: number; name?: string }>;
        networks?: Array<{ name: string; logo_path?: string | null }>;
        credits?: { cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null }> };
        videos?: { results?: Array<{ key: string; site: string; type: string; official?: boolean }> };
        "watch/providers"?: { results?: Record<string, { flatrate?: Array<{ provider_name: string; logo_path?: string | null }>; rent?: Array<{ provider_name: string; logo_path?: string | null }>; buy?: Array<{ provider_name: string; logo_path?: string | null }>; link?: string }> };
      };
      const trailer = data.videos?.results?.find(video => video.site === "YouTube" && video.type === "Trailer" && video.official)
        ?? data.videos?.results?.find(video => video.site === "YouTube" && video.type === "Trailer");
      const providers = data["watch/providers"]?.results?.[country];
      const priority = ["Netflix", "Apple TV", "Disney Plus", "Paramount Plus", "Paramount+", "Crave", "Hulu", "Max", "Peacock Premium", "Amazon Prime Video", "Max Amazon Channel"];
      const streaming = providers?.flatrate ?? [];
      const rankedProvider = [...streaming].sort((a, b) => {
        const aIndex = priority.findIndex(name => a.provider_name === name);
        const bIndex = priority.findIndex(name => b.provider_name === name);
        return (aIndex === -1 ? priority.length : aIndex) - (bIndex === -1 ? priority.length : bIndex);
      })[0] ?? null;
      // For an Apple original, Apple TV is the canonical service even if TMDB also
      // lists it through an Amazon Channel or another secondary subscription path.
      const originalNetwork = type === "tv" ? data.networks?.find(network => /apple\s*tv/i.test(network.name)) : null;
      const appleProvider = streaming.find(provider => /apple\s*tv/i.test(provider.provider_name));
      const primaryProvider = originalNetwork ? appleProvider ?? { provider_name: originalNetwork.name, logo_path: originalNetwork.logo_path } : rankedProvider;
      return Response.json({
        id, type, configured: true, title: data.title ?? data.name ?? "Untitled", overview: data.overview ?? "",
        year: data.release_date?.slice(0, 4) ?? data.first_air_date?.slice(0, 4) ?? null,
        poster: poster(data.poster_path), backdrop: poster(data.backdrop_path, "w1280"),
        tmdbScore: data.vote_average ? Number(data.vote_average.toFixed(1)) : null, tmdbVotes: data.vote_count ?? 0,
        runtime: data.runtime ?? data.episode_run_time?.[0] ?? null, genres: data.genres?.map(genre => genre.name) ?? [],
        seasons: type === "tv" ? (data.seasons ?? []).filter(season => (season.season_number ?? 0) > 0 && (season.episode_count ?? 0) > 0).map(season => ({ season: season.season_number!, episodes: season.episode_count!, name: season.name ?? `Season ${season.season_number}` })) : [],
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
