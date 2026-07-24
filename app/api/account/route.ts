import { auth, currentUser } from "@clerk/nextjs/server";
import { count, eq } from "drizzle-orm";
import { db } from "../../db";
import { friendships, notifications, recommendations, titleRatings, users } from "../../db/schema";

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
  const existing = await currentMember();
  if (existing) {
    await db.update(users).set({
      email, avatarUrl: clerkUser.imageUrl,
      // Preserve a name a member chose themselves, while replacing the old generic placeholder.
      displayName: existing.displayName === "CineApe member" && displayName !== "CineApe member" ? displayName : existing.displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({ clerkUserId: userId, email, displayName, avatarUrl: clerkUser.imageUrl });
  }
  return Response.json({ status: "ready" });
}

export async function GET() {
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });
  const member = await currentMember();
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const [[friends], [ratings], [sent]] = await Promise.all([
    db.select({ value: count() }).from(friendships).where(eq(friendships.userId, member.id)),
    db.select({ value: count() }).from(titleRatings).where(eq(titleRatings.userId, member.id)),
    db.select({ value: count() }).from(recommendations).where(eq(recommendations.senderId, member.id)),
  ]);
  return Response.json({ profile: { displayName: member.displayName, avatarUrl: member.avatarUrl, bio: member.bio }, stats: { friends: friends?.value ?? 0, ratings: ratings?.value ?? 0, sent: sent?.value ?? 0 } });
}

export async function PATCH(request: Request) {
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });
  const member = await currentMember();
  if (!member) return Response.json({ error: "Profile not found." }, { status: 404 });
  const body = await request.json() as { displayName?: string; bio?: string };
  const displayName = body.displayName?.trim().slice(0, 50);
  const bio = body.bio?.trim().slice(0, 280) || null;
  if (!displayName || displayName.length < 2) return Response.json({ error: "Choose a display name with at least two characters." }, { status: 400 });
  await db.update(users).set({ displayName, bio, updatedAt: new Date() }).where(eq(users.id, member.id));
  // An email sign-up may choose their name immediately after accepting an invite.
  // Keep the inviter's join notification personal instead of leaving the placeholder name there.
  await db.update(notifications).set({ message: `${displayName} joined your CineApe circle.`, updatedAt: new Date() })
    .where(eq(notifications.link, `circle-join:${member.id}`));
  return Response.json({ profile: { displayName, avatarUrl: member.avatarUrl, bio } });
}
