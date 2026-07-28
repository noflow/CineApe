import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { editorLists, editorReviews } from "./db/schema";

const baseUrl = "https://cineape.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/reviews`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/must-watch`, changeFrequency: "weekly", priority: 0.8 },
  ];
  if (!db) return fixed;
  const [reviews, lists] = await Promise.all([
    db.select({ slug: editorReviews.slug, updatedAt: editorReviews.updatedAt }).from(editorReviews).where(eq(editorReviews.status, "published")).orderBy(desc(editorReviews.publishedAt)).limit(500),
    db.select({ slug: editorLists.slug, updatedAt: editorLists.updatedAt }).from(editorLists).where(eq(editorLists.status, "published")).orderBy(desc(editorLists.publishedAt)).limit(500),
  ]);
  return [
    ...fixed,
    ...reviews.map(review => ({ url: `${baseUrl}/reviews/${review.slug}`, lastModified: review.updatedAt, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...lists.map(list => ({ url: `${baseUrl}/must-watch/${list.slug}`, lastModified: list.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
