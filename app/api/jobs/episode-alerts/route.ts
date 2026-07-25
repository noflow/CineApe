import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { notifications, titles, userTitleStates } from "../../../db/schema";

const API_BASE = "https://api.themoviedb.org/3";
const RECENT_AIRING_WINDOW_DAYS = 8;

type WatchingEntry = { userId: string; tmdbId: number; title: string; currentSeason: number | null; currentEpisode: number | null };
type AiredEpisode = { id?: number; season_number?: number; episode_number?: number; air_date?: string | null };

function airedRecently(airDate: string | null | undefined) {
  if (!airDate) return false;
  const aired = new Date(`${airDate}T00:00:00Z`).getTime();
  const today = Date.now();
  const days = (today - aired) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= RECENT_AIRING_WINDOW_DAYS;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!db || !token) return Response.json({ error: "Episode alerts are not configured." }, { status: 503 });

  const watching = await db.select({
    userId: userTitleStates.userId,
    tmdbId: titles.tmdbId,
    title: titles.name,
    currentSeason: userTitleStates.currentSeason,
    currentEpisode: userTitleStates.currentEpisode,
  }).from(userTitleStates).innerJoin(titles, eq(userTitleStates.titleId, titles.id))
    .where(and(eq(userTitleStates.status, "watching"), eq(titles.type, "tv"))) as WatchingEntry[];

  const byShow = new Map<number, WatchingEntry[]>();
  for (const entry of watching) byShow.set(entry.tmdbId, [...(byShow.get(entry.tmdbId) ?? []), entry]);

  let alertsCreated = 0;
  for (const [tmdbId, watchers] of byShow) {
    try {
      const response = await fetch(`${API_BASE}/tv/${tmdbId}?language=en-US`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!response.ok) continue;
      const show = await response.json() as { last_episode_to_air?: AiredEpisode | null };
      const latest = show.last_episode_to_air;
      const latestSeason = latest?.season_number ?? 0;
      const latestEpisode = latest?.episode_number ?? 0;
      if (!latestSeason || !latestEpisode || !airedRecently(latest?.air_date)) continue;

      for (const watcher of watchers) {
        const newSeason = latestSeason > (watcher.currentSeason ?? 0);
        const aheadInSeason = latestSeason === (watcher.currentSeason ?? latestSeason) && latestEpisode > (watcher.currentEpisode ?? 0);
        if (!newSeason && !aheadInSeason) continue;

        const link = newSeason ? `season:${tmdbId}:s${latestSeason}` : `episode:${tmdbId}:s${latestSeason}:e${latestEpisode}`;
        const [existing] = await db.select({ id: notifications.id }).from(notifications)
          .where(and(eq(notifications.userId, watcher.userId), eq(notifications.link, link))).limit(1);
        if (existing) continue;

        const message = newSeason
          ? `A new season of ${watcher.title} has started — Season ${latestSeason} is now airing.`
          : `A new episode of ${watcher.title} is out — Season ${latestSeason}, Episode ${latestEpisode}.`;
        await db.insert(notifications).values({ userId: watcher.userId, kind: "episode", message, link });
        alertsCreated += 1;
      }
    } catch { /* One unavailable TMDB title must not stop the daily alert run. */ }
  }

  return Response.json({ checkedShows: byShow.size, alertsCreated });
}
