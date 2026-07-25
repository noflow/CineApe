import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { editorReviews, titles, users } from "../db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CineApe Editor Reviews",
  description: "Official CineApe movie and TV reviews, written to help you choose what to watch next.",
};

export default async function ReviewsPage() {
  const reviews = db ? await db.select({
    slug: editorReviews.slug,
    headline: editorReviews.headline,
    score: editorReviews.score,
    title: titles.name,
    type: titles.type,
    year: titles.releaseYear,
    author: users.displayName,
  }).from(editorReviews).innerJoin(titles, eq(editorReviews.titleId, titles.id)).innerJoin(users, eq(editorReviews.authorId, users.id))
    .where(eq(editorReviews.status, "published")).orderBy(desc(editorReviews.publishedAt)).limit(48) : [];

  return <main className="editorial-public"><header className="editorial-header"><Link href="/">CineApe</Link><nav><Link href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link></nav></header><section className="must-watch-index"><p>CINEAPE EDITORIAL</p><h1>Reviews that help you pick well.</h1><span>Our spoiler-safe take on movies and TV shows worth your time.</span>{reviews.length ? <div className="must-watch-grid review-index-grid">{reviews.map(review => <Link href={`/reviews/${review.slug}`} key={review.slug}><p>EDITOR REVIEW · {review.score}/10</p><h2>{review.title}</h2><span>{review.headline}</span><small>{review.type === "tv" ? "TV series" : "Movie"}{review.year ? ` · ${review.year}` : ""} · By {review.author}</small></Link>)}</div> : <div className="must-watch-empty">Our first official review is being prepared. Check back soon.</div>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}
