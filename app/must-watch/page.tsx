/* eslint-disable @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { editorListItems, editorLists, titles, users } from "../db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CineApe Must Watch Lists", description: "CineApe editor picks for your next movie night.", alternates: { canonical: "/must-watch" }, openGraph: { title: "CineApe Must Watch Lists", description: "CineApe editor picks for your next movie night.", type: "website", url: "/must-watch" } };

async function MustWatchPageLegacy() {
  const lists = db ? await db.select({ slug: editorLists.slug, name: editorLists.name, description: editorLists.description, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(and(eq(editorLists.status, "published"), or(isNull(editorLists.scheduledAt), lte(editorLists.scheduledAt, new Date())))).orderBy(desc(editorLists.publishedAt)).limit(48) : [];
  return <main className="editorial-public"><header className="editorial-header"><Link href="/">CineApe</Link><nav><Link href="/reviews">Reviews</Link><Link href="/">Find your next pick</Link></nav></header><section className="must-watch-index"><p>CINEAPE EDITORIAL</p><h1>Must watch, according to CineApe.</h1><span>Hand-picked movies and shows for your next great watch.</span>{lists.length ? <div className="must-watch-grid">{lists.map(list => <Link href={`/must-watch/${list.slug}`} key={list.slug}><p>EDITOR'S LIST</p><h2>{list.name}</h2><span>{list.description}</span><small>By {list.author}</small></Link>)}</div> : <div className="must-watch-empty">Our first must-watch list is on its way. Check back soon.</div>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}

export default async function MustWatchPage() {
  const lists = db ? await db.select({ id: editorLists.id, slug: editorLists.slug, name: editorLists.name, description: editorLists.description, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(and(eq(editorLists.status, "published"), or(isNull(editorLists.scheduledAt), lte(editorLists.scheduledAt, new Date())))).orderBy(desc(editorLists.publishedAt)).limit(48) : [];
  const rows = lists.length && db ? await db.select({ listId: editorListItems.listId, name: titles.name, posterPath: titles.posterPath, position: editorListItems.position }).from(editorListItems).innerJoin(titles, eq(editorListItems.titleId, titles.id)).where(inArray(editorListItems.listId, lists.map(list => list.id))).orderBy(asc(editorListItems.position)) : [];
  const covers = new Map<string, typeof rows>();
  for (const row of rows) covers.set(row.listId, [...(covers.get(row.listId) ?? []), row]);
  const [featured, ...remaining] = lists;
  const featuredCover = featured ? covers.get(featured.id)?.[0] : null;
  return <main className="editorial-public">
    <EditorialHeader />
    <section className="editorial-index">
      <div className="editorial-index-intro">
        <p>CINEAPE EDITORIAL</p>
        <h1>Must watch, according to CineApe.</h1>
        <span>Hand-picked movies and shows for the next time you want a great watch without the scroll.</span>
      </div>
      {featured ? <Link className="editorial-feature" href={`/must-watch/${featured.slug}`}>
        <div className="editorial-feature-art">
          {featuredCover?.posterPath ? <img src={featuredCover.posterPath} alt={`${featured.name} cover`} /> : <span>{featured.name}</span>}
        </div>
        <div>
          <p>LATEST LIST</p>
          <h2>{featured.name}</h2>
          <strong>{featured.description}</strong>
          <span>Curated by {featured.author}</span>
          <i>Explore the list &rarr;</i>
        </div>
      </Link> : <EditorialEmpty />}
      {remaining.length > 0 && <section className="editorial-index-section">
        <div><p>MORE FROM THE DESK</p><h2>Find your next great watch.</h2></div>
        <div className="review-card-grid">
          {remaining.map(list => {
            const cover = covers.get(list.id)?.[0];
            return <Link className="editorial-review-card" href={`/must-watch/${list.slug}`} key={list.slug}>
              {cover?.posterPath ? <img src={cover.posterPath} alt={`${list.name} cover`} /> : <span className="editorial-card-art">{list.name}</span>}
              <div><small>EDITOR'S LIST</small><b>{list.name}</b><p>{list.description}</p><em>Explore list &rarr;</em></div>
            </Link>;
          })}
        </div>
      </section>}
    </section>
    <EditorialCredit />
  </main>;
}

function EditorialHeader() { return <header className="editorial-header"><Link href="/" className="editorial-logo editorial-review-logo" aria-label="CineApe home"><img src="/cineape-mobile-logo.png?v=3" alt="CineApe" /></Link><nav><Link href="/reviews">Reviews</Link><Link className="active" href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header>; }
function EditorialEmpty() { return <div className="must-watch-empty"><b>Our first must-watch list is on its way.</b><span>Check back soon for a fresh CineApe shortlist.</span></div>; }
function EditorialCredit() { return <footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>; }
