import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { editorListItems, editorLists, titles, users } from "../../db/schema";
import { EditorialShare } from "../../editorial-share";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

async function getList(slug: string) {
  if (!db) return null;
  const [list] = await db.select({ id: editorLists.id, name: editorLists.name, description: editorLists.description, seoTitle: editorLists.seoTitle, seoDescription: editorLists.seoDescription, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(and(eq(editorLists.slug, slug), eq(editorLists.status, "published"), or(isNull(editorLists.scheduledAt), lte(editorLists.scheduledAt, new Date())))).limit(1);
  if (!list) return null;
  const items = await db.select({ tmdbId: titles.tmdbId, name: titles.name, year: titles.releaseYear, type: titles.type, posterPath: titles.posterPath, position: editorListItems.position }).from(editorListItems).innerJoin(titles, eq(editorListItems.titleId, titles.id)).where(eq(editorListItems.listId, list.id)).orderBy(asc(editorListItems.position));
  return { ...list, items };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> { const list = await getList((await params).slug); return list ? { title: list.seoTitle || `${list.name} | CineApe`, description: list.seoDescription || list.description } : { title: "List not found | CineApe" }; }

export default async function MustWatchListPage({ params }: Props) {
  const list = await getList((await params).slug); if (!list) notFound();
  const date = list.publishedAt ? new Date(list.publishedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
  const covers = list.items.slice(0, 3);
  return <main className="editorial-public">
    <PublicHeader />
    <article className="editorial-review editorial-list-page">
      <div className="editorial-title">
        <p>CINEAPE EDITORIAL LIST</p>
        <h1>{list.name}</h1>
        <span>{list.description}</span>
        <small className="editorial-list-byline">Curated by {list.author}{date ? ` · ${date}` : ""}</small>
        <EditorialShare title="list" description={list.description} />
      </div>
      <section className="editorial-list-hero" aria-label={`${list.name} cover art`}>
        <div className="editorial-list-count"><b>{list.items.length}</b><span>{list.items.length === 1 ? "pick" : "picks"}<small>worth your time</small></span></div>
        <div className="editorial-list-covers">
          {covers.map((item, index) => item.posterPath ? <img className={`editorial-list-cover editorial-list-cover-${index}`} src={item.posterPath} alt={`${item.name} poster`} key={`${item.position}-${item.name}`} /> : <span className={`editorial-list-cover editorial-list-cover-${index}`} key={`${item.position}-${item.name}`}>{item.name}</span>)}
        </div>
      </section>
      <section className="editorial-copy editorial-list-copy">
        <p className="editorial-kicker">THE LINEUP</p>
        <h2>A watchlist worth starting tonight.</h2>
        <ol>{list.items.map(item => <li key={`${item.position}-${item.name}`}>
          {item.posterPath ? <img src={item.posterPath} alt={`${item.name} poster`} /> : <i>{item.position}</i>}
          <Link href={`/${item.type}/${item.tmdbId}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}><em>{String(item.position).padStart(2, "0")}</em><b>{item.name}</b><span>{item.type === "tv" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</span></Link>
        </li>)}</ol>
      </section>
      <section className="editorial-about"><p>WHAT IS CINEAPE?</p><h2>Good picks hit different when they come from people who know you.</h2><span>CineApe is a free place to discover movies and shows, keep your watchlist organized, and share recommendations with friends and family.</span></section>
      <section className="editorial-join"><div><p>MAKE YOUR NEXT WATCH A GOOD ONE</p><h2>Find something worth watching—then share it with your Circle.</h2><span>Join CineApe free to save picks, track what you watch, and trade recommendations with your people.</span></div><Link href="/" className="editorial-join-button">Join CineApe free →</Link></section>
    </article>
    <TmdbCredit />
  </main>;
}

function PublicHeader() { return <header className="editorial-header"><Link href="/" className="editorial-logo editorial-review-logo" aria-label="CineApe home"><img src="/cineape-mobile-logo.png?v=3" alt="CineApe" /></Link><nav><Link href="/reviews">Reviews</Link><Link className="active" href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header>; }
function TmdbCredit() { return <footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>; }
