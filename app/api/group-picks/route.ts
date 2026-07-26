import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { groupMembers, groupPickSaves, groupTitlePicks, groups, notifications, titles, users, userTitleStates } from "../../db/schema";

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
  const picks = await db.select({
    id: groupTitlePicks.id,
    titleId: titles.id,
    tmdbId: titles.tmdbId,
    title: titles.name,
    type: titles.type,
    year: titles.releaseYear,
    posterPath: titles.posterPath,
    addedById: users.id,
    addedByName: users.displayName,
    addedByAvatar: users.avatarUrl,
  }).from(groupTitlePicks)
    .innerJoin(titles, eq(groupTitlePicks.titleId, titles.id))
    .innerJoin(users, eq(groupTitlePicks.addedBy, users.id))
    .where(eq(groupTitlePicks.groupId, groupId)).orderBy(desc(groupTitlePicks.createdAt)).limit(50);
  const hydrated = await Promise.all(picks.map(async pick => {
    const [[saves], [viewerSave]] = await Promise.all([
      db!.select({ value: count() }).from(groupPickSaves).where(eq(groupPickSaves.groupPickId, pick.id)),
      db!.select({ id: groupPickSaves.id }).from(groupPickSaves).where(and(eq(groupPickSaves.groupPickId, pick.id), eq(groupPickSaves.userId, member.id))).limit(1),
    ]);
    return {
      id: pick.id, titleId: pick.titleId, tmdbId: pick.tmdbId, title: pick.title, type: pick.type, year: pick.year, posterPath: pick.posterPath,
      addedBy: { id: pick.addedById, displayName: pick.addedByName, avatarUrl: pick.addedByAvatar },
      savedCount: saves?.value ?? 0, savedByViewer: Boolean(viewerSave),
    };
  }));
  return Response.json({ picks: hydrated });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Shared picks are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { action?: "save"; groupId?: string; pickId?: string; tmdbId?: number; type?: "movie" | "tv"; name?: string; year?: number | null; posterPath?: string | null };
  if (body.action === "save") {
    if (!body.groupId || !body.pickId) return Response.json({ error: "Choose a shared pick." }, { status: 400 });
    const [membership] = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, member.id))).limit(1);
    if (!membership) return Response.json({ error: "This group is not in your Circle." }, { status: 403 });
    const [pick] = await db.select({ id: groupTitlePicks.id, titleId: groupTitlePicks.titleId, addedBy: groupTitlePicks.addedBy, title: titles.name, groupName: groups.name, recommender: users.displayName })
      .from(groupTitlePicks).innerJoin(titles, eq(groupTitlePicks.titleId, titles.id)).innerJoin(groups, eq(groupTitlePicks.groupId, groups.id)).innerJoin(users, eq(groupTitlePicks.addedBy, users.id))
      .where(and(eq(groupTitlePicks.id, body.pickId), eq(groupTitlePicks.groupId, body.groupId))).limit(1);
    if (!pick) return Response.json({ error: "That shared pick is no longer available." }, { status: 404 });
    const [existingSave] = await db.select({ id: groupPickSaves.id }).from(groupPickSaves).where(and(eq(groupPickSaves.groupPickId, pick.id), eq(groupPickSaves.userId, member.id))).limit(1);
    if (!existingSave) {
      await db.insert(groupPickSaves).values({ groupPickId: pick.id, userId: member.id });
      const [existingState] = await db.select({ status: userTitleStates.status }).from(userTitleStates).where(and(eq(userTitleStates.userId, member.id), eq(userTitleStates.titleId, pick.titleId))).limit(1);
      if (!existingState) await db.insert(userTitleStates).values({ userId: member.id, titleId: pick.titleId, status: "watchlist" });
      if (pick.addedBy !== member.id) {
        await db.insert(notifications).values({ userId: pick.addedBy, kind: "recommendation", message: `Someone saved your ${pick.title} pick in ${pick.groupName}.`, link: `group-pick-save:${pick.id}:${member.id}` });
      }
    }
    const [saves] = await db.select({ value: count() }).from(groupPickSaves).where(eq(groupPickSaves.groupPickId, pick.id));
    return Response.json({ status: existingSave ? "already_saved" : "saved", savedCount: saves?.value ?? 0 });
  }
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
