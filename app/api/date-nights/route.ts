import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  dateNightMembers,
  dateNightOptionVotes,
  dateNightOptions,
  dateNightSlotVotes,
  dateNightSlots,
  dateNights,
  friendships,
  titles,
  users,
} from "../../db/schema";

type TitleInput = { tmdbId?: number; type?: "movie" | "tv"; name?: string; year?: number | null; posterPath?: string | null };

async function currentMember(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

async function canAccess(dateNightId: string, userId: string) {
  if (!db) return false;
  const [membership] = await db.select({ id: dateNightMembers.userId }).from(dateNightMembers)
    .where(and(eq(dateNightMembers.dateNightId, dateNightId), eq(dateNightMembers.userId, userId))).limit(1);
  return Boolean(membership);
}

async function getNights(userId: string) {
  const database = db;
  if (!database) return [];
  const memberships = await database.select({ dateNightId: dateNightMembers.dateNightId }).from(dateNightMembers).where(eq(dateNightMembers.userId, userId));
  const ids = memberships.map(item => item.dateNightId);
  if (!ids.length) return [];
  const nights = await database.select({ id: dateNights.id, name: dateNights.name, status: dateNights.status, creator: users.displayName, createdAt: dateNights.createdAt })
    .from(dateNights).innerJoin(users, eq(dateNights.createdBy, users.id)).where(inArray(dateNights.id, ids)).orderBy(desc(dateNights.createdAt));
  return Promise.all(nights.map(async night => {
    const participants = await database.select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }).from(dateNightMembers)
      .innerJoin(users, eq(dateNightMembers.userId, users.id)).where(eq(dateNightMembers.dateNightId, night.id));
    const slots = await database.select({ id: dateNightSlots.id, day: dateNightSlots.day }).from(dateNightSlots).where(eq(dateNightSlots.dateNightId, night.id));
    const slotVotes = await database.select({ slotId: dateNightSlotVotes.slotId, userId: dateNightSlotVotes.userId }).from(dateNightSlotVotes).where(eq(dateNightSlotVotes.dateNightId, night.id));
    const options = await database.select({ id: dateNightOptions.id, title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath })
      .from(dateNightOptions).innerJoin(titles, eq(dateNightOptions.titleId, titles.id)).where(eq(dateNightOptions.dateNightId, night.id));
    const optionVotes = await database.select({ optionId: dateNightOptionVotes.optionId, userId: dateNightOptionVotes.userId }).from(dateNightOptionVotes).where(eq(dateNightOptionVotes.dateNightId, night.id));
    return {
      ...night,
      participants,
      slots: slots.map(slot => { const votes = slotVotes.filter(vote => vote.slotId === slot.id); return { ...slot, votes: votes.length, selected: votes.some(vote => vote.userId === userId) }; }),
      options: options.map(option => { const votes = optionVotes.filter(vote => vote.optionId === option.id); return { ...option, votes: votes.length, selected: votes.some(vote => vote.userId === userId) }; }),
    };
  }));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ nights: [] });
  const member = await currentMember(userId);
  return Response.json({ nights: member ? await getNights(member.id) : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Date Night is temporarily unavailable." }, { status: 503 });
  const member = await currentMember(userId);
  const body = await request.json() as { name?: string; friendIds?: string[]; days?: string[]; options?: TitleInput[] };
  const name = body.name?.trim().slice(0, 60) || "Date night";
  const friendIds = [...new Set((body.friendIds ?? []).filter(Boolean))].slice(0, 12);
  const days = [...new Set((body.days ?? []).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)))].slice(0, 4);
  const options = (body.options ?? []).filter(option => Number(option.tmdbId) && option.name?.trim()).slice(0, 5);
  if (!member) return Response.json({ error: "Your CineApe profile is still loading." }, { status: 409 });
  if (!friendIds.length) return Response.json({ error: "Invite at least one friend to your Date Night." }, { status: 400 });
  if (!days.length) return Response.json({ error: "Add at least one possible day." }, { status: 400 });
  if (options.length < 3) return Response.json({ error: "Add at least three movies or shows for the vote." }, { status: 400 });

  const connected = await db.select({ friendId: friendships.friendId }).from(friendships).where(eq(friendships.userId, member.id));
  const allowed = new Set(connected.map(friendship => friendship.friendId));
  const guests = friendIds.filter(id => allowed.has(id));
  if (!guests.length) return Response.json({ error: "Choose a friend from your Circle." }, { status: 400 });

  const [night] = await db.insert(dateNights).values({ name, createdBy: member.id }).returning({ id: dateNights.id });
  await db.insert(dateNightMembers).values([{ dateNightId: night.id, userId: member.id }, ...guests.map(userId => ({ dateNightId: night.id, userId }))]);
  await db.insert(dateNightSlots).values(days.map(day => ({ dateNightId: night.id, day })));
  for (const option of options) {
    const tmdbId = Number(option.tmdbId); const type = option.type === "tv" ? "tv" : "movie"; const name = option.name!.trim().slice(0, 180);
    await db.insert(titles).values({ tmdbId, type, name, releaseYear: option.year ?? null, posterPath: option.posterPath ?? null })
      .onConflictDoUpdate({ target: [titles.tmdbId, titles.type], set: { name, releaseYear: option.year ?? null, posterPath: option.posterPath ?? null, updatedAt: new Date() } });
    const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
    if (title) await db.insert(dateNightOptions).values({ dateNightId: night.id, titleId: title.id });
  }
  return Response.json({ id: night.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Date Night is temporarily unavailable." }, { status: 503 });
  const member = await currentMember(userId);
  const body = await request.json() as { nightId?: string; kind?: "day" | "title"; choiceId?: string };
  if (!member || !body.nightId || !body.choiceId || (body.kind !== "day" && body.kind !== "title")) return Response.json({ error: "Choose a Date Night option." }, { status: 400 });
  if (!await canAccess(body.nightId, member.id)) return Response.json({ error: "This Date Night is private to invited friends." }, { status: 403 });
  if (body.kind === "day") {
    const [slot] = await db.select({ id: dateNightSlots.id }).from(dateNightSlots).where(and(eq(dateNightSlots.id, body.choiceId), eq(dateNightSlots.dateNightId, body.nightId))).limit(1);
    if (!slot) return Response.json({ error: "That day is not part of this Date Night." }, { status: 400 });
    await db.insert(dateNightSlotVotes).values({ dateNightId: body.nightId, slotId: slot.id, userId: member.id }).onConflictDoUpdate({ target: [dateNightSlotVotes.dateNightId, dateNightSlotVotes.userId], set: { slotId: slot.id, createdAt: new Date() } });
  } else {
    const [option] = await db.select({ id: dateNightOptions.id }).from(dateNightOptions).where(and(eq(dateNightOptions.id, body.choiceId), eq(dateNightOptions.dateNightId, body.nightId))).limit(1);
    if (!option) return Response.json({ error: "That title is not part of this Date Night." }, { status: 400 });
    await db.insert(dateNightOptionVotes).values({ dateNightId: body.nightId, optionId: option.id, userId: member.id }).onConflictDoUpdate({ target: [dateNightOptionVotes.dateNightId, dateNightOptionVotes.userId], set: { optionId: option.id, createdAt: new Date() } });
  }
  return Response.json({ status: "voted" });
}
