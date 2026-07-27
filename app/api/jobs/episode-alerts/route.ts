import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { notifications, titles, userTitleStates } from "../../../db/schema";

const API_BASE = "https://api.themoviedb.org/3";
const RECENT_AIRING_WINDOW_DAYS = 8;

type TrackedEntry = {
  userId: string;
  titleId: string;
  tmdbId: number;
  title: string;
  status: "watching" | "completed";
  currentSeason: number | null;
  currentEpisode: number | null;
  updatedAt: Date;
};
type AiredEpisode = { season_number?: number; episode_number?: number; air_date?: string | null };
type Season = { season_number?: number; air_date?: string | null };

function airedRecently(airDate: string | null | undefined) {
  if (!airDate) return false;
  const aired = new Date(`${airDate}T00:00:00Z`).getTime();
  const days = (Date.now() - aired) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= RECENT_AIRING_WINDOW_DAYS;
}

function premieredAfterCompletion(airDate: string | null | undefined, completedAt: Date) {
  if (!airDate) return false;
  const premiere = new Date(`${airDate}T00:00:00Z`).getTime();
  return premiere > completedAt.getTime() && premiere <= Date.now();
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!db || !token) return Response.json({ error: "Episode alerts are not configured." }, { status: 503 });

  const activeLibrary = await db.select({
    userId: userTitleStates.userId,
    titleId: userTitleStates.titleId,
    tmdbId: titles.tmdbId,
    title: titles.name,
    type: titles.type,
    status: userTitleStates.status,
    currentSeason: userTitleStates.currentSeason,
    currentEpisode: userTitleStates.currentEpisode,
    updatedAt: userTitleStates.updatedAt,
  }).from(userTitleStates).innerJoin(titles, eq(userTitleStates.titleId, titles.id))
    .where(inArray(userTitleStates.status, ["watching", "completed"]));
  const tracked = activeLibrary.filter(entry => entry.type === "tv") as TrackedEntry[];

  const byShow = new Map<number, TrackedEntry[]>();
  for (const entry of tracked) byShow.set(entry.tmdbId, [...(byShow.get(entry.tmdbId) ?? []), entry]);

  let alertsCreated = 0;
  let seriesReopened = 0;
  for (const [tmdbId, entries] of byShow) {
    try {
      const response = await fetch(`${API_BASE}/tv/${tmdbId}?language=en-US`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        next: { revalidate: 60 * 60 * 6 },
      });
      if (!response.ok) continue;
      const show = await response.json() as { last_episode_to_air?: AiredEpisode | null; seasons?: Season[] };
      const latest = show.last_episode_to_air;
      const latestSeason = latest?.season_number ?? 0;
      const latestEpisode = latest?.episode_number ?? 0;
      if (!latestSeason || !latestEpisode) continue;
      const latestSeasonInfo = show.seasons?.find(season => season.season_number === latestSeason);

      for (const entry of entries) {
        if (entry.status === "completed") {
          if (!premieredAfterCompletion(latestSeasonInfo?.air_date, entry.updatedAt)) continue;
          const link = `season-return:${tmdbId}:s${latestSeason}`;
          const [existing] = await db.select({ id: notifications.id }).from(notifications)
            .where(and(eq(notifications.userId, entry.userId), eq(notifications.link, link))).limit(1);
          if (existing) continue;
          await db.update(userTitleStates).set({ status: "watching", currentSeason: latestSeason, currentEpisode: null, updatedAt: new Date() })
            .where(and(eq(userTitleStates.userId, entry.userId), eq(userTitleStates.titleId, entry.titleId)));
          await db.insert(notifications).values({
            userId: entry.userId,
            kind: "episode",
            message: `A new season of ${entry.title} has started, so it is back in your Watching list.`,
            link,
          });
          alertsCreated += 1;
          seriesReopened += 1;
          continue;
        }

        if (!airedRecently(latest?.air_date)) continue;
        const newSeason = latestSeason > (entry.currentSeason ?? 0);
        const aheadInSeason = latestSeason === (entry.currentSeason ?? latestSeason) && latestEpisode > (entry.currentEpisode ?? 0);
        if (!newSeason && !aheadInSeason) continue;

        const link = newSeason ? `season:${tmdbId}:s${latestSeason}` : `episode:${tmdbId}:s${latestSeason}:e${latestEpisode}`;
        const [existing] = await db.select({ id: notifications.id }).from(notifications)
          .where(and(eq(notifications.userId, entry.userId), eq(notifications.link, link))).limit(1);
        if (existing) continue;

        const message = newSeason
          ? `A new season of ${entry.title} has started — Season ${latestSeason} is now airing.`
          : `A new episode of ${entry.title} is out — Season ${latestSeason}, Episode ${latestEpisode}.`;
        await db.insert(notifications).values({ userId: entry.userId, kind: "episode", message, link });
        alertsCreated += 1;
      }
    } catch { /* One unavailable TMDB title must not stop the daily alert run. */ }
  }

  const trackedTitles = Array.from(byShow.values()).map(entries => ({
    title: entries[0].title,
    status: Array.from(new Set(entries.map(entry => entry.status))).join(", "),
    trackedBy: entries.length,
  }));
  const ignoredEntries = activeLibrary
    .filter(entry => entry.type !== "tv")
    .map(entry => ({ title: entry.title, savedAs: entry.type, status: entry.status }));

  return Response.json({
    checkedShows: byShow.size,
    eligibleEntries: tracked.length,
    alertsCreated,
    seriesReopened,
    diagnostic: { trackedTitles, ignoredEntries },
  });
}
