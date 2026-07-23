import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "../../db";
import { users } from "../../db/schema";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!db) return Response.json({ error: "Database is unavailable." }, { status: 503 });

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!clerkUser || !email) return Response.json({ error: "An email address is required to create a CineApe profile." }, { status: 400 });

  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "CineApe member";
  await db.insert(users).values({ clerkUserId: userId, email, displayName, avatarUrl: clerkUser.imageUrl }).onConflictDoUpdate({
    target: users.clerkUserId,
    set: { email, displayName, avatarUrl: clerkUser.imageUrl, updatedAt: new Date() },
  });

  return Response.json({ status: "ready" });
}
