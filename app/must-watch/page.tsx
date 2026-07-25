import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { editorLists, users } from "../db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CineApe Must Watch Lists", description: "CineApe editor picks for your next movie night." };

export default async function MustWatchPage() {
  const lists = db ? await db.select({ slug: editorLists.slug, name: editorLists.name, description: editorLists.description, publishedAt: editorLists.publishedAt, author: users.displayName })
    .from(editorLists).innerJoin(users, eq(editorLists.authorId, users.id)).where(eq(editorLists.status, "published")).orderBy(desc(editorLists.publishedAt)).limit(48) : [];
  return <main className="editorial-public"><header className="editorial-header"><Link href="/">CineApe</Link><nav><Link href="/reviews">Reviews</Link><Link href="/">Find your next pick</Link></nav></header><section className="must-watch-index"><p>CINEAPE EDITORIAL</p><h1>Must watch, according to CineApe.</h1><span>Hand-picked movies and shows for your next great watch.</span>{lists.length ? <div className="must-watch-grid">{lists.map(list => <Link href={`/must-watch/${list.slug}`} key={list.slug}><p>EDITOR'S LIST</p><h2>{list.name}</h2><span>{list.description}</span><small>By {list.author}</small></Link>)}</div> : <div className="must-watch-empty">Our first must-watch list is on its way. Check back soon.</div>}</section><footer className="editorial-tmdb">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer></main>;
}
