import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { friendships, notifications, recommendations, titles, users } from "../../db/schema";

const statuses = ["pending", "watching", "watched", "not_interested"] as const;

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ recommendations: [] });
  const member = await memberFor(userId);
  if (!member) return Response.json({ recommendations: [] });
  const view = new URL(request.url).searchParams.get("view") ?? "received";
  const isSent = view === "sent";
  const status = view === "watching" ? "watching" : view === "completed" ? "watched" : null;
  const conditions = [eq(isSent ? recommendations.senderId : recommendations.recipientId, member.id)];
  if (status) conditions.push(eq(recommendations.status, status));
  const rows = await db.select({
    id: recommendations.id, status: recommendations.status, note: recommendations.note, createdAt: recommendations.createdAt,
    senderId: recommendations.senderId, recipientId: recommendations.recipientId,
    title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath,
  }).from(recommendations).innerJoin(titles, eq(recommendations.titleId, titles.id)).where(and(...conditions)).orderBy(desc(recommendations.createdAt));
  const peopleIds = rows.map(row => isSent ? row.recipientId : row.senderId);
  const people = peopleIds.length ? await db.select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, peopleIds)) : [];
  const byId = new Map(people.map(person => [person.id, person]));
  return Response.json({ recommendations: rows.map(row => ({ ...row, person: byId.get(isSent ? row.recipientId : row.senderId) ?? null })) });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Recommendations are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { recipientId?: string; tmdbId?: number; type?: "movie" | "tv"; name?: string; year?: number | null; posterPath?: string | null; note?: string };
  const note = body.note?.trim().slice(0, 1000) || null;
  if (!body.recipientId || !Number.isInteger(body.tmdbId) || !body.name?.trim() || (body.type !== "movie" && body.type !== "tv")) return Response.json({ error: "Choose a friend and a valid title." }, { status: 400 });
  const tmdbId = body.tmdbId!;
  const type = body.type as "movie" | "tv";
  const name = body.name.trim();
  const [friendship] = await db.select({ friendId: friendships.friendId }).from(friendships)
    .where(and(eq(friendships.userId, member.id), eq(friendships.friendId, body.recipientId))).limit(1);
  if (!friendship) return Response.json({ error: "You can only recommend titles to people in your Circle." }, { status: 403 });

  await db.insert(titles).values({ tmdbId, type, name, releaseYear: body.year ?? null, posterPath: body.posterPath ?? null }).onConflictDoNothing();
  const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
  if (!title) return Response.json({ error: "Title could not be saved." }, { status: 500 });
  await db.insert(recommendations).values({ titleId: title.id, senderId: member.id, recipientId: body.recipientId, note });
  const [sender] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, member.id)).limit(1);
  await db.insert(notifications).values({ userId: body.recipientId, kind: "recommendation", message: `${sender?.displayName ?? "Someone"} recommended ${name}`, link: "/?page=for-you" });
  return Response.json({ status: "sent" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Recommendations are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { id?: string; status?: string };
  if (!body.id || !body.status || !statuses.includes(body.status as typeof statuses[number])) return Response.json({ error: "Choose a valid recommendation status." }, { status: 400 });
  const updated = await db.update(recommendations).set({ status: body.status as typeof statuses[number], updatedAt: new Date() }).where(and(eq(recommendations.id, body.id), eq(recommendations.recipientId, member.id))).returning({ id: recommendations.id });
  if (!updated.length) return Response.json({ error: "Recommendation not found." }, { status: 404 });
  return Response.json({ status: "updated" });
}
