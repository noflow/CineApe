import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { titleRatings, titles, users } from "../../db/schema";

type TitleType = "movie" | "tv";

const readType = (value: string | null): TitleType => value === "tv" ? "tv" : "movie";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tmdbId = Number(params.get("tmdbId"));
  const type = readType(params.get("type"));
  if (!tmdbId) return Response.json({ error: "A TMDB title id is required." }, { status: 400 });
  if (!db) return Response.json({ reviews: [], average: null, count: 0 });

  const rows = await db.select({
    score: titleRatings.score, review: titleRatings.review, createdAt: titleRatings.createdAt,
    displayName: users.displayName, avatarUrl: users.avatarUrl,
  }).from(titleRatings)
    .innerJoin(titles, eq(titleRatings.titleId, titles.id))
    .innerJoin(users, eq(titleRatings.userId, users.id))
    .where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type)))
    .orderBy(desc(titleRatings.updatedAt));

  const count = rows.length;
  const average = count ? Number((rows.reduce((total, row) => total + row.score, 0) / count).toFixed(1)) : null;
  return Response.json({ reviews: rows, average, count }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });

  const body = await request.json() as { tmdbId?: number; type?: string; name?: string; year?: number | null; score?: number; review?: string };
  const tmdbId = Number(body.tmdbId);
  const type = readType(body.type ?? null);
  const name = body.name?.trim().slice(0, 180);
  const score = Number(body.score);
  const review = body.review?.trim().slice(0, 2000) || null;
  if (!tmdbId || !name || !Number.isInteger(score) || score < 1 || score > 10) {
    return Response.json({ error: "A title and a whole-number score from 1 to 10 are required." }, { status: 400 });
  }

  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (!member) return Response.json({ error: "Your CineApe profile is still being created. Please refresh and try again." }, { status: 409 });

  await db.insert(titles).values({ tmdbId, type, name, releaseYear: body.year ?? null }).onConflictDoNothing();
  const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
  if (!title) return Response.json({ error: "Unable to save this title." }, { status: 500 });

  await db.insert(titleRatings).values({ userId: member.id, titleId: title.id, score, review }).onConflictDoUpdate({
    target: [titleRatings.userId, titleRatings.titleId], set: { score, review, updatedAt: new Date() },
  });
  return Response.json({ status: "saved" });
}
