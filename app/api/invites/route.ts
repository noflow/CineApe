import { auth } from "@clerk/nextjs/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../db";
import { friendships, invitations, notifications, users } from "../../db/schema";

async function memberFor(clerkUserId: string) {
  if (!db) return null;
  const [member] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return member ?? null;
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Invites are temporarily unavailable." }, { status: 503 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Your CineApe profile is still being created. Refresh and try again." }, { status: 409 });

  const token = randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await db.insert(invitations).values({ token, createdBy: member.id, expiresAt });
  return Response.json({ token, expiresAt });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Invites are temporarily unavailable." }, { status: 503 });
  const body = await request.json() as { token?: string };
  const token = body.token?.trim();
  if (!token) return Response.json({ error: "An invite token is required." }, { status: 400 });
  const member = await memberFor(userId);
  if (!member) return Response.json({ error: "Your CineApe profile is still being created. Refresh and try again." }, { status: 409 });

  const [invite] = await db.select({ id: invitations.id, createdBy: invitations.createdBy, acceptedAt: invitations.acceptedAt, expiresAt: invitations.expiresAt, senderName: users.displayName })
    .from(invitations).innerJoin(users, eq(invitations.createdBy, users.id)).where(eq(invitations.token, token)).limit(1);
  if (!invite || invite.expiresAt < new Date()) return Response.json({ error: "This invite is no longer available." }, { status: 404 });
  if (invite.createdBy === member.id) return Response.json({ error: "You cannot accept your own invite." }, { status: 400 });
  if (invite.acceptedAt) return Response.json({ error: "This invite has already been used." }, { status: 409 });

  await db.insert(friendships).values([{ userId: invite.createdBy, friendId: member.id }, { userId: member.id, friendId: invite.createdBy }]).onConflictDoNothing();
  const updated = await db.update(invitations).set({ acceptedBy: member.id, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))).returning({ id: invitations.id });
  if (!updated.length) return Response.json({ error: "This invite has already been used." }, { status: 409 });
  await db.insert(notifications).values({
    userId: invite.createdBy,
    kind: "group_join",
    message: `${member.displayName} joined your CineApe circle.`,
    link: `circle-join:${member.id}`,
  });
  return Response.json({ status: "connected", senderName: invite.senderName });
}
