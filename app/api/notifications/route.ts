import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { notifications, titles, userTitleStates, users } from "../../db/schema";

const API_BASE = "https://api.themoviedb.org/3";
const primaryServices = ["Netflix", "Apple TV", "Disney Plus", "Paramount Plus", "Paramount+", "Crave", "Hulu", "Max", "Peacock Premium", "Amazon Prime Video", "Max Amazon Channel"];
type Provider = { provider_name: string; logo_path?: string | null };

function primaryProvider(streamers: Provider[], networks: Array<{ name: string; logo_path?: string | null }> | undefined) {
  const ranked = [...streamers].sort((a, b) => {
    const aIndex = primaryServices.findIndex(name => a.provider_name === name);
    const bIndex = primaryServices.findIndex(name => b.provider_name === name);
    return (aIndex === -1 ? primaryServices.length : aIndex) - (bIndex === -1 ? primaryServices.length : bIndex);
  })[0] ?? null;
  // Apple originals should always point to Apple TV, matching the title page.
  const appleNetwork = networks?.find(network => /apple\s*tv/i.test(network.name));
  const appleService = streamers.find(provider => /apple\s*tv/i.test(provider.provider_name));
  return appleNetwork ? appleService ?? { provider_name: appleNetwork.name, logo_path: appleNetwork.logo_path } : ranked;
}

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

async function checkStreamingAlerts(memberId: string, country: "CA" | "US") {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!db || !token) return;
  const saved = await db.select({ tmdbId: titles.tmdbId, type: titles.type, name: titles.name }).from(userTitleStates)
    .innerJoin(titles, eq(userTitleStates.titleId, titles.id))
    .where(and(eq(userTitleStates.userId, memberId), eq(userTitleStates.status, "watchlist"))).limit(8);
  await Promise.all(saved.map(async title => {
    try {
      const response = await fetch(`${API_BASE}/${title.type}/${title.tmdbId}?language=en-US&append_to_response=watch/providers`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, next: { revalidate: 60 * 60 * 12 } });
      if (!response.ok) return;
      const data = await response.json() as { networks?: Array<{ name: string; logo_path?: string | null }>; "watch/providers"?: { results?: Record<string, { flatrate?: Provider[] }> } };
      const service = primaryProvider(data["watch/providers"]?.results?.[country]?.flatrate ?? [], title.type === "tv" ? data.networks : undefined);
      if (!service) return;
      const link = `streaming:${title.tmdbId}:${country}`;
      const message = `${title.name} is streaming on ${service.provider_name}`;
      const [existing] = await db!.select({ id: notifications.id, message: notifications.message }).from(notifications).where(and(eq(notifications.userId, memberId), eq(notifications.link, link))).limit(1);
      if (existing) {
        if (existing.message !== message) await db!.update(notifications).set({ message, updatedAt: new Date() }).where(eq(notifications.id, existing.id));
        return;
      }
      await db!.insert(notifications).values({ userId: memberId, kind: "streaming", message, link });
    } catch { /* Streaming alerts are best-effort and must never block the notification panel. */ }
  }));
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ notifications: [], unread: 0 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ notifications: [], unread: 0 });
  const country = new URL(request.url).searchParams.get("country") === "CA" ? "CA" : "US";
  await checkStreamingAlerts(member.id, country);
  const rows = await db.select({ id: notifications.id, kind: notifications.kind, message: notifications.message, link: notifications.link, createdAt: notifications.createdAt, readAt: notifications.readAt })
    .from(notifications).where(eq(notifications.userId, member.id)).orderBy(desc(notifications.createdAt)).limit(20);
  return Response.json({ notifications: rows, unread: rows.filter(notification => !notification.readAt).length });
}

export async function PATCH() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  await db.update(notifications).set({ readAt: new Date(), updatedAt: new Date() }).where(eq(notifications.userId, member.id));
  return Response.json({ status: "read" });
}
