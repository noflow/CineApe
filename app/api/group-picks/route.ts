import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { groupMembers, groupTitlePicks, titles, users } from "../../db/schema";

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ picks: [] });
  const member = await memberFor(userId);
  if (!member) return Response.json({ picks: [] });
  const groupId = new URL(request.url).searchParams.get("groupId");
  if (!groupId) return Response.json({ picks: [] });
  const [membership] = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, member.id))).limit(1);
  if (!membership) return Response.json({ error: "This group is not in your Circle." }, { status: 403 });
  const picks = await db.select({ id: groupTitlePicks.id, title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath })
    .from(groupTitlePicks).innerJoin(titles, eq(groupTitlePicks.titleId, titles.id)).where(eq(groupTitlePicks.groupId, groupId)).orderBy(desc(groupTitlePicks.createdAt)).limit(12);
  return Response.json({ picks });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Shared picks are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { groupId?: string; tmdbId?: number; type?: "movie" | "tv"; name?: string; year?: number | null; posterPath?: string | null };
  if (!body.groupId || !Number.isInteger(body.tmdbId) || !body.name?.trim() || (body.type !== "movie" && body.type !== "tv")) return Response.json({ error: "Choose a group and a valid title." }, { status: 400 });
  const tmdbId = body.tmdbId!;
  const type = body.type as "movie" | "tv";
  const name = body.name.trim();
  const [membership] = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, member.id))).limit(1);
  if (!membership) return Response.json({ error: "This group is not in your Circle." }, { status: 403 });
  await db.insert(titles).values({ tmdbId, type, name, releaseYear: body.year ?? null, posterPath: body.posterPath ?? null }).onConflictDoNothing();
  const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
  if (!title) return Response.json({ error: "Title could not be saved." }, { status: 500 });
  await db.insert(groupTitlePicks).values({ groupId: body.groupId, titleId: title.id, addedBy: member.id }).onConflictDoNothing();
  return Response.json({ status: "saved" }, { status: 201 });
}
