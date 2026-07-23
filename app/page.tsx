"use client";

import { useEffect, useState } from "react";
import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";

type Page = "Home" | "Discover" | "For You" | "Friends & Groups" | "My Profile" | "Title";
const titles = [
  ["The Substance", "2025 · Drama", "8.7", "a", "Watched by 4 friends"],
  ["The Bear", "Season 2 · Series", "8.4", "b", "Recommended by Maya"],
  ["Mickey 17", "2025 · Sci-fi", "8.2", "c", "3 friends saved this"],
  ["Furiosa", "2024 · Action", "8.9", "d", "Top rated in your circle"],
];
const recs = [
  ["Last Summer", "Maya Reynolds", "Soft, funny, and quietly devastating. I immediately thought of you.", "sunset", "NEW TODAY"],
  ["Slow Horses", "John Baker", "Smart spy stuff, great characters, and Gary Oldman is ridiculous in the best way.", "blue", ""],
  ["The Holdovers", "Sarah Kim", "This is the cozy, sharp little movie you need for a rainy night.", "red", ""],
];

function Avatar({ children, tone = "", imageUrl }: { children: React.ReactNode; tone?: string; imageUrl?: string | null }) { return <span className={`avatar ${tone}`}>{imageUrl ? <img src={imageUrl} alt="" /> : children}</span>; }
function PosterImage({ title }: { title: string }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tmdb?query=${encodeURIComponent(title)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ image?: string }> : null)
      .then((data) => data?.image && setImage(data.image))
      .catch(() => undefined);
    return () => controller.abort();
  }, [title]);
  return image ? <img src={image} alt={`${title} poster`} /> : null;
}
function Cover({ title, meta, score, tone, onClick }: { title: string; meta: string; score: string; tone: string; onClick?: () => void }) {
  return <button className={`cover ${tone}`} onClick={onClick}><PosterImage title={title}/><span className="cover-type">{meta.includes("Series") ? "Series" : "Movie"}</span><span className="cover-score">★ {score}</span><span className="cover-title"><small>{meta}</small>{title}</span></button>;
}

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [page, setPage] = useState<Page>("Home");
  const [selectedTitle, setSelectedTitle] = useState({ title: "Mickey 17", meta: "2025 · Science fiction", score: "8.2" });
  const [modal, setModal] = useState<"recommend" | "rate" | null>(null);
  const [toast, setToast] = useState("");
  const [watching, setWatching] = useState<string[]>(["Slow Horses"]);
  const [recipient, setRecipient] = useState("Maya");
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const openTitle = (title = "Mickey 17", meta = "2025 · Science fiction", score = "8.2") => { setSelectedTitle({ title, meta, score }); setPage("Title"); };
  const nav = ["Home", "Discover", "For You", "Friends & Groups", "My Profile"] as Page[];
  const shown = page === "Title" ? "Title" : page;

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "CineApe member";
  const firstName = user?.firstName || displayName.split(" ")[0] || "there";
  const initials = displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const movieCards = (limit = 4) => <div className="cards">{titles.slice(0, limit).map(([title, meta, score, tone]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={() => openTitle(title, meta, score)}/><strong>{title}</strong><span>Save it to your watchlist</span></div>)}</div>;
  const recommend = () => <button className="primary" onClick={() => setModal("recommend")}>+ Recommend</button>;

  if (!isLoaded || !isSignedIn) return <LandingPage />;

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setPage("Home")}><i></i>CineApe</button><p>MENU</p><nav>{nav.map((item, index) => <button key={item} className={shown === item ? "active" : ""} onClick={() => setPage(item)}><span>{["⌂", "⌕", "✦", "♧", "◉"][index]}</span>{item}</button>)}</nav><div className="account"><Avatar imageUrl={user?.imageUrl}>{initials}</Avatar><div><strong>{displayName}</strong><span>Free plan</span></div></div></aside>
    <main><header><button className="mobile-brand" onClick={() => setPage("Home")}><i></i>CineApe</button><label className="search">⌕<input placeholder="Search movies, shows, people..."/></label><div><button className="bell" aria-label="Notifications">♧</button>{recommend()}</div></header>

    {page === "Home" && <section className="page home onboarding-home"><div className="hero onboarding-hero"><div><p className="eyebrow">WELCOME TO CINEAPE, {firstName.toUpperCase()}</p><h1>Your circle starts with one great pick.</h1><p>Discover something worth watching, then invite the people whose recommendations you trust most.</p><button className="light-button" onClick={() => setPage("Discover")}>Discover movies and shows →</button></div><div className="poster-stack"><span className="poster poster-1">YOUR<br/>NEXT</span><span className="poster poster-2">GREAT<br/>PICK</span><span className="poster poster-3">START<br/>HERE</span></div></div><div className="onboarding-steps"><article className="panel"><b>01</b><h2>Find something you’ll love</h2><p>Browse movies and shows, then save the ones that look promising.</p><button onClick={() => setPage("Discover")}>Explore titles →</button></article><article className="panel"><b>02</b><h2>Invite your people</h2><p>Build a private circle for family, friends, or your movie-night group.</p><button onClick={() => setPage("Friends & Groups")}>Start your circle →</button></article><article className="panel"><b>03</b><h2>Make recommendations personal</h2><p>Send a pick with a note when you know someone will love it.</p><button onClick={() => flash("Choose a title to send your first recommendation.")}>How it works →</button></article></div><div className="section-title lower"><h2>Start with something good</h2><button onClick={() => setPage("Discover")}>Explore all</button></div>{movieCards()}</section>}

    {page === "Discover" && <section className="page"><Intro label="CURATED FOR YOU" title="Find your next obsession." text="Browse the titles your circle is talking about and make every watch count." action={recommend()}/><Tabs labels={["All", "Movies", "TV Shows", "From friends", "Hidden gems"]}/><div className="discover-grid">{[...titles, ["Dark Matter", "Series · Mind-bender", "8.5", "e", "91% taste match"]].map(([title, meta, score, tone, note]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={openTitle}/><strong>{title}</strong><span>{note}</span></div>)}</div></section>}

    {page === "Title" && <TitleDetails selection={selectedTitle} onBack={() => setPage("Discover")} onRecommend={() => setModal("recommend")}/>} 

    {page === "For You" && <section className="page"><Intro label="YOUR RECOMMENDATIONS" title="From people who get you." text="Keep track of every great pick, thoughtful note, and your own verdict." action={recommend()}/><div className="inbox-layout"><div><Tabs labels={["For you 3", "Sent", "Watching", "Completed"]}/><div className="panel inbox">{recs.map(([title, person, message, tone, label]) => <article key={title}><span className={`inbox-cover ${tone}`}></span><div><h3>{title} {label && <small>{label}</small>}</h3><p>Recommended by <b>{person}</b> · {title === "Slow Horses" ? "TV series · 4 seasons" : "Movie · 2025"}</p><em>“{message}”</em></div><div><button className="small-primary" onClick={() => { setWatching(watching.includes(title) ? watching : [...watching, title]); flash(`Added ${title} to your Watching list`); }}>{watching.includes(title) ? "Watching" : "Start watching"}</button><button className="small-ghost">Save</button></div></article>)}</div></div><aside className="panel people"><div className="section-title"><h2>People you trust</h2><button onClick={() => setPage("Friends & Groups")}>Manage</button></div><Friend name="Maya Reynolds" initials="MR" match="92%"/><Friend name="John Baker" initials="JB" match="87%" tone="blue-tone"/><Friend name="Sarah Kim" initials="SK" match="81%" tone="rose-tone"/><div className="match-card"><b>92% taste match</b><span>Maya’s recommendations almost always land for you.</span></div></aside></div></section>}

    {page === "Friends & Groups" && <section className="page"><Intro label="YOUR PEOPLE" title="Better together." text="Share the good stuff with the people you actually watch with." action={<button className="primary" onClick={() => flash("Group creation is ready for the next build step.")}>+ Create a group</button>}/><div className="group-grid"><Group icon="⌂" name="Sunday Movie Crew" info="6 members · Movie night every Sunday"/><Group icon="♧" name="The Bakers" info="5 members · Family favorites" pink/><Group icon="✦" name="Shows worth binging" info="11 members · 32 active picks" green/></div><div className="panel activity"><div className="section-title"><h2>Circle activity</h2><button>See all activity</button></div><Activity who="Maya" initial="MR" text="recommended Last Summer to you." time="Today"/><Activity who="John" initial="JB" text="finished Slow Horses and rated it 9/10." time="Yesterday"/><Activity who="Sarah" initial="SK" text="added The Holdovers to Sunday Movie Crew." time="Mon"/></div></section>}

    {page === "My Profile" && <section className="page"><div className="panel profile-head"><Avatar>SB</Avatar><div><h1>Shawn Baker</h1><p>Drama seeker · 38 ratings · Member since 2025</p></div><div className="profile-stats"><b>87%<span>Circle match</span></b><b>26<span>Recommendations sent</span></b><b>8.4<span>Average rating</span></b></div></div><div className="profile-grid"><div className="panel taste"><h2>Your taste profile</h2><p>Built from what you watch, rate, and save.</p>{[["Drama", "93"], ["Sci-fi", "84"], ["Comedy", "71"], ["Thriller", "67"], ["Horror", "33"]].map(([name, value]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{width:`${value}%`}}></b></i><strong>{value}</strong></div>)}</div><div className="panel accuracy"><h2>Recommendation accuracy</h2><p>Who knows your taste best?</p><Friend name="Maya Reynolds" initials="MR" match="92%"/><Friend name="John Baker" initials="JB" match="87%" tone="blue-tone"/><Friend name="Sarah Kim" initials="SK" match="81%" tone="rose-tone"/></div></div></section>}
    </main>
    <TmdbAttribution />
    <div className="auth-float"><AccountControls /></div>
    {modal && <div className="backdrop" onClick={() => setModal(null)}><div className="modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setModal(null)}>×</button>{modal === "recommend" ? <><h2>Send a recommendation</h2><p>Make it personal. Great picks deserve a note.</p><div className="selected-title"><span></span><b>Mickey 17<small>2025 · Science fiction</small></b></div><label>SEND TO</label><div className="recipients">{["Maya", "John", "Sarah"].map(name => <button className={recipient === name ? "chosen" : ""} key={name} onClick={() => setRecipient(name)}>{name}</button>)}</div><label>ADD A NOTE <small>(optional)</small></label><textarea placeholder="Why will they love it?"></textarea><button className="primary wide" onClick={() => {setModal(null);flash(`Recommendation sent to ${recipient} ✦`)}}>Send recommendation ✦</button></> : <><h2>How was Mickey 17?</h2><p>Your rating helps your circle recommend better.</p><label>YOUR OVERALL RATING</label><div className="recipients"><button>6</button><button>7</button><button className="chosen">8</button><button>9</button><button>10</button></div><label>HOW GOOD WAS MAYA’S RECOMMENDATION?</label><button className="rate-choice">Perfect for me ✨</button><button className="rate-choice">Pretty good</button><button className="rate-choice">Not my thing</button><button className="primary wide" onClick={() => {setModal(null);flash("Your rating was saved — Maya will love this.")}}>Save my rating</button></>}</div></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function AccountControls() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;
    void fetch("/api/account", { method: "POST" });
  }, [isSignedIn]);

  return <div className="auth-controls">
    <Show when="signed-out">
      <SignInButton><button className="sign-in">Sign in</button></SignInButton>
      <SignUpButton><button className="join-circle">Join free</button></SignUpButton>
    </Show>
    <Show when="signed-in"><UserButton appearance={{ elements: { avatarBox: "user-avatar" } }} /></Show>
  </div>;
}
function LandingPage() {
  return <div className="landing">
    <header className="landing-nav">
      <a className="landing-brand" href="#top"><i></i>CineApe</a>
      <nav aria-label="Landing page"><a href="#how-it-works">How it works</a><a href="#why-cineape">Why CineApe</a></nav>
      <div className="landing-actions"><SignInButton><button className="landing-sign-in">Sign in</button></SignInButton><SignUpButton><button className="landing-join">Join free</button></SignUpButton></div>
    </header>

    <main id="top">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow">YOUR NEXT FAVORITE IS CLOSER THAN YOU THINK</p>
          <h1>What should we watch?<br/><em>Ask your people.</em></h1>
          <p>Discover movies and shows through the friends and family whose taste you actually trust. Save the pick, watch it, then rate how well they know you.</p>
          <div className="landing-cta"><SignUpButton><button className="landing-join large">Create your free circle <span>→</span></button></SignUpButton><a href="#how-it-works">See how it works <span>↓</span></a></div>
          <div className="landing-faces"><span><b>MR</b><b>JB</b><b>SK</b><b>+12</b></span><p>Built for the people you watch with</p></div>
        </div>
        <div className="landing-showcase" aria-label="CineApe recommendation preview">
          <div className="landing-glow"></div>
          <article className="landing-poster landing-poster-a"><PosterImage title="The Bear"/><small>Recommended by Maya</small><strong>THE<br/>BEAR</strong></article>
          <article className="landing-poster landing-poster-b"><PosterImage title="Mickey 17"/><small>Top pick in your circle</small><strong>MICKEY<br/>17</strong></article>
          <article className="landing-recommendation"><div><span className="landing-mini-avatar">MR</span><p><b>Maya sent you a pick</b><small>“Funny, weird, and so your kind of show.”</small></p></div><button>See it <span>→</span></button></article>
        </div>
      </section>

      <section className="landing-proof"><p>ONE PLACE FOR EVERY “YOU HAVE TO WATCH THIS”</p><div><span>Save it</span><i></i><span>Watch it</span><i></i><span>Rate it</span><i></i><span>Pass it on</span></div></section>

      <section className="landing-features" id="why-cineape">
        <div className="landing-section-head"><p className="landing-eyebrow">MORE THAN A WATCHLIST</p><h2>Better picks happen<br/>in good company.</h2><p>Every part of CineApe is made to turn “maybe later” into your next shared favorite.</p></div>
        <div className="feature-stack">
          <article className="landing-feature review-feature"><span className="feature-number">01</span><div><p className="landing-eyebrow">REVIEW WHAT YOU WATCH</p><h3>Reviews that get to the point.</h3><p>Rate movies and shows in a way that helps your people understand your taste—not just a number out of ten.</p></div><div className="feature-rating"><span>YOUR TAKE</span><strong>8.6</strong><p>Story · Acting · Rewatch</p><i><b></b></i></div></article>
          <article className="landing-feature recommend-feature"><span className="feature-number">02</span><div><p className="landing-eyebrow">RECOMMEND WITH A NOTE</p><h3>Send the kind of pick they’ll remember.</h3><p>Add your own reason, a heads-up, or an inside joke. They can track it, watch it, and tell you whether you nailed it.</p></div><div className="feature-message"><span className="landing-mini-avatar">JB</span><p><b>John recommends <em>Slow Horses</em></b><small>“Smart spy stuff. Give it two episodes.”</small></p><button>Saved ✓</button></div></article>
          <article className="landing-feature network-feature"><span className="feature-number">03</span><div><p className="landing-eyebrow">BUILD YOUR CIRCLE</p><h3>Make your network feel like home.</h3><p>Bring together family, friends, movie-night crews, and your favorite group chat—without losing another recommendation.</p></div><div className="feature-network"><div><b>MR</b><b>JB</b><b>SK</b><b>+8</b></div><strong>Sunday Movie Crew</strong><span>14 shared picks this month</span></div></article>
        </div>
      </section>

      <section className="landing-how" id="how-it-works"><div><p className="landing-eyebrow">SIMPLE BY DESIGN</p><h2>Find it. Share it.<br/><em>Actually watch it.</em></h2></div><ol><li><b>01</b><div><h3>Start your circle</h3><p>Invite the people whose suggestions you never ignore.</p></div></li><li><b>02</b><div><h3>Send a great pick</h3><p>Recommend a title with the little note that makes it personal.</p></div></li><li><b>03</b><div><h3>See what lands</h3><p>Rate the movie—and how good the recommendation really was.</p></div></li></ol></section>

      <section className="landing-final"><p className="landing-eyebrow">YOUR CIRCLE IS WAITING</p><h2>Make your next<br/>watch a good one.</h2><p>Free to join. Better with friends.</p><SignUpButton><button className="landing-join large">Create your free circle <span>→</span></button></SignUpButton></section>
    </main>
    <TmdbAttribution />
    <footer className="landing-footer"><a className="landing-brand" href="#top"><i></i>CineApe</a><span>Built for better movie nights.</span><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">Data from TMDB</a></footer>
  </div>;
}
function TmdbAttribution() { return <footer className="tmdb-attribution" aria-label="TMDB attribution"><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" /></a><p>This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p></footer>; }
type LiveTitle = { id: number; type: "movie" | "tv"; title: string; overview: string; year: string | null; poster: string | null; tmdbScore: number | null; tmdbVotes: number; runtime: number | null; genres: string[]; trailer: string | null; cast: Array<{ name: string; character: string; image: string | null }> };
type CommunityReview = { score: number; review: string | null; createdAt: string; displayName: string; avatarUrl: string | null };

function TitleDetails({ selection, onBack, onRecommend }: { selection: { title: string; meta: string; score: string }; onBack: () => void; onRecommend: () => void }) {
  const [details, setDetails] = useState<LiveTitle | null>(null);
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [community, setCommunity] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(8);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setDetails(null); setReviews([]); setCommunity({ average: null, count: 0 }); setReview(""); setMessage("");
    void fetch(`/api/tmdb?query=${encodeURIComponent(selection.title)}`).then(response => response.ok ? response.json() : null)
      .then(async (match: { id?: number; type?: "movie" | "tv" } | null) => {
        if (!match?.id || !match.type || !active) return;
        const response = await fetch(`/api/tmdb?id=${match.id}&type=${match.type}`);
        const next = response.ok ? await response.json() as LiveTitle : null;
        if (!active || !next) return;
        setDetails(next); setLoading(false);
        const reviewResponse = await fetch(`/api/reviews?tmdbId=${next.id}&type=${next.type}`);
        if (!reviewResponse.ok || !active) return;
        const communityData = await reviewResponse.json() as { reviews: CommunityReview[]; average: number | null; count: number };
        if (active) { setReviews(communityData.reviews); setCommunity({ average: communityData.average, count: communityData.count }); }
      }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection.title]);

  const saveReview = async () => {
    if (!details) return;
    setSaving(true); setMessage("");
    const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, score, review }) });
    if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; setMessage(data?.error ?? "Your review could not be saved."); setSaving(false); return; }
    setMessage("Your CineApe review is live."); setSaving(false);
    const refresh = await fetch(`/api/reviews?tmdbId=${details.id}&type=${details.type}`);
    if (refresh.ok) { const data = await refresh.json() as { reviews: CommunityReview[]; average: number | null; count: number }; setReviews(data.reviews); setCommunity({ average: data.average, count: data.count }); }
  };

  const shownTitle = details?.title ?? selection.title;
  return <section className="page live-title-page"><button className="back-link" onClick={onBack}>← Back to discover</button>{loading && <div className="panel title-loading">Loading live title details…</div>}{!loading && details && <><div className="live-title-head"><div className="live-poster">{details.poster ? <img src={details.poster} alt={`${shownTitle} poster`} /> : <span>{shownTitle}</span>}</div><div className="live-title-copy"><p className="eyebrow">{details.type === "tv" ? "TV SERIES" : "MOVIE"} · {details.year ?? "—"}</p><h1>{shownTitle}</h1><p className="muted">{details.runtime ? `${details.runtime} min · ` : ""}{details.genres.join(" · ")}</p><div className="score-cards"><div><b>{community.average ?? "—"}</b><span>CineApe Rating<br/>{community.count ? `${community.count} public review${community.count === 1 ? "" : "s"}` : "No reviews yet"}</span></div><div><b>—</b><span>Circle Rating<br/>Invite people to unlock</span></div><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><b>{details.tmdbScore ?? "—"}</b><span>TMDB score<br/>{details.tmdbVotes.toLocaleString()} votes</span></a></div><p className="live-overview">{details.overview || "A synopsis is not available for this title yet."}</p><div className="live-title-actions"><button className="primary" onClick={onRecommend}>✦ Recommend to someone</button><button className="secondary" onClick={() => document.getElementById("write-review")?.scrollIntoView({ behavior: "smooth" })}>☆ Write a review</button></div></div></div>{details.trailer && <section className="trailer-section"><div className="section-title"><h2>Official trailer</h2><span>From TMDB</span></div><div className="trailer-frame"><iframe src={details.trailer} title={`${shownTitle} official trailer`} allowFullScreen /></div></section>}<section className="cast-section"><div className="section-title"><h2>Cast</h2><span>{details.cast.length ? "From TMDB" : "Cast information unavailable"}</span></div><div className="cast-grid">{details.cast.map(person => <article key={`${person.name}-${person.character}`}><div>{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}</div><b>{person.name}</b><small>{person.character || "Cast"}</small></article>)}</div></section><section className="community-section"><div className="section-title"><div><p className="eyebrow">PUBLIC ON CINEAPE</p><h2>Community reviews</h2></div><span>Everyone can read these</span></div><div className="review-layout"><form className="write-review panel" id="write-review" onSubmit={event => { event.preventDefault(); void saveReview(); }}><h3>Rate {shownTitle}</h3><p>Your review will be visible to all CineApe members.</p><div className="rating-buttons">{[1,2,3,4,5,6,7,8,9,10].map(value => <button type="button" className={score === value ? "chosen" : ""} key={value} onClick={() => setScore(value)}>{value}</button>)}</div><textarea value={review} onChange={event => setReview(event.target.value)} placeholder="What did you think? Keep it helpful and spoiler-aware." maxLength={2000}/><button className="primary wide" disabled={saving}>{saving ? "Publishing…" : "Publish my review"}</button>{message && <small className="review-message">{message}</small>}</form><div className="public-reviews">{reviews.length ? reviews.map(item => <article className="panel" key={`${item.displayName}-${item.createdAt}`}><div className="review-author">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span>{item.displayName.slice(0, 1)}</span>}<div><b>{item.displayName}</b><small>Public CineApe review</small></div><strong>{item.score}/10</strong></div>{item.review ? <p>{item.review}</p> : <p className="muted">Rated this title without a written review.</p>}</article>) : <div className="empty-reviews panel"><b>Be the first to review it.</b><p>Your score will begin the CineApe community rating for this title.</p></div>}</div></div></section></>}</section>;
}
function Intro({label,title,text,action}:{label:string,title:string,text:string,action:React.ReactNode}) { return <div className="intro"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Tabs({labels}:{labels:string[]}) { const [chosen,setChosen]=useState(0); return <div className="tabs">{labels.map((x,i)=><button onClick={()=>setChosen(i)} className={chosen===i?"chosen":""} key={x}>{x}</button>)}</div>; }
function MiniRec({title,person,tone,label}:{title:string,person:string,tone:string,label:string}) { return <div className="mini-rec"><span className={`mini-cover ${tone}`}></span><p><b>{title}</b><span><strong>{person}</strong> thinks you’ll love it</span></p><small>{label}</small></div>; }
function Friend({name, initials, match, tone=""}:{name:string,initials:string,match:string,tone?:string}) { return <div className="friend"><Avatar tone={tone}>{initials}</Avatar><p><b>{name}</b><span>{match} match for you</span></p><strong>{match}</strong></div>; }
function Group({icon,name,info,pink,green}:{icon:string,name:string,info:string,pink?:boolean,green?:boolean}) { return <article className={`panel group ${pink?"pink":""} ${green?"green":""}`}><i>{icon}</i><h3>{name}</h3><p>{info}</p><div><Avatar>SB</Avatar><Avatar tone="blue-tone">MR</Avatar><Avatar tone="rose-tone">JB</Avatar></div><button>Open group →</button></article>; }
function Activity({who,initial,text,time}:{who:string,initial:string,text:string,time:string}) { return <div className="activity-row"><Avatar>{initial}</Avatar><p><b>{who}</b> {text}<span>“The cast is perfect.”</span></p><time>{time}</time></div>; }
