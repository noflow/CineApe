import { auth, currentUser } from "@clerk/nextjs/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "../../db";
import { chatMessages, friendships, groupTitlePicks, notifications, recommendations, titleRatings, userTitleStates, users } from "../../db/schema";

async function currentMember() {
  const { userId } = await auth();
  if (!userId || !db) return null;
  const [member] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  return member ?? null;
}

function preferredName(clerkUser: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const personalName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
  const externalAccount = clerkUser.externalAccounts.find(account => account.username || account.firstName || account.lastName);
  const providerName = externalAccount ? [externalAccount.firstName, externalAccount.lastName].filter(Boolean).join(" ") || externalAccount.username : "";
  return personalName || clerkUser.username || providerName || "CineApe member";
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!clerkUser || !email) return Response.json({ error: "An email address is required to create a CineApe profile." }, { status: 400 });

  const displayName = preferredName(clerkUser);
  const username = clerkUser.username?.trim().toLowerCase() || null;
  const existing = await currentMember();
  if (existing) {
    await db.update(users).set({
      email, avatarUrl: clerkUser.imageUrl,
      username: username ?? existing.username,
      // Preserve a name a member chose themselves, while replacing the old generic placeholder.
      displayName: existing.displayName === "CineApe member" && displayName !== "CineApe member" ? displayName : existing.displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({ clerkUserId: userId, email, displayName, username, avatarUrl: clerkUser.imageUrl });
  }
  return Response.json({ status: "ready" });
}

export async function GET() {
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });
  const member = await currentMember();
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const [[friends], [ratings], [sent], [messages], [curated], [completed]] = await Promise.all([
    db.select({ value: count() }).from(friendships).where(eq(friendships.userId, member.id)),
    db.select({ value: count() }).from(titleRatings).where(eq(titleRatings.userId, member.id)),
    db.select({ value: count() }).from(recommendations).where(eq(recommendations.senderId, member.id)),
    db.select({ value: count() }).from(chatMessages).where(eq(chatMessages.senderId, member.id)),
    db.select({ value: count() }).from(groupTitlePicks).where(eq(groupTitlePicks.addedBy, member.id)),
    db.select({ value: count() }).from(userTitleStates).where(and(eq(userTitleStates.userId, member.id), eq(userTitleStates.status, "completed"))),
  ]);
  const achievementSource = [
    { id: "first-take", icon: "✦", name: "First Take", description: "Publish your first rating", value: ratings?.value ?? 0, target: 1 },
    { id: "circle-builder", icon: "♧", name: "Circle Builder", description: "Connect with 3 friends", value: friends?.value ?? 0, target: 3 },
    { id: "conversation-starter", icon: "✉", name: "Conversation Starter", description: "Send 25 chat messages", value: messages?.value ?? 0, target: 25 },
    { id: "curator", icon: "☷", name: "The Curator", description: "Add 25 titles to group lists", value: curated?.value ?? 0, target: 25 },
    { id: "marathoner", icon: "✓", name: "Marathoner", description: "Complete 50 movies or shows", value: completed?.value ?? 0, target: 50 },
  ].map(item => ({ ...item, earned: item.value >= item.target, progress: Math.min(item.value, item.target) }));
  return Response.json({ profile: { displayName: member.displayName, username: member.username, avatarUrl: member.avatarUrl, bio: member.bio, friendListVisible: member.friendListVisible }, stats: { friends: friends?.value ?? 0, ratings: ratings?.value ?? 0, sent: sent?.value ?? 0 }, achievements: achievementSource });
}

export async function PATCH(request: Request) {
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });
  const member = await currentMember();
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { displayName?: string; username?: string; bio?: string; friendListVisible?: boolean };
  const displayName = body.displayName?.trim().slice(0, 50);
  const bio = body.bio?.trim().slice(0, 280) || null;
  const username = body.username?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 50) || member.username;
  const friendListVisible = typeof body.friendListVisible === "boolean" ? body.friendListVisible : member.friendListVisible;
  if (!displayName || displayName.length < 2) return Response.json({ error: "Choose a display name with at least two characters." }, { status: 400 });
  if (username && username !== member.username) {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (owner) return Response.json({ error: "That username is already taken. Please try another one." }, { status: 409 });
  }
  await db.update(users).set({ displayName, username, bio, friendListVisible, updatedAt: new Date() }).where(eq(users.id, member.id));
  // An email sign-up may choose their name immediately after accepting an invite.
  // Keep the inviter's join notification personal instead of leaving the placeholder name there.
  await db.update(notifications).set({ message: `${displayName} joined your CineApe circle.`, updatedAt: new Date() })
    .where(eq(notifications.link, `circle-join:${member.id}`));
  return Response.json({ profile: { displayName, username, avatarUrl: member.avatarUrl, bio, friendListVisible } });
}
