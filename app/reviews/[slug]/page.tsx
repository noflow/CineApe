import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { editorReviews, titles, users } from "../../db/schema";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

async function getReview(slug: string) {
  if (!db) return null;
  const [review] = await db.select({
    headline: editorReviews.headline, body: editorReviews.body, score: editorReviews.score, seoTitle: editorReviews.seoTitle,
    seoDescription: editorReviews.seoDescription, publishedAt: editorReviews.publishedAt, title: titles.name, year: titles.releaseYear,
    type: titles.type, posterPath: titles.posterPath, author: users.displayName,
  }).from(editorReviews).innerJoin(titles, eq(editorReviews.titleId, titles.id)).innerJoin(users, eq(editorReviews.authorId, users.id))
    .where(and(eq(editorReviews.slug, slug), eq(editorReviews.status, "published"))).limit(1);
  return review ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const review = await getReview((await params).slug);
  if (!review) return { title: "Review not found | CineApe" };
  return { title: review.seoTitle || `${review.title} review | CineApe`, description: review.seoDescription || review.headline };
}

export default async function ReviewPage({ params }: Props) {
  const review = await getReview((await params).slug);
  if (!review) notFound();
  const date = review.publishedAt ? new Date(review.publishedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
  return <main className="editorial-public"><PublicHeader /><article className="editorial-review"><div className="editorial-title"><p>CINEAPE EDITOR REVIEW</p><h1>{review.title}</h1><span>{review.type === "tv" ? "TV series" : "Movie"}{review.year ? ` · ${review.year}` : ""}</span></div><div className="editorial-hero"><div className="editorial-score"><b>{review.score}</b><span>/10</span><small>CineApe score</small></div>{review.posterPath && <img src={review.posterPath} alt={`${review.title} poster`} />}</div><section className="editorial-copy"><p className="editorial-kicker">THE VERDICT</p><h2>{review.headline}</h2>{review.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<footer>Written by {review.author}{date ? ` · ${date}` : ""}</footer></section><section className="editorial-about"><p>WHAT IS CINEAPE?</p><h2>Good picks hit different when they come from people who know you.</h2><span>CineApe is a free place to discover movies and shows, keep your watchlist organized, and share recommendations with friends and family.</span></section><section className="editorial-join"><div><p>MAKE YOUR NEXT WATCH A GOOD ONE</p><h2>Find something worth watching—then share it with your Circle.</h2><span>Join CineApe free to save picks, track what you watch, and trade recommendations with your people.</span></div><Link href="/" className="editorial-join-button">Join CineApe free →</Link></section></article><TmdbCredit /></main>;
}

function PublicHeader() { return <header className="editorial-header"><Link href="/" className="editorial-logo" aria-label="CineApe home"><img src="/cineape-logo-dark.png" alt="CineApe"/></Link><nav><Link href="/reviews">Reviews</Link><Link href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header>; }
function TmdbCredit() { return <footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>; }
