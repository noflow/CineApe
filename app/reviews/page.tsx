/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { editorReviews, titles, users } from "../db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CineApe Editor Reviews",
  description: "Official CineApe movie and TV reviews, written to help you choose what to watch next.",
};

async function ReviewsPageLegacy() {
  const reviews = db ? await db.select({
    slug: editorReviews.slug,
    headline: editorReviews.headline,
    score: editorReviews.score,
    title: titles.name,
    type: titles.type,
    year: titles.releaseYear,
    author: sql<string>`coalesce(${users.displayName}, 'CineApe Editor')`,
  }).from(editorReviews).innerJoin(titles, eq(editorReviews.titleId, titles.id)).leftJoin(users, eq(editorReviews.authorId, users.id))
    .where(eq(editorReviews.status, "published")).orderBy(desc(editorReviews.publishedAt)).limit(48) : [];

  return <main className="editorial-public"><header className="editorial-header"><Link href="/" className="editorial-logo" aria-label="CineApe home"><img src="/cineape-logo-dark.png" alt="CineApe"/></Link><nav><Link href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header><section className="must-watch-index"><p>CINEAPE EDITORIAL</p><h1>Reviews that help you pick well.</h1><span>Our spoiler-safe take on movies and TV shows worth your time.</span>{reviews.length ? <div className="must-watch-grid review-index-grid">{reviews.map(review => <Link href={`/reviews/${review.slug}`} key={review.slug}><p>EDITOR REVIEW &middot; {review.score}/10</p><h2>{review.title}</h2><span>{review.headline}</span><small>{review.type === "tv" ? "TV series" : "Movie"}{review.year ? ` ${String.fromCharCode(183)} ${review.year}` : ""} {" " + String.fromCharCode(183) + " By "}{review.author}</small></Link>)}</div> : <div className="must-watch-empty">Our first official review is being prepared. Check back soon.</div>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}

export default async function ReviewsPage() {
  const reviews = db ? await db.select({ slug: editorReviews.slug, headline: editorReviews.headline, score: editorReviews.score, title: titles.name, type: titles.type, year: titles.releaseYear, posterPath: titles.posterPath, author: sql<string>`coalesce(${users.displayName}, 'CineApe Editor')` }).from(editorReviews).innerJoin(titles, eq(editorReviews.titleId, titles.id)).leftJoin(users, eq(editorReviews.authorId, users.id)).where(eq(editorReviews.status, "published")).orderBy(desc(editorReviews.publishedAt)).limit(48) : [];
  const [featured, ...remaining] = reviews;
  return <main className="editorial-public"><EditorialHeader active="reviews" /><section className="editorial-index"><div className="editorial-index-intro"><p>CINEAPE EDITORIAL</p><h1>Reviews that help you pick well.</h1><span>Thoughtful, spoiler-safe takes on movies and shows worth making time for.</span></div>{featured ? <Link className="editorial-feature" href={`/reviews/${featured.slug}`}><div className="editorial-feature-art">{featured.posterPath ? <img src={featured.posterPath} alt={`${featured.title} poster`} /> : <span>{featured.title}</span>}<b>{featured.score}<small>/10</small></b></div><div><p>LATEST REVIEW</p><h2>{featured.title}</h2><strong>{featured.headline}</strong><span>{featured.type === "tv" ? "TV series" : "Movie"}{featured.year ? ` ${String.fromCharCode(183)} ${featured.year}` : ""} {" " + String.fromCharCode(183) + " By "}{featured.author}</span><i>Read the review {String.fromCharCode(8594)}</i></div></Link> : <EditorialEmpty label="Our first official review is being prepared." />}{remaining.length > 0 && <section className="editorial-index-section"><div><p>MORE FROM THE DESK</p><h2>Find your next great watch.</h2></div><div className="review-card-grid">{remaining.map(review => <Link className="editorial-review-card" href={`/reviews/${review.slug}`} key={review.slug}>{review.posterPath ? <img src={review.posterPath} alt={`${review.title} poster`} /> : <span className="editorial-card-art">{review.title}</span>}<div><small>{review.type === "tv" ? "TV SERIES" : "MOVIE"}{review.year ? ` ${String.fromCharCode(183)} ${review.year}` : ""}</small><b>{review.title}</b><p>{review.headline}</p><em>{review.score}/10</em></div></Link>)}</div></section>}</section><EditorialCredit /></main>;
}

export function EditorialHeader({ active }: { active: "reviews" | "lists" }) { return <header className="editorial-header"><Link href="/" className="editorial-logo" aria-label="CineApe home"><img src="/cineape-logo-dark.png" alt="CineApe" /></Link><nav><Link className={active === "reviews" ? "active" : ""} href="/reviews">Reviews</Link><Link className={active === "lists" ? "active" : ""} href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header>; }
export function EditorialEmpty({ label }: { label: string }) { return <div className="must-watch-empty"><b>{label}</b><span>Check back soon for another spoiler-safe CineApe take.</span></div>; }
export function EditorialCredit() { return <footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>; }
