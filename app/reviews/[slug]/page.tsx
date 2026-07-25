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
  return <main className="editorial-public"><PublicHeader /><article className="editorial-review"><div className="editorial-title"><p>CINEAPE EDITOR REVIEW</p><h1>{review.title}</h1><span>{review.type === "tv" ? "TV series" : "Movie"}{review.year ? ` · ${review.year}` : ""}</span></div><div className="editorial-hero"><div className="editorial-score"><b>{review.score}</b><span>/10</span><small>CineApe score</small></div>{review.posterPath && <img src={review.posterPath} alt={`${review.title} poster`} />}</div><section className="editorial-copy"><p className="editorial-kicker">THE VERDICT</p><h2>{review.headline}</h2>{review.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<footer>Written by {review.author}{date ? ` · ${date}` : ""}</footer></section></article><TmdbCredit /></main>;
}

function PublicHeader() { return <header className="editorial-header"><Link href="/">CineApe</Link><nav><Link href="/reviews">Reviews</Link><Link href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link></nav></header>; }
function TmdbCredit() { return <footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>; }
