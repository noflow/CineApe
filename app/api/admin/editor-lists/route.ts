import { auth } from "@clerk/nextjs/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { editorListItems, editorLists, titles, users } from "../../../db/schema";

type ListTitle = { tmdbId?: number; type?: string; name?: string; year?: number | null; posterPath?: string | null };
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "cineape-list";

function readList(body: { name?: string; description?: string; seoTitle?: string; seoDescription?: string; status?: string; scheduledAt?: string | null; items?: ListTitle[] }) {
  const name = body.name?.trim().slice(0, 160);
  const description = body.description?.trim().slice(0, 1000);
  const items = body.items?.slice(0, 50) ?? [];
  if (!name || !description || items.length < 3) return null;
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.valueOf())) return null;
  const status = body.status === "archived" ? "archived" as const : body.status === "published" ? "published" as const : "draft" as const;
  return { name, description, items, status, scheduledAt, seoTitle: body.seoTitle?.trim().slice(0, 70) || null, seoDescription: body.seoDescription?.trim().slice(0, 170) || null };
}

async function adminMember() {
  const { userId } = await auth(); if (!userId || !db) return null;
  const [member] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.clerkUserId, userId)).limit(1);
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return member && allowed.includes(member.email.toLowerCase()) ? member : null;
}

export async function GET() {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  const member = await adminMember();
  if (!member) return Response.json({ error: "Studio access required." }, { status: 403 });
  const lists = await db.select({ id: editorLists.id, authorId: editorLists.authorId, name: editorLists.name, description: editorLists.description, slug: editorLists.slug, status: editorLists.status, seoTitle: editorLists.seoTitle, seoDescription: editorLists.seoDescription, createdAt: editorLists.createdAt, publishedAt: editorLists.publishedAt, scheduledAt: editorLists.scheduledAt })
    .from(editorLists).orderBy(desc(editorLists.createdAt)).limit(100);
  const listItems = lists.length ? await db.select({ listId: editorListItems.listId, tmdbId: titles.tmdbId, type: titles.type, name: titles.name, year: titles.releaseYear, posterPath: titles.posterPath, position: editorListItems.position })
    .from(editorListItems).innerJoin(titles, eq(editorListItems.titleId, titles.id))
    .where(inArray(editorListItems.listId, lists.map(list => list.id))).orderBy(asc(editorListItems.position)) : [];
  const itemsByList = new Map<string, typeof listItems>();
  for (const item of listItems) itemsByList.set(item.listId, [...(itemsByList.get(item.listId) ?? []), item]);
  return Response.json({ lists: lists.map(({ authorId, ...list }) => ({ ...list, canEdit: authorId === member.id, items: itemsByList.get(list.id) ?? [] })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  const member = await adminMember(); if (!member) return Response.json({ error: "Studio access required." }, { status: 403 });
  const content = readList(await request.json() as { name?: string; description?: string; seoTitle?: string; seoDescription?: string; status?: string; items?: ListTitle[] });
  if (!content) return Response.json({ error: "Give the list a name, description, and at least three titles." }, { status: 400 });
  const [list] = await db.insert(editorLists).values({ authorId: member.id, name: content.name, description: content.description, slug: `${slugify(content.name)}-${Date.now().toString(36)}`, seoTitle: content.seoTitle, seoDescription: content.seoDescription, status: content.status, scheduledAt: content.status === "published" ? content.scheduledAt : null, publishedAt: content.status === "published" ? content.scheduledAt ?? new Date() : null }).returning({ id: editorLists.id, slug: editorLists.slug });
  if (!list) return Response.json({ error: "The list could not be saved." }, { status: 500 });
  for (const [index, item] of content.items.entries()) {
    const tmdbId = Number(item.tmdbId); const type = item.type === "tv" ? "tv" : "movie"; const itemName = item.name?.trim().slice(0, 180);
    if (!tmdbId || !itemName) continue;
    await db.insert(titles).values({ tmdbId, type, name: itemName, releaseYear: item.year ?? null, posterPath: item.posterPath ?? null }).onConflictDoUpdate({ target: [titles.tmdbId, titles.type], set: { name: itemName, releaseYear: item.year ?? null, posterPath: item.posterPath ?? null, updatedAt: new Date() } });
    const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
    if (title) await db.insert(editorListItems).values({ listId: list.id, titleId: title.id, position: index + 1 });
  }
  return Response.json({ list }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!db) return Response.json({ error: "Studio is temporarily unavailable." }, { status: 503 });
  const member = await adminMember();
  if (!member) return Response.json({ error: "Studio access required." }, { status: 403 });
  const body = await request.json() as { id?: string; name?: string; description?: string; seoTitle?: string; seoDescription?: string; status?: string; scheduledAt?: string | null; items?: ListTitle[] };
  const id = body.id?.trim();
  const content = readList(body);
  if (!id || !content) return Response.json({ error: "Give the list a name, description, and at least three titles." }, { status: 400 });
  const [existing] = await db.select({ id: editorLists.id, authorId: editorLists.authorId, publishedAt: editorLists.publishedAt }).from(editorLists).where(eq(editorLists.id, id)).limit(1);
  if (!existing) return Response.json({ error: "That list could not be found." }, { status: 404 });
  if (existing.authorId !== member.id) return Response.json({ error: "Only the editor who created this list can change it." }, { status: 403 });

  await db.transaction(async (tx) => {
    await tx.update(editorLists).set({ name: content.name, description: content.description, seoTitle: content.seoTitle, seoDescription: content.seoDescription, status: content.status, scheduledAt: content.status === "published" ? content.scheduledAt : null, publishedAt: content.status === "published" ? existing.publishedAt ?? content.scheduledAt ?? new Date() : null, updatedAt: new Date() }).where(eq(editorLists.id, id));
    await tx.delete(editorListItems).where(eq(editorListItems.listId, id));
    for (const [index, item] of content.items.entries()) {
      const tmdbId = Number(item.tmdbId); const type = item.type === "tv" ? "tv" : "movie"; const itemName = item.name?.trim().slice(0, 180);
      if (!tmdbId || !itemName) throw new Error("Every list item needs a valid title.");
      await tx.insert(titles).values({ tmdbId, type, name: itemName, releaseYear: item.year ?? null, posterPath: item.posterPath ?? null }).onConflictDoUpdate({ target: [titles.tmdbId, titles.type], set: { name: itemName, releaseYear: item.year ?? null, posterPath: item.posterPath ?? null, updatedAt: new Date() } });
      const [title] = await tx.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
      if (!title) throw new Error("Unable to save a list title.");
      await tx.insert(editorListItems).values({ listId: id, titleId: title.id, position: index + 1 });
    }
  });
  return Response.json({ list: { id } });
}

