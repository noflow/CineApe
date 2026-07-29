import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../../db";
import { chatMessageReactions, chatMessages, friendships, groupMembers, notifications, titles, users } from "../../db/schema";

type AttachedTitle = { tmdbId?: number; type?: "movie" | "tv"; name?: string; year?: number | null; posterPath?: string | null };

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

async function canMessageFriend(memberId: string, friendId: string) {
  if (!db || memberId === friendId) return false;
  const [friendship] = await db.select({ id: friendships.friendId }).from(friendships).where(and(eq(friendships.userId, memberId), eq(friendships.friendId, friendId))).limit(1);
  return Boolean(friendship);
}

async function isGroupMember(memberId: string, groupId: string) {
  if (!db) return false;
  const [membership] = await db.select({ id: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId))).limit(1);
  return Boolean(membership);
}

async function saveAttachedTitle(input?: AttachedTitle) {
  if (!db || !input?.tmdbId || !input.type || !input.name?.trim()) return null;
  const tmdbId = Number(input.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId < 1 || !["movie", "tv"].includes(input.type)) return null;
  const [existing] = await db.select({ id: titles.id }).from(titles).where(and(eq(titles.tmdbId, tmdbId), eq(titles.type, input.type))).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(titles).values({ tmdbId, type: input.type, name: input.name.trim().slice(0, 240), releaseYear: input.year ?? null, posterPath: input.posterPath ?? null }).returning({ id: titles.id });
  return created?.id ?? null;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ messages: [] });
  const member = await memberFor(userId);
  if (!member) return Response.json({ messages: [] });
  const params = new URL(request.url).searchParams;
  const friendId = params.get("friendId")?.trim();
  const groupId = params.get("groupId")?.trim();
  if (Boolean(friendId) === Boolean(groupId)) return Response.json({ error: "Choose one friend or group chat." }, { status: 400 });
  const allowed = friendId ? await canMessageFriend(member.id, friendId) : await isGroupMember(member.id, groupId!);
  if (!allowed) return Response.json({ error: "This chat is private to your CineApe Circle." }, { status: 403 });
  const condition = friendId ? or(and(eq(chatMessages.senderId, member.id), eq(chatMessages.recipientId, friendId)), and(eq(chatMessages.senderId, friendId), eq(chatMessages.recipientId, member.id))) : eq(chatMessages.groupId, groupId!);
  const rows = await db.select({ id: chatMessages.id, body: chatMessages.body, createdAt: chatMessages.createdAt, senderId: chatMessages.senderId, senderName: users.displayName, senderAvatar: users.avatarUrl, titleId: titles.id, tmdbId: titles.tmdbId, title: titles.name, titleType: titles.type, year: titles.releaseYear, posterPath: titles.posterPath }).from(chatMessages).innerJoin(users, eq(chatMessages.senderId, users.id)).leftJoin(titles, eq(chatMessages.titleId, titles.id)).where(condition).orderBy(desc(chatMessages.createdAt)).limit(100);
  const messageIds = rows.map(row => row.id);
  const reactions = messageIds.length ? await db.select({ messageId: chatMessageReactions.messageId, emoji: chatMessageReactions.emoji, value: count(), viewerId: chatMessageReactions.userId }).from(chatMessageReactions).where(inArray(chatMessageReactions.messageId, messageIds)).groupBy(chatMessageReactions.messageId, chatMessageReactions.emoji, chatMessageReactions.userId) : [];
  const reactionsByMessage = new Map<string, { counts: Record<string, number>; viewerReaction: string | null }>();
  for (const reaction of reactions) { const current = reactionsByMessage.get(reaction.messageId) ?? { counts: {}, viewerReaction: null }; current.counts[reaction.emoji] = (current.counts[reaction.emoji] ?? 0) + Number(reaction.value); if (reaction.viewerId === member.id) current.viewerReaction = reaction.emoji; reactionsByMessage.set(reaction.messageId, current); }
  // Opening a conversation clears only that conversation's in-app alerts.
  // Group messages notify every other member when they are posted.
  const notificationLink = friendId ? `chat:friend:${friendId}` : `chat:group:${groupId}`;
  await db.update(notifications).set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.userId, member.id), eq(notifications.link, notificationLink)));
  return Response.json({ viewerId: member.id, messages: rows.reverse().map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, sender: { id: row.senderId, displayName: row.senderName, avatarUrl: row.senderAvatar }, title: row.titleId ? { id: row.titleId, tmdbId: row.tmdbId!, name: row.title!, type: row.titleType!, year: row.year, posterPath: row.posterPath } : null, reactionCounts: reactionsByMessage.get(row.id)?.counts ?? {}, viewerReaction: reactionsByMessage.get(row.id)?.viewerReaction ?? null })) });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Chat is temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const input = await request.json() as { action?: "react"; messageId?: string; emoji?: string; friendId?: string; groupId?: string; body?: string; title?: AttachedTitle };
  if (input.action === "react") {
    const messageId = input.messageId?.trim(); const emoji = input.emoji;
    if (!messageId || !emoji || !["👍", "😂", "🔥"].includes(emoji)) return Response.json({ error: "Choose a valid reaction." }, { status: 400 });
    const [target] = await db.select({ id: chatMessages.id, groupId: chatMessages.groupId, senderId: chatMessages.senderId, recipientId: chatMessages.recipientId }).from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
    if (!target) return Response.json({ error: "Message not found." }, { status: 404 });
    const partnerId = target.senderId === member.id ? target.recipientId : target.senderId;
    const allowed = target.groupId ? await isGroupMember(member.id, target.groupId) : partnerId ? await canMessageFriend(member.id, partnerId) : false;
    if (!allowed) return Response.json({ error: "This chat is private to your CineApe Circle." }, { status: 403 });
    const [existing] = await db.select({ emoji: chatMessageReactions.emoji }).from(chatMessageReactions).where(and(eq(chatMessageReactions.messageId, messageId), eq(chatMessageReactions.userId, member.id))).limit(1);
    if (existing?.emoji === emoji) await db.delete(chatMessageReactions).where(and(eq(chatMessageReactions.messageId, messageId), eq(chatMessageReactions.userId, member.id)));
    else if (existing) await db.update(chatMessageReactions).set({ emoji, updatedAt: new Date() }).where(and(eq(chatMessageReactions.messageId, messageId), eq(chatMessageReactions.userId, member.id)));
    else await db.insert(chatMessageReactions).values({ messageId, userId: member.id, emoji });
    const rows = await db.select({ emoji: chatMessageReactions.emoji, value: count(), userId: chatMessageReactions.userId }).from(chatMessageReactions).where(eq(chatMessageReactions.messageId, messageId)).groupBy(chatMessageReactions.emoji, chatMessageReactions.userId);
    const reactionCounts: Record<string, number> = {}; let viewerReaction: string | null = null;
    for (const row of rows) { reactionCounts[row.emoji] = (reactionCounts[row.emoji] ?? 0) + Number(row.value); if (row.userId === member.id) viewerReaction = row.emoji; }
    return Response.json({ reactionCounts, viewerReaction });
  }
  const friendId = input.friendId?.trim(); const groupId = input.groupId?.trim();
  if (Boolean(friendId) === Boolean(groupId)) return Response.json({ error: "Choose one friend or group chat." }, { status: 400 });
  const body = input.body?.trim().slice(0, 2000) ?? "";
  const titleId = await saveAttachedTitle(input.title);
  if (!body && !titleId) return Response.json({ error: "Write a message or attach a title." }, { status: 400 });
  const allowed = friendId ? await canMessageFriend(member.id, friendId) : await isGroupMember(member.id, groupId!);
  if (!allowed) return Response.json({ error: "This chat is private to your CineApe Circle." }, { status: 403 });
  const [message] = await db.insert(chatMessages).values({ senderId: member.id, recipientId: friendId ?? null, groupId: groupId ?? null, body, titleId }).returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
  const recipients = friendId ? [friendId] : (await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId!))).map(row => row.userId).filter(id => id !== member.id);
  if (recipients.length) {
    const [attached] = titleId ? await db.select({ name: titles.name }).from(titles).where(eq(titles.id, titleId)).limit(1) : [];
    const preview = body ? body.replace(/\s+/g, " ").slice(0, 80) : `shared ${attached?.name ?? "a title"}`;
    const link = friendId ? `chat:friend:${friendId}` : `chat:group:${groupId}`;
    await db.insert(notifications).values(recipients.map(recipientId => ({ userId: recipientId, kind: "chat" as const, message: `${member.displayName}: ${preview}`, link })));
  }
  return Response.json({ message: { id: message.id, body, createdAt: message.createdAt } }, { status: 201 });
}
