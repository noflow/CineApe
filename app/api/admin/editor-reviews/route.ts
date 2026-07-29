import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { editorReviews, titles, users } from "../../../db/schema";

type TitleType = "movie" | "tv";

async function adminMember() {
  const { userId } = await auth();
  if (!userId || !db) return null;
  const [member] = await db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, userId)).limit(1);
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  return member && allowedEmails.includes(member.email.toLowerCase()) ? member : null;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "cineape-review";

export async function GET() {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  if (!await adminMember()) return Response.json({ error: "Studio access required." }, { status: 403 });
  const reviews = await db.select({
    id: editorReviews.id, slug: editorReviews.slug, headline: editorReviews.headline, body: editorReviews.body, score: editorReviews.score,
    seoTitle: editorReviews.seoTitle, seoDescription: editorReviews.seoDescription,
    status: editorReviews.status, createdAt: editorReviews.createdAt, publishedAt: editorReviews.publishedAt,
    tmdbId: titles.tmdbId, title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath,
    author: users.displayName,
  }).from(editorReviews).innerJoin(titles, eq(editorReviews.titleId, titles.id)).innerJoin(users, eq(editorReviews.authorId, users.id))
    .orderBy(desc(editorReviews.createdAt)).limit(100);
  return Response.json({ reviews }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  const member = await adminMember();
  if (!member) return Response.json({ error: "Studio access required." }, { status: 403 });
  const body = await request.json() as {
    tmdbId?: number; type?: string; name?: string; year?: number | null; posterPath?: string | null;
    headline?: string; body?: string; score?: number; seoTitle?: string; seoDescription?: string; status?: string; scheduledAt?: string | null;
  };
  const tmdbId = Number(body.tmdbId);
  const type: TitleType = body.type === "tv" ? "tv" : "movie";
  const name = body.name?.trim().slice(0, 180);
  const headline = body.headline?.trim().slice(0, 180);
  const reviewBody = body.body?.trim().slice(0, 12000);
  const score = Number(body.score);
  const status = body.status === "archived" ? "archived" : body.status === "published" ? "published" : "draft";
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.valueOf())) return Response.json({ error: "Use a valid scheduled date." }, { status: 400 });
  if (!tmdbId || !name || !headline || !reviewBody || !Number.isInteger(score) || score < 1 || score > 10) {
    return Response.json({ error: "Choose a title, write a headline and review, and use a score from 1 to 10." }, { status: 400 });
  }
  await db.insert(titles).values({ tmdbId, type, name, releaseYear: body.year ?? null, posterPath: body.posterPath ?? null }).onConflictDoUpdate({
    target: [titles.tmdbId, titles.type], set: { name, releaseYear: body.year ?? null, posterPath: body.posterPath ?? null, updatedAt: new Date() },
  });
  const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
  if (!title) return Response.json({ error: "The title could not be saved." }, { status: 500 });
  const now = new Date();
  const [review] = await db.insert(editorReviews).values({
    titleId: title.id, authorId: member.id, slug: `${slugify(headline)}-${Date.now().toString(36)}`,
    headline, body: reviewBody, score, seoTitle: body.seoTitle?.trim().slice(0, 70) || null,
    seoDescription: body.seoDescription?.trim().slice(0, 170) || null, status, scheduledAt: status === "published" ? scheduledAt : null, publishedAt: status === "published" ? scheduledAt ?? now : null,
  }).returning({ id: editorReviews.id, slug: editorReviews.slug, status: editorReviews.status });
  return Response.json({ review }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  if (!await adminMember()) return Response.json({ error: "Studio access required." }, { status: 403 });
  const body = await request.json() as { id?: string; headline?: string; body?: string; score?: number; seoTitle?: string; seoDescription?: string; status?: string; scheduledAt?: string | null };
  const id = body.id?.trim();
  const headline = body.headline?.trim().slice(0, 180);
  const reviewBody = body.body?.trim().slice(0, 12000);
  const score = Number(body.score);
  const status = body.status === "archived" ? "archived" : body.status === "published" ? "published" : "draft";
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.valueOf())) return Response.json({ error: "Use a valid scheduled date." }, { status: 400 });
  if (!id || !headline || !reviewBody || !Number.isInteger(score) || score < 1 || score > 10) {
    return Response.json({ error: "Write a headline and review, and use a score from 1 to 10." }, { status: 400 });
  }
  const [existing] = await db.select({ id: editorReviews.id, publishedAt: editorReviews.publishedAt }).from(editorReviews).where(eq(editorReviews.id, id)).limit(1);
  if (!existing) return Response.json({ error: "That review could not be found." }, { status: 404 });
  const [review] = await db.update(editorReviews).set({
    headline, body: reviewBody, score, status, scheduledAt: status === "published" ? scheduledAt : null,
    seoTitle: body.seoTitle?.trim().slice(0, 70) || null,
    seoDescription: body.seoDescription?.trim().slice(0, 170) || null,
    publishedAt: status === "published" ? existing.publishedAt ?? scheduledAt ?? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(editorReviews.id, id)).returning({ id: editorReviews.id, slug: editorReviews.slug, status: editorReviews.status });
  return Response.json({ review });
}
