import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { friendships, notifications, recommendationRatings, recommendations, titles, users } from "../../db/schema";

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
    senderId: recommendations.senderId, recipientId: recommendations.recipientId, titleId: titles.id, recommendationScore: recommendationRatings.score,
    title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath,
  }).from(recommendations).innerJoin(titles, eq(recommendations.titleId, titles.id)).leftJoin(recommendationRatings, eq(recommendationRatings.recommendationId, recommendations.id)).where(and(...conditions)).orderBy(desc(recommendations.createdAt));
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
  // A note is a nice touch, but never a requirement. This gives every simple
  // recommendation a friendly message in the recipient's inbox.
  const note = body.note?.trim().slice(0, 1000) || "I thought you'd like this.";
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
  const body = await request.json() as { id?: string; status?: string; rating?: number };
  if (!body.id) return Response.json({ error: "Choose a recommendation." }, { status: 400 });
  const [recommendation] = await db.select({ id: recommendations.id, status: recommendations.status }).from(recommendations).where(and(eq(recommendations.id, body.id), eq(recommendations.recipientId, member.id))).limit(1);
  if (!recommendation) return Response.json({ error: "Recommendation not found." }, { status: 404 });
  if (body.status) {
    if (!statuses.includes(body.status as typeof statuses[number])) return Response.json({ error: "Choose a valid recommendation status." }, { status: 400 });
    await db.update(recommendations).set({ status: body.status as typeof statuses[number], updatedAt: new Date() }).where(eq(recommendations.id, recommendation.id));
  }
  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (recommendation.status !== "watched" && body.status !== "watched") return Response.json({ error: "Finish the title before rating the recommendation." }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Response.json({ error: "Rate this recommendation from 1 to 5." }, { status: 400 });
    await db.insert(recommendationRatings).values({ recommendationId: recommendation.id, score: rating }).onConflictDoUpdate({ target: recommendationRatings.recommendationId, set: { score: rating, updatedAt: new Date() } });
  }
  return Response.json({ status: "updated" });
}
