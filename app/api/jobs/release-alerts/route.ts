import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { notifications, releaseAlertDispatches, webPushSubscriptions } from "../../../db/schema";

export const runtime = "nodejs";

const API_BASE = "https://api.themoviedb.org/3";
const MAX_RELEASES_PER_TYPE = 3;

type Release = { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; popularity?: number; vote_count?: number };
type AlertRelease = { id: number; type: "movie" | "tv"; name: string; date: string };

function today() { return new Date().toISOString().slice(0, 10); }

async function releasesFor(type: "movie" | "tv", token: string) {
  const dateKey = type === "movie" ? "primary_release_date" : "first_air_date";
  const response = await fetch(`${API_BASE}/discover/${type}?language=en-US&sort_by=popularity.desc&include_adult=false&include_video=false&${dateKey}.gte=${today()}&${dateKey}.lte=${today()}&vote_count.gte=${type === "movie" ? 15 : 8}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return [] as AlertRelease[];
  const payload = await response.json() as { results?: Release[] };
  return (payload.results ?? []).slice(0, MAX_RELEASES_PER_TYPE).map(item => ({
    id: item.id,
    type,
    name: type === "movie" ? item.title ?? "A new movie" : item.name ?? "A new TV series",
    date: type === "movie" ? item.release_date ?? today() : item.first_air_date ?? today(),
  }));
}

function pushPayload(release: AlertRelease) {
  const label = release.type === "movie" ? "New movie" : "New TV series";
  return JSON.stringify({
    title: `${label}: ${release.name}`,
    body: `${release.name} is out now. See if it belongs in your next watchlist.`,
    url: "/?page=discover",
    tag: `release-${release.type}-${release.id}`,
  });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!db || !token || !publicKey || !privateKey) return Response.json({ error: "Release alerts are not configured." }, { status: 503 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@cineape.com", publicKey, privateKey);
  const releases = [...await releasesFor("movie", token), ...await releasesFor("tv", token)];
  let pushed = 0;
  let inAppAlerts = 0;
  let removedSubscriptions = 0;

  for (const release of releases) {
    const [alreadySent] = await db.select({ id: releaseAlertDispatches.id }).from(releaseAlertDispatches)
      .where(eq(releaseAlertDispatches.tmdbId, release.id)).limit(1);
    if (alreadySent) continue;
    const allowColumn = release.type === "movie" ? webPushSubscriptions.notifyMovies : webPushSubscriptions.notifyTv;
    const subscriptions = await db.select().from(webPushSubscriptions).where(eq(allowColumn, true));
    const usersAlerted = new Set<string>();
    await Promise.all(subscriptions.map(async subscription => {
      usersAlerted.add(subscription.userId);
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, pushPayload(release));
        pushed += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db!.delete(webPushSubscriptions).where(eq(webPushSubscriptions.id, subscription.id));
          removedSubscriptions += 1;
        }
      }
    }));
    if (usersAlerted.size) {
      await db.insert(notifications).values([...usersAlerted].map(userId => ({
        userId,
        kind: "release" as const,
        message: `${release.name} is out now — a new ${release.type === "movie" ? "movie" : "TV series"} release.`,
        link: `release:${release.type}:${release.id}:${release.date}`,
      })));
      inAppAlerts += usersAlerted.size;
    }
    await db.insert(releaseAlertDispatches).values({ tmdbId: release.id, type: release.type, releaseDate: release.date });
  }
  return Response.json({ checkedReleases: releases.length, pushed, inAppAlerts, removedSubscriptions });
}
