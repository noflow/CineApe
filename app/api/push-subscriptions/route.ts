import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { users, webPushSubscriptions } from "../../db/schema";

type SubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function currentMember() {
  const { userId } = await auth();
  if (!userId || !db) return null;
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, userId)).limit(1);
  return member ?? null;
}

function validSubscription(value: SubscriptionPayload) {
  return typeof value.endpoint === "string" && value.endpoint.startsWith("https://")
    && typeof value.keys?.p256dh === "string" && value.keys.p256dh.length > 10
    && typeof value.keys?.auth === "string" && value.keys.auth.length > 5;
}

export async function GET() {
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });
  const [subscription] = await db!.select({ notifyMovies: webPushSubscriptions.notifyMovies, notifyTv: webPushSubscriptions.notifyTv })
    .from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, member.id)).limit(1);
  return Response.json({
    configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    enabled: Boolean(subscription),
    preferences: { notifyMovies: subscription?.notifyMovies ?? true, notifyTv: subscription?.notifyTv ?? true },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return Response.json({ error: "Release alerts are still being set up." }, { status: 503 });
  const body = await request.json().catch(() => null) as { subscription?: SubscriptionPayload; notifyMovies?: boolean; notifyTv?: boolean } | null;
  if (!body?.subscription || !validSubscription(body.subscription)) return Response.json({ error: "That device could not be registered for alerts." }, { status: 400 });
  await db!.insert(webPushSubscriptions).values({
    userId: member.id,
    endpoint: body.subscription.endpoint!,
    p256dh: body.subscription.keys!.p256dh!,
    auth: body.subscription.keys!.auth!,
    notifyMovies: body.notifyMovies ?? true,
    notifyTv: body.notifyTv ?? true,
  }).onConflictDoUpdate({
    target: webPushSubscriptions.endpoint,
    set: { userId: member.id, p256dh: body.subscription.keys!.p256dh!, auth: body.subscription.keys!.auth!, notifyMovies: body.notifyMovies ?? true, notifyTv: body.notifyTv ?? true, updatedAt: new Date() },
  });
  return Response.json({ status: "enabled" });
}

export async function PATCH(request: Request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { notifyMovies?: boolean; notifyTv?: boolean } | null;
  if (typeof body?.notifyMovies !== "boolean" || typeof body?.notifyTv !== "boolean") return Response.json({ error: "Choose your alert preferences." }, { status: 400 });
  await db!.update(webPushSubscriptions).set({ notifyMovies: body.notifyMovies, notifyTv: body.notifyTv, updatedAt: new Date() }).where(eq(webPushSubscriptions.userId, member.id));
  return Response.json({ status: "updated" });
}

export async function DELETE(request: Request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  if (body?.endpoint) await db!.delete(webPushSubscriptions).where(and(eq(webPushSubscriptions.userId, member.id), eq(webPushSubscriptions.endpoint, body.endpoint)));
  else await db!.delete(webPushSubscriptions).where(eq(webPushSubscriptions.userId, member.id));
  return Response.json({ status: "disabled" });
}
