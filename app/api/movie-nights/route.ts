import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { groupMembers, movieNightOptions, movieNightPolls, movieNightVotes, titles, users } from "../../db/schema";

type TitleInput = { tmdbId?: number; type?: string; name?: string; year?: number | null; posterPath?: string | null };

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

async function canAccess(groupId: string, userId: string) {
  if (!db) return false;
  const [membership] = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1);
  return Boolean(membership);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ poll: null });
  const member = await memberFor(userId); const groupId = new URL(request.url).searchParams.get("groupId");
  if (!member || !groupId) return Response.json({ poll: null });
  if (!await canAccess(groupId, member.id)) return Response.json({ error: "This movie night is private to its group." }, { status: 403 });
  const [poll] = await db.select({ id: movieNightPolls.id, question: movieNightPolls.question, status: movieNightPolls.status, createdAt: movieNightPolls.createdAt, closesAt: movieNightPolls.closesAt, creator: users.displayName })
    .from(movieNightPolls).innerJoin(users, eq(movieNightPolls.createdBy, users.id)).where(eq(movieNightPolls.groupId, groupId)).orderBy(desc(movieNightPolls.createdAt)).limit(1);
  if (!poll) return Response.json({ poll: null });
  const options = await db.select({ id: movieNightOptions.id, title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath }).from(movieNightOptions).innerJoin(titles, eq(movieNightOptions.titleId, titles.id)).where(eq(movieNightOptions.pollId, poll.id));
  const votes = await db.select({ optionId: movieNightVotes.optionId, userId: movieNightVotes.userId, displayName: users.displayName, avatarUrl: users.avatarUrl }).from(movieNightVotes).innerJoin(users, eq(movieNightVotes.userId, users.id)).where(eq(movieNightVotes.pollId, poll.id));
  const optionsWithVotes = options.map(option => { const optionVotes = votes.filter(vote => vote.optionId === option.id); return { ...option, votes: optionVotes.length, voters: optionVotes.map(vote => ({ id: vote.userId, displayName: vote.displayName, avatarUrl: vote.avatarUrl })), selected: optionVotes.some(vote => vote.userId === member.id) }; });
  return Response.json({ poll: { ...poll, options: optionsWithVotes, totalVotes: votes.length } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Movie nights are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId); const body = await request.json() as { groupId?: string; question?: string; options?: TitleInput[] };
  const groupId = body.groupId; const question = body.question?.trim().slice(0, 180) || "What should we watch?"; const options = body.options?.slice(0, 5) ?? [];
  if (!member || !groupId || !await canAccess(groupId, member.id)) return Response.json({ error: "Only group members can create a movie night." }, { status: 403 });
  if (options.length < 3) return Response.json({ error: "Add at least three movies or shows for the group to vote on." }, { status: 400 });
  const [poll] = await db.insert(movieNightPolls).values({ groupId, createdBy: member.id, question }).returning({ id: movieNightPolls.id });
  for (const choice of options) {
    const tmdbId = Number(choice.tmdbId); const type = choice.type === "tv" ? "tv" : "movie"; const name = choice.name?.trim().slice(0, 180);
    if (!tmdbId || !name) continue;
    await db.insert(titles).values({ tmdbId, type, name, releaseYear: choice.year ?? null, posterPath: choice.posterPath ?? null }).onConflictDoUpdate({ target: [titles.tmdbId, titles.type], set: { name, releaseYear: choice.year ?? null, posterPath: choice.posterPath ?? null, updatedAt: new Date() } });
    const [title] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, type))).limit(1);
    if (title) await db.insert(movieNightOptions).values({ pollId: poll.id, titleId: title.id, addedBy: member.id });
  }
  return Response.json({ pollId: poll.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Movie nights are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId); const body = await request.json() as { pollId?: string; optionId?: string };
  if (!member || !body.pollId || !body.optionId) return Response.json({ error: "Choose a movie-night option." }, { status: 400 });
  const [poll] = await db.select({ id: movieNightPolls.id, groupId: movieNightPolls.groupId, status: movieNightPolls.status }).from(movieNightPolls).where(eq(movieNightPolls.id, body.pollId)).limit(1);
  if (!poll || !await canAccess(poll.groupId, member.id)) return Response.json({ error: "This movie night is private to its group." }, { status: 403 });
  if (poll.status !== "open") return Response.json({ error: "Voting has closed for this movie night." }, { status: 409 });
  const [option] = await db.select({ id: movieNightOptions.id }).from(movieNightOptions).where(and(eq(movieNightOptions.id, body.optionId), eq(movieNightOptions.pollId, poll.id))).limit(1);
  if (!option) return Response.json({ error: "That option is not part of this movie night." }, { status: 400 });
  await db.insert(movieNightVotes).values({ pollId: poll.id, optionId: option.id, userId: member.id }).onConflictDoUpdate({ target: [movieNightVotes.pollId, movieNightVotes.userId], set: { optionId: option.id, createdAt: new Date() } });
  return Response.json({ status: "voted" });
}
