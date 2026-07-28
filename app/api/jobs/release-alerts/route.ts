import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { notifications, titles, userTitleStates, webPushSubscriptions } from "../../../db/schema";

export const runtime = "nodejs";

const API_BASE = "https://api.themoviedb.org/3";
const RELEASE_WINDOW_DAYS = 3;

type WatchlistEntry = {
  userId: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  addedAt: Date;
};
type TmdbTitle = { release_date?: string | null; first_air_date?: string | null };

function releasedRecently(date: string | null | undefined, addedAt: Date) {
  if (!date) return false;
  const released = new Date(`${date}T00:00:00Z`).getTime();
  const daysSinceRelease = (Date.now() - released) / 86_400_000;
  // Only notify people who saved a title before it came out, and leave a small
  // window for a delayed daily job without bringing back old watchlist items.
  return released >= addedAt.getTime() && daysSinceRelease >= 0 && daysSinceRelease <= RELEASE_WINDOW_DAYS;
}

function payload(entry: WatchlistEntry) {
  const kind = entry.type === "movie" ? "movie" : "TV series";
  return JSON.stringify({
    title: `${entry.title} is out now`,
    body: `A ${kind} from your CineApe Watchlist has just been released.`,
    url: "/?page=For%20You",
    tag: `watchlist-release-${entry.type}-${entry.tmdbId}`,
  });
}

export async function runWatchlistReleaseAlerts() {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!db || !token || !publicKey || !privateKey) return { error: "Watchlist release alerts are not configured." };

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@cineape.com", publicKey, privateKey);
  const saved = await db.select({
    userId: userTitleStates.userId,
    tmdbId: titles.tmdbId,
    type: titles.type,
    title: titles.name,
    addedAt: userTitleStates.createdAt,
  }).from(userTitleStates).innerJoin(titles, eq(userTitleStates.titleId, titles.id))
    .where(eq(userTitleStates.status, "watchlist"));
  const watchlist = saved as WatchlistEntry[];
  const subscriptions = await db.select().from(webPushSubscriptions);
  const subscriptionsFor = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) subscriptionsFor.set(subscription.userId, [...(subscriptionsFor.get(subscription.userId) ?? []), subscription]);

  let matches = 0;
  let pushed = 0;
  let inAppAlerts = 0;
  let removedSubscriptions = 0;
  for (const entry of watchlist) {
    try {
      const response = await fetch(`${API_BASE}/${entry.type}/${entry.tmdbId}?language=en-US`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) continue;
      const title = await response.json() as TmdbTitle;
      const releaseDate = entry.type === "movie" ? title.release_date : title.first_air_date;
      if (!releasedRecently(releaseDate, entry.addedAt)) continue;
      const link = `watchlist-release:${entry.type}:${entry.tmdbId}:${releaseDate}`;
      const [existing] = await db.select({ id: notifications.id }).from(notifications)
        .where(and(eq(notifications.userId, entry.userId), eq(notifications.link, link))).limit(1);
      if (existing) continue;

      matches += 1;
      await db.insert(notifications).values({
        userId: entry.userId,
        kind: "release",
        message: `${entry.title} from your Watchlist is out now.`,
        link,
      });
      inAppAlerts += 1;
      const preferenceKey = entry.type === "movie" ? "notifyMovies" : "notifyTv";
      await Promise.all((subscriptionsFor.get(entry.userId) ?? []).filter(subscription => subscription[preferenceKey]).map(async subscription => {
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload(entry));
          pushed += 1;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db!.delete(webPushSubscriptions).where(eq(webPushSubscriptions.id, subscription.id));
            removedSubscriptions += 1;
          }
        }
      }));
    } catch { /* One unavailable TMDB title must not stop every person's alerts. */ }
  }

  return { checkedWatchlistItems: watchlist.length, matches, pushed, inAppAlerts, removedSubscriptions };
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await runWatchlistReleaseAlerts();
  return Response.json(result, { status: "error" in result ? 503 : 200 });
}
