/* eslint-disable @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { editorListItems, editorLists, titles, users } from "../db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CineApe Must Watch Lists", description: "CineApe editor picks for your next movie night." };

async function MustWatchPageLegacy() {
  const lists = db ? await db.select({ slug: editorLists.slug, name: editorLists.name, description: editorLists.description, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(eq(editorLists.status, "published")).orderBy(desc(editorLists.publishedAt)).limit(48) : [];
  return <main className="editorial-public"><header className="editorial-header"><Link href="/">CineApe</Link><nav><Link href="/reviews">Reviews</Link><Link href="/">Find your next pick</Link></nav></header><section className="must-watch-index"><p>CINEAPE EDITORIAL</p><h1>Must watch, according to CineApe.</h1><span>Hand-picked movies and shows for your next great watch.</span>{lists.length ? <div className="must-watch-grid">{lists.map(list => <Link href={`/must-watch/${list.slug}`} key={list.slug}><p>EDITOR'S LIST</p><h2>{list.name}</h2><span>{list.description}</span><small>By {list.author}</small></Link>)}</div> : <div className="must-watch-empty">Our first must-watch list is on its way. Check back soon.</div>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}

export default async function MustWatchPage() {
  const lists = db ? await db.select({ id: editorLists.id, slug: editorLists.slug, name: editorLists.name, description: editorLists.description, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(eq(editorLists.status, "published")).orderBy(desc(editorLists.publishedAt)).limit(48) : [];
  const rows = lists.length && db ? await db.select({ listId: editorListItems.listId, name: titles.name, posterPath: titles.posterPath, position: editorListItems.position }).from(editorListItems).innerJoin(titles, eq(editorListItems.titleId, titles.id)).where(inArray(editorListItems.listId, lists.map(list => list.id))).orderBy(asc(editorListItems.position)) : [];
  const covers = new Map<string, typeof rows>();
  for (const row of rows) covers.set(row.listId, [...(covers.get(row.listId) ?? []), row]);
  const [featured, ...remaining] = lists;
  return <main className="editorial-public"><EditorialHeader /><section className="editorial-index"><div className="editorial-index-intro"><p>CINEAPE EDITORIAL</p><h1>Must watch, according to CineApe.</h1><span>Hand-picked movies and shows for the next time you want a great watch without the scroll.</span></div>{featured ? <Link className="editorial-list-feature" href={`/must-watch/${featured.slug}`}><div>{(covers.get(featured.id) ?? []).slice(0, 3).map((item, index) => item.posterPath ? <img key={item.name} className={`list-cover-${index}`} src={item.posterPath} alt="" /> : <span key={item.name} className={`list-cover-${index}`}>{item.name}</span>)}</div><article><p>EDITOR'S LIST</p><h2>{featured.name}</h2><strong>{featured.description}</strong><span>Curated by {featured.author}</span><i>Explore the list {String.fromCharCode(8594)}</i></article></Link> : <div className="must-watch-empty"><b>Our first must-watch list is on its way.</b><span>Check back soon for a fresh CineApe shortlist.</span></div>}{remaining.length > 0 && <section className="editorial-index-section"><div><p>MORE SHORTLISTS</p><h2>Pick a mood. Press play.</h2></div><div className="must-watch-grid editorial-list-grid">{remaining.map(list => <Link href={`/must-watch/${list.slug}`} key={list.slug}><div className="mini-list-covers">{(covers.get(list.id) ?? []).slice(0, 3).map(item => item.posterPath ? <img key={item.name} src={item.posterPath} alt="" /> : <span key={item.name}>{item.name.slice(0, 1)}</span>)}</div><p>EDITOR'S LIST</p><h2>{list.name}</h2><span>{list.description}</span><small>Curated by {list.author} <b>{String.fromCharCode(8594)}</b></small></Link>)}</div></section>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}

function EditorialHeader() { return <header className="editorial-header"><Link href="/" className="editorial-logo" aria-label="CineApe home"><img src="/cineape-logo-dark.png" alt="CineApe" /></Link><nav><Link href="/reviews">Reviews</Link><Link className="active" href="/must-watch">Must watch</Link><Link href="/">Find your next pick</Link><Link href="/" className="editorial-header-join">Join free</Link></nav></header>; }
