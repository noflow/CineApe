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

function Avatar({ children, tone = "" }: { children: React.ReactNode; tone?: string }) { return <span className={`avatar ${tone}`}>{children}</span>; }
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
  const [page, setPage] = useState<Page>("Home");
  const [modal, setModal] = useState<"recommend" | "rate" | null>(null);
  const [toast, setToast] = useState("");
  const [watching, setWatching] = useState<string[]>(["Slow Horses"]);
  const [recipient, setRecipient] = useState("Maya");
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const openTitle = () => setPage("Title");
  const nav = ["Home", "Discover", "For You", "Friends & Groups", "My Profile"] as Page[];
  const shown = page === "Title" ? "Title" : page;

  const movieCards = (limit = 4) => <div className="cards">{titles.slice(0, limit).map(([title, meta, score, tone, note]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={openTitle}/><strong>{title}</strong><span>{note}</span></div>)}</div>;
  const recommend = () => <button className="primary" onClick={() => setModal("recommend")}>+ Recommend</button>;

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setPage("Home")}><i></i>CineApe</button><p>MENU</p><nav>{nav.map((item, index) => <button key={item} className={shown === item ? "active" : ""} onClick={() => setPage(item)}><span>{["⌂", "⌕", "✦", "♧", "◉"][index]}</span>{item}{item === "For You" && <b>3</b>}</button>)}</nav><div className="account"><Avatar>SB</Avatar><div><strong>Shawn Baker</strong><span>Free plan</span></div></div></aside>
    <main><header><button className="mobile-brand" onClick={() => setPage("Home")}><i></i>CineApe</button><label className="search">⌕<input placeholder="Search movies, shows, people..."/></label><div><button className="bell" aria-label="Notifications">♧</button>{recommend()}</div></header>

    {page === "Home" && <section className="page home"><div className="hero"><div><p className="eyebrow">YOUR CIRCLE IS WATCHING</p><h1>Good picks hit different from people who know you.</h1><p>Three friends think you’ll love something this week. Your next favorite is waiting.</p><button className="light-button" onClick={() => setPage("For You")}>See your recommendations →</button></div><div className="poster-stack"><span className="poster poster-1">THE<br/>FALL</span><span className="poster poster-2">LAST<br/>SUMMER</span><span className="poster poster-3">HOLLOW</span></div></div><div className="dashboard"><div><div className="section-title"><h2>Trending in your circle <span>· this week</span></h2><button onClick={() => setPage("Discover")}>Explore all</button></div>{movieCards()}<div className="section-title lower"><h2>Because you loved <em>Severance</em></h2><button onClick={() => setPage("Discover")}>See matches</button></div>{movieCards()}</div><aside className="panel for-you"><div className="section-title"><h2>For you</h2><button onClick={() => setPage("For You")}>View all</button></div><MiniRec title="Last Summer" person="Maya" tone="lila" label="New"/><MiniRec title="Slow Horses" person="John" tone="ghost" label="Watching"/><MiniRec title="The Holdovers" person="Sarah" tone="garden" label="New"/><div className="stats"><div><b>14</b><span>On your list</span></div><div><b>86%</b><span>Circle match</span></div></div><div className="trust"><p>YOUR TASTE STATUS</p><h3>Excellent listener ✨</h3><span>Your friends’ picks match your ratings 87% of the time.</span><i></i></div></aside></div></section>}

    {page === "Discover" && <section className="page"><Intro label="CURATED FOR YOU" title="Find your next obsession." text="Browse the titles your circle is talking about and make every watch count." action={recommend()}/><Tabs labels={["All", "Movies", "TV Shows", "From friends", "Hidden gems"]}/><div className="discover-grid">{[...titles, ["Dark Matter", "Series · Mind-bender", "8.5", "e", "91% taste match"]].map(([title, meta, score, tone, note]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={openTitle}/><strong>{title}</strong><span>{note}</span></div>)}</div></section>}

    {page === "Title" && <section className="page detail"><div><div className="detail-cover"><span><small>2025 · SCIENCE FICTION</small>MICKEY<br/>17</span></div><button className="primary wide" onClick={() => setModal("recommend")}>✦ Recommend to a friend</button><button className="secondary wide" onClick={() => setModal("rate")}>☆ Rate this title</button></div><article><p className="eyebrow">A CIRCLE FAVORITE</p><h1>Mickey 17</h1><p className="muted">2025 · 2h 17m · R · Science fiction, Comedy</p><div className="score-row"><div className="score-orb">8.2</div><p><b>Circle rating</b><span>from 18 friends</span></p><hr/><p><b>92% <small>match</small></b><span>Your circle thinks you’ll like it</span></p></div><p className="synopsis">An unlikely hero is sent on a dangerous mission to colonize an ice world. When one expendable worker refuses to disappear, the system starts to unravel.</p><h2>Why it’s in your circle</h2><div className="avatars"><Avatar>JB</Avatar><Avatar tone="blue-tone">MR</Avatar><Avatar tone="rose-tone">SK</Avatar></div><p className="muted small"><b>John, Maya, and 5 others</b> rated it 8+.</p><h2>Good to know</h2><div className="tags"><span>Clever & weird</span><span>Big ideas</span><span>Dark humor</span><span>Slow burn</span></div><h2>From Maya</h2><div className="note"><b>✦ Personal recommendation</b><p>“The world-building is wild and it has that strange, tense energy you loved in Severance. Go in blind.”</p></div></article><aside className="panel detail-aside"><h3>Your take</h3><p>Not watched yet? Add it to your list.</p><button className="secondary wide" onClick={() => setModal("rate")}>☆ I watched this</button><button className="selected wide">+ Add to watchlist</button><hr/><h3>Where to watch</h3><p className="stream">● Rent or buy on Apple TV</p><p className="stream prime">a Prime Video</p></aside></section>}

    {page === "For You" && <section className="page"><Intro label="YOUR RECOMMENDATIONS" title="From people who get you." text="Keep track of every great pick, thoughtful note, and your own verdict." action={recommend()}/><div className="inbox-layout"><div><Tabs labels={["For you 3", "Sent", "Watching", "Completed"]}/><div className="panel inbox">{recs.map(([title, person, message, tone, label]) => <article key={title}><span className={`inbox-cover ${tone}`}></span><div><h3>{title} {label && <small>{label}</small>}</h3><p>Recommended by <b>{person}</b> · {title === "Slow Horses" ? "TV series · 4 seasons" : "Movie · 2025"}</p><em>“{message}”</em></div><div><button className="small-primary" onClick={() => { setWatching(watching.includes(title) ? watching : [...watching, title]); flash(`Added ${title} to your Watching list`); }}>{watching.includes(title) ? "Watching" : "Start watching"}</button><button className="small-ghost">Save</button></div></article>)}</div></div><aside className="panel people"><div className="section-title"><h2>People you trust</h2><button onClick={() => setPage("Friends & Groups")}>Manage</button></div><Friend name="Maya Reynolds" initials="MR" match="92%"/><Friend name="John Baker" initials="JB" match="87%" tone="blue-tone"/><Friend name="Sarah Kim" initials="SK" match="81%" tone="rose-tone"/><div className="match-card"><b>92% taste match</b><span>Maya’s recommendations almost always land for you.</span></div></aside></div></section>}

    {page === "Friends & Groups" && <section className="page"><Intro label="YOUR PEOPLE" title="Better together." text="Share the good stuff with the people you actually watch with." action={<button className="primary" onClick={() => flash("Group creation is ready for the next build step.")}>+ Create a group</button>}/><div className="group-grid"><Group icon="⌂" name="Sunday Movie Crew" info="6 members · Movie night every Sunday"/><Group icon="♧" name="The Bakers" info="5 members · Family favorites" pink/><Group icon="✦" name="Shows worth binging" info="11 members · 32 active picks" green/></div><div className="panel activity"><div className="section-title"><h2>Circle activity</h2><button>See all activity</button></div><Activity who="Maya" initial="MR" text="recommended Last Summer to you." time="Today"/><Activity who="John" initial="JB" text="finished Slow Horses and rated it 9/10." time="Yesterday"/><Activity who="Sarah" initial="SK" text="added The Holdovers to Sunday Movie Crew." time="Mon"/></div></section>}

    {page === "My Profile" && <section className="page"><div className="panel profile-head"><Avatar>SB</Avatar><div><h1>Shawn Baker</h1><p>Drama seeker · 38 ratings · Member since 2025</p></div><div className="profile-stats"><b>87%<span>Circle match</span></b><b>26<span>Recommendations sent</span></b><b>8.4<span>Average rating</span></b></div></div><div className="profile-grid"><div className="panel taste"><h2>Your taste profile</h2><p>Built from what you watch, rate, and save.</p>{[["Drama", "93"], ["Sci-fi", "84"], ["Comedy", "71"], ["Thriller", "67"], ["Horror", "33"]].map(([name, value]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{width:`${value}%`}}></b></i><strong>{value}</strong></div>)}</div><div className="panel accuracy"><h2>Recommendation accuracy</h2><p>Who knows your taste best?</p><Friend name="Maya Reynolds" initials="MR" match="92%"/><Friend name="John Baker" initials="JB" match="87%" tone="blue-tone"/><Friend name="Sarah Kim" initials="SK" match="81%" tone="rose-tone"/></div></div></section>}
    </main>
    <footer className="tmdb-attribution" aria-label="TMDB attribution">
      <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
        <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" />
      </a>
      <p>This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
    </footer>
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
function Intro({label,title,text,action}:{label:string,title:string,text:string,action:React.ReactNode}) { return <div className="intro"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Tabs({labels}:{labels:string[]}) { const [chosen,setChosen]=useState(0); return <div className="tabs">{labels.map((x,i)=><button onClick={()=>setChosen(i)} className={chosen===i?"chosen":""} key={x}>{x}</button>)}</div>; }
function MiniRec({title,person,tone,label}:{title:string,person:string,tone:string,label:string}) { return <div className="mini-rec"><span className={`mini-cover ${tone}`}></span><p><b>{title}</b><span><strong>{person}</strong> thinks you’ll love it</span></p><small>{label}</small></div>; }
function Friend({name, initials, match, tone=""}:{name:string,initials:string,match:string,tone?:string}) { return <div className="friend"><Avatar tone={tone}>{initials}</Avatar><p><b>{name}</b><span>{match} match for you</span></p><strong>{match}</strong></div>; }
function Group({icon,name,info,pink,green}:{icon:string,name:string,info:string,pink?:boolean,green?:boolean}) { return <article className={`panel group ${pink?"pink":""} ${green?"green":""}`}><i>{icon}</i><h3>{name}</h3><p>{info}</p><div><Avatar>SB</Avatar><Avatar tone="blue-tone">MR</Avatar><Avatar tone="rose-tone">JB</Avatar></div><button>Open group →</button></article>; }
function Activity({who,initial,text,time}:{who:string,initial:string,text:string,time:string}) { return <div className="activity-row"><Avatar>{initial}</Avatar><p><b>{who}</b> {text}<span>“The cast is perfect.”</span></p><time>{time}</time></div>; }
