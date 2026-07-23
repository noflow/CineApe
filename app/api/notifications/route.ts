import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { notifications, titles, userTitleStates, users } from "../../db/schema";

const API_BASE = "https://api.themoviedb.org/3";
const primaryServices = ["Netflix", "Amazon Prime Video", "Disney Plus", "Apple TV", "Paramount Plus", "Paramount+", "Crave", "Hulu", "Max", "Peacock Premium"];

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
    const link = `streaming:${title.tmdbId}:${country}`;
    const [existing] = await db!.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, memberId), eq(notifications.link, link))).limit(1);
    if (existing) return;
    try {
      const response = await fetch(`${API_BASE}/${title.type}/${title.tmdbId}/watch/providers`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, next: { revalidate: 60 * 60 * 12 } });
      if (!response.ok) return;
      const data = await response.json() as { results?: Record<string, { flatrate?: Array<{ provider_name: string }> }> };
      const streamers = data.results?.[country]?.flatrate ?? [];
      const service = [...streamers].sort((a, b) => {
        const aIndex = primaryServices.findIndex(name => a.provider_name === name);
        const bIndex = primaryServices.findIndex(name => b.provider_name === name);
        return (aIndex === -1 ? primaryServices.length : aIndex) - (bIndex === -1 ? primaryServices.length : bIndex);
      })[0];
      if (service) await db!.insert(notifications).values({ userId: memberId, kind: "streaming", message: `${title.name} is streaming on ${service.provider_name}`, link });
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
