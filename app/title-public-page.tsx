import { notFound } from "next/navigation";
import { getSeoTitle, seoMetadata, type SeoTitleType } from "./title-seo";

export async function publicTitleMetadata(type: SeoTitleType, slug: string) {
  const title = await getSeoTitle(type, slug);
  return title ? seoMetadata(title, slug) : { title: "Title not found | CineApe" };
}

export async function PublicTitlePage({ type, slug }: { type: SeoTitleType; slug: string }) {
  const title = await getSeoTitle(type, slug);
  if (!title) notFound();
  const structuredData = { "@context": "https://schema.org", "@type": type === "movie" ? "Movie" : "TVSeries", name: title.name, dateCreated: title.year ? `${title.year}-01-01` : undefined, description: title.overview || undefined, image: title.poster || undefined, aggregateRating: title.score && title.votes ? { "@type": "AggregateRating", ratingValue: title.score, ratingCount: title.votes, bestRating: 10 } : undefined };
  return <main className="public-title-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <header className="public-title-header"><a href="/" aria-label="CineApe home"><img src="/cineape-mobile-logo.png?v=3" alt="CineApe" /></a><a className="public-title-join" href="/">Join CineApe</a></header>
    <section className="public-title-hero" style={title.backdrop ? { backgroundImage: `linear-gradient(90deg,#181423f5 0%,#181423d6 45%,#18142372 100%),url(${title.backdrop})` } : undefined}>
      <div className="public-title-content">{title.poster && <img className="public-title-poster" src={title.poster} alt={`${title.name} poster`} />}<div className="public-title-copy"><p className="eyebrow">CINEAPE TITLE PAGE</p><h1>{title.name}</h1><p className="public-title-meta">{type === "tv" ? "TV series" : "Movie"}{title.year ? ` · ${title.year}` : ""}{title.runtime ? ` · ${title.runtime} min` : ""}</p>{title.genres.length ? <p className="public-title-genres">{title.genres.join(" · ")}</p> : null}<p className="public-title-overview">{title.overview || "Details for this title are coming soon."}</p><div className="public-title-score">{title.score ? <><b>{title.score}</b><span>TMDB score · {title.votes.toLocaleString()} votes</span></> : <span>TMDB score unavailable</span>}</div><a className="public-title-cta" href="/">Rate it, save it, or recommend it on CineApe →</a></div></div>
    </section>
    {title.cast.length ? <section className="public-title-cast"><p className="eyebrow">CAST</p><h2>Meet the people behind {title.name}</h2><div>{title.cast.map(person => <article key={person.id}>{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}<b>{person.name}</b>{person.character ? <small>{person.character}</small> : null}</article>)}</div></section> : null}
    <section className="public-title-about"><p className="eyebrow">WHAT IS CINEAPE?</p><h2>Find your next great watch through people you trust.</h2><p>Rate what you watch, build a Watchlist, and share the titles you love with friends and family.</p><a href="/">Create your free CineApe account</a></section>
    <footer className="public-title-footer">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</footer>
  </main>;
}
