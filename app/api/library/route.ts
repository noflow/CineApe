import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { titles, users, userTitleStates } from "../../db/schema";

const statuses = ["watchlist", "watching", "completed"] as const;
type LibraryStatus = typeof statuses[number];

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ entries: [], status: null });
  const member = await memberFor(userId);
  if (!member) return Response.json({ entries: [], status: null });

  const params = new URL(request.url).searchParams;
  const tmdbId = Number(params.get("tmdbId"));
  const type = params.get("type");
  if (Number.isInteger(tmdbId) && tmdbId > 0 && (type === "movie" || type === "tv")) {
    const [entry] = await db.select({ status: userTitleStates.status, currentSeason: userTitleStates.currentSeason, currentEpisode: userTitleStates.currentEpisode })
      .from(userTitleStates)
      .innerJoin(titles, eq(userTitleStates.titleId, titles.id))
      .where(and(eq(userTitleStates.userId, member.id), eq(titles.tmdbId, tmdbId), eq(titles.type, type)))
      .limit(1);
    return Response.json({ status: entry?.status ?? null, currentSeason: entry?.currentSeason ?? null, currentEpisode: entry?.currentEpisode ?? null });
  }

  const status = params.get("status");
  if (!statuses.includes(status as LibraryStatus)) return Response.json({ entries: [] });
  const entries = await db.select({
    id: userTitleStates.titleId,
    status: userTitleStates.status,
    currentSeason: userTitleStates.currentSeason,
    currentEpisode: userTitleStates.currentEpisode,
    updatedAt: userTitleStates.updatedAt,
    tmdbId: titles.tmdbId,
    title: titles.name,
    type: titles.type,
    year: titles.releaseYear,
    posterPath: titles.posterPath,
  }).from(userTitleStates)
    .innerJoin(titles, eq(userTitleStates.titleId, titles.id))
    .where(and(eq(userTitleStates.userId, member.id), eq(userTitleStates.status, status as LibraryStatus)))
    .orderBy(desc(userTitleStates.updatedAt));
  return Response.json({ entries });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Your library is temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });

  const body = await request.json() as { tmdbId?: number; type?: string; name?: string; year?: number | null; posterPath?: string | null; status?: LibraryStatus | null; currentSeason?: number | null; currentEpisode?: number | null };
  if (!Number.isInteger(body.tmdbId) || !body.name?.trim() || (body.type !== "movie" && body.type !== "tv") || (body.status !== null && !statuses.includes(body.status as LibraryStatus))) {
    return Response.json({ error: "A valid title and library status are required." }, { status: 400 });
  }

  await db.insert(titles).values({
    tmdbId: body.tmdbId!, type: body.type, name: body.name.trim(), releaseYear: body.year ?? null, posterPath: body.posterPath ?? null,
  }).onConflictDoNothing();
  const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, body.tmdbId!), eq(titles.type, body.type))).limit(1);
  if (!title) return Response.json({ error: "Title could not be saved." }, { status: 500 });

  const nextStatus = body.status ?? null;
  const currentSeason = nextStatus === "watching" && body.type === "tv" && Number.isInteger(body.currentSeason) && body.currentSeason! > 0 ? body.currentSeason : null;
  const currentEpisode = nextStatus === "watching" && body.type === "tv" && Number.isInteger(body.currentEpisode) && body.currentEpisode! > 0 ? body.currentEpisode : null;
  if (nextStatus === null) {
    await db.delete(userTitleStates).where(and(eq(userTitleStates.userId, member.id), eq(userTitleStates.titleId, title.id)));
  } else {
    await db.insert(userTitleStates).values({ userId: member.id, titleId: title.id, status: nextStatus, currentSeason, currentEpisode })
      .onConflictDoUpdate({ target: [userTitleStates.userId, userTitleStates.titleId], set: { status: nextStatus, currentSeason, currentEpisode, updatedAt: new Date() } });
  }
  return Response.json({ status: nextStatus, currentSeason, currentEpisode });
}
