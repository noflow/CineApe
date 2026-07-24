"use client";

import { useEffect, useState } from "react";
import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";

type Page = "Home" | "Discover" | "For You" | "Friends & Groups" | "My Profile" | "Studio" | "Title";
type SearchResult = { id: number; type: "movie" | "tv" | "person"; title: string; year: string | null; image: string | null; subtitle: string };
type ShareTitle = { tmdbId: number; type: "movie" | "tv"; name: string; year: number | null; posterPath: string | null };
type CircleChoice = { id: string; displayName?: string; avatarUrl?: string | null; name?: string; memberCount?: number; isOwner?: boolean };
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
function Cover({ title, meta, score, tone, onClick }: { title: string; meta: string; score: string; tone: string; onClick?: (title: string, meta: string, score: string) => void }) {
  return <button className={`cover ${tone}`} onClick={() => onClick?.(title, meta, score)}><PosterImage title={title}/><span className="cover-type">{meta.includes("Series") ? "Series" : "Movie"}</span><span className="cover-score">★ {score}</span><span className="cover-title"><small>{meta}</small>{title}</span></button>;
}

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [page, setPage] = useState<Page>("Home");
  const [selectedTitle, setSelectedTitle] = useState({ title: "Mickey 17", meta: "2025 · Science fiction", score: "8.2" });
  const [modal, setModal] = useState<"recommend" | "groupPick" | "quickRecommend" | null>(null);
  const [toast, setToast] = useState("");
  const [watching, setWatching] = useState<string[]>(["Slow Horses"]);
  const [shareTitle, setShareTitle] = useState<ShareTitle | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const openTitle = (title = "Mickey 17", meta = "2025 · Science fiction", score = "8.2") => { setSelectedTitle({ title, meta, score }); setPage("Title"); };
  const nav = ["Home", "Discover", "For You", "Friends & Groups", "My Profile", ...(isAdmin ? ["Studio" as Page] : [])] as Page[];
  const shown = page === "Title" ? "Title" : page;

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() as Promise<{ results?: SearchResult[] }> : null)
        .then(data => setSearchResults(data?.results ?? []))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchQuery]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    void (async () => {
      // Make the member record first, then accept the invite. This prevents new social sign-ins from racing the invite endpoint.
      const profile = await fetch("/api/account", { method: "POST" });
      if (!profile.ok) throw new Error("Unable to set up your CineApe profile.");
      const response = await fetch("/api/invites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { senderName?: string; error?: string };
      flash(result.senderName ? `You are now connected with ${result.senderName}.` : result.error ?? "Unable to accept this invite.");
    })().catch(() => flash("Unable to accept this invite.")).finally(() => window.history.replaceState({}, "", window.location.pathname));
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (isSignedIn) void fetch("/api/account", { method: "POST" });
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) { setIsAdmin(false); return; }
    void fetch("/api/admin").then(response => response.ok ? response.json() as Promise<{ isAdmin?: boolean }> : null)
      .then(data => setIsAdmin(Boolean(data?.isAdmin))).catch(() => setIsAdmin(false));
  }, [isSignedIn]);

  const providerAccount = user?.externalAccounts.find(account => account.username || account.firstName || account.lastName);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || providerAccount?.username || [providerAccount?.firstName, providerAccount?.lastName].filter(Boolean).join(" ") || "CineApe member";
  const firstName = user?.firstName || displayName.split(" ")[0] || "there";
  const initials = displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const movieCards = (limit = 4) => <div className="cards">{titles.slice(0, limit).map(([title, meta, score, tone]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={() => openTitle(title, meta, score)}/><strong>{title}</strong><span>Save it to your watchlist</span></div>)}</div>;
  const recommend = () => <button className="primary recommend-action" onClick={() => setModal("quickRecommend")}>+ Recommend</button>;
  const chooseShareTitle = (title: ShareTitle, mode: "recommend" | "groupPick") => { setShareTitle(title); setModal(mode); };

  if (!isLoaded) return <div className="session-loading" aria-label="Loading CineApe"><span></span></div>;
  if (!isSignedIn) return <LandingPage />;

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setPage("Home")}><i></i>CineApe</button><p>MENU</p><nav>{nav.map((item, index) => <button key={item} className={shown === item ? "active" : ""} onClick={() => setPage(item)}><span>{["⌂", "⌕", "✦", "♧", "◉"][index]}</span>{item}</button>)}</nav><div className="account"><Avatar imageUrl={user?.imageUrl}>{initials}</Avatar><div><strong>{displayName}</strong><span>Free plan</span></div></div></aside>
    <main><header><button className="mobile-brand" onClick={() => setPage("Home")}><i></i>CineApe</button><label className="search">⌕<input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search movies, shows, people..." aria-label="Search movies, shows, actors, and actresses"/>{searchQuery.trim().length >= 2 && <div className="search-results">{searching && <p>Searching CineApe…</p>}{!searching && searchResults.map(result => result.type === "person" ? <div className="search-result person-result" key={`${result.type}-${result.id}`}>{result.image ? <img src={result.image} alt="" /> : <span>{result.title.slice(0, 1)}</span>}<div><b>{result.title}</b><small>{result.subtitle}</small></div><em>Person</em></div> : <button className="search-result" key={`${result.type}-${result.id}`} onClick={() => { setSearchQuery(""); setSearchResults([]); openTitle(result.title, `${result.year ?? "—"} · ${result.type === "tv" ? "TV series" : "Movie"}`, "—"); }}>{result.image ? <img src={result.image} alt="" /> : <span>{result.title.slice(0, 1)}</span>}<div><b>{result.title}</b><small>{result.subtitle}</small></div><em>{result.type === "tv" ? "TV" : "Movie"}</em></button>)}{!searching && !searchResults.length && <p>No movies, shows, or people found.</p>}</div>}</label><div><button className="bell" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}>♧</button>{recommend()}</div></header>

    {page === "Home" && <section className="page home"><div className="hero onboarding-hero"><div><p className="eyebrow">WELCOME TO CINEAPE, {firstName.toUpperCase()}</p><h1>Your circle starts with one great pick.</h1><p>Catch new releases, see what your Circle is watching, and never lose a good recommendation.</p><button className="light-button" onClick={() => setPage("Discover")}>Discover movies and shows →</button></div><div className="poster-stack"><span className="poster poster-1">YOUR<br/>NEXT</span><span className="poster poster-2">GREAT<br/>PICK</span><span className="poster poster-3">START<br/>HERE</span></div></div><HomeCategories onOpen={openTitle} onInvite={() => setInviteOpen(true)} /></section>}

    {page === "Discover" && <DiscoverPage onOpen={openTitle} />}

    {page === "Title" && <TitleDetails selection={selectedTitle} onBack={() => setPage("Discover")} onRecommend={(title) => chooseShareTitle(title, "recommend")} onAddToGroup={(title) => chooseShareTitle(title, "groupPick")}/>} 

    {page === "For You" && <ForYouPage onInvite={() => setInviteOpen(true)} onOpen={openTitle} />}

    {page === "Friends & Groups" && <CirclePage onInvite={() => setInviteOpen(true)} />}

    {page === "My Profile" && <ProfilePage />}
    {page === "Studio" && isAdmin && <StudioPage />}
    </main>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    {notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} />}
    <TmdbAttribution />
    <div className="auth-float"><AccountControls /></div>
    {modal === "quickRecommend" && <QuickRecommendModal onClose={() => setModal(null)} onSelected={(title) => { setShareTitle(title); setModal("recommend"); }}/>} {modal === "recommend" && shareTitle && <RecommendationModal title={shareTitle} onClose={() => setModal(null)} onSent={(name) => { setModal(null); flash(`Recommendation sent to ${name} ✦`); }} />}
    {modal === "groupPick" && shareTitle && <GroupPickModal title={shareTitle} onClose={() => setModal(null)} onSaved={(name) => { setModal(null); flash(`Added to ${name}'s shared picks.`); }} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function InviteModal({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("Creating your private invite link…");

  useEffect(() => {
    let active = true;
    void fetch("/api/invites", { method: "POST" })
      .then(response => response.ok ? response.json() as Promise<{ token: string }> : response.json().then((data: { error?: string }) => Promise.reject(new Error(data.error ?? "Unable to create an invite."))))
      .then(data => { if (active) { setLink(`${window.location.origin}/?invite=${data.token}`); setMessage("Anyone with this link can join your Circle. It expires in 7 days."); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Unable to create an invite."); });
    return () => { active = false; };
  }, []);

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage("Invite link copied. Send it by text, Discord, or email.");
  };

  const shareInMessenger = () => {
    if (!link) return;
    const messengerUrl = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(link)}&redirect_uri=${encodeURIComponent(window.location.origin)}`;
    window.open(messengerUrl, "_blank", "noopener,noreferrer");
    setMessage("Messenger is opening with your private CineApe invite.");
  };

  return <div className="backdrop" onClick={onClose}><div className="modal invite-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">YOUR PRIVATE CIRCLE</p><h2>Invite your people</h2><p>Share one private link with family or friends. New people can create a CineApe account; members who already have one simply sign in and are connected right away.</p><div className="invite-explainer"><b>Already on CineApe?</b><span>Open this link, sign in, and you’re added to the Circle—no second account or separate request needed.</span></div><div className="invite-link">{link || "Preparing your link…"}</div><div className="invite-actions"><button className="messenger-share" disabled={!link} onClick={shareInMessenger}>Send in Messenger</button><button className="secondary" disabled={!link} onClick={() => void copyLink()}>Copy link</button></div><small>{message}</small></div></div>;
}

type AppNotification = { id: string; kind: "recommendation" | "group_join" | "streaming"; message: string; createdAt: string; readAt: string | null };

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; const country = navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US"; void fetch(`/api/notifications?country=${country}`).then(response => response.ok ? response.json() as Promise<{ notifications?: AppNotification[] }> : null).then(data => { if (active) setItems(data?.notifications ?? []); }).catch(() => { if (active) setItems([]); }).finally(() => { if (active) setLoading(false); }); void fetch("/api/notifications", { method: "PATCH" }); return () => { active = false; }; }, []);
  const icon = (kind: AppNotification["kind"]) => kind === "recommendation" ? "✦" : kind === "group_join" ? "♧" : "▶";
  return <div className="backdrop" onClick={onClose}><div className="modal notifications-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">YOUR UPDATES</p><h2>Notifications</h2>{loading ? <p className="share-empty">Loading updates…</p> : items.length ? <div className="notification-list">{items.map(item => <article key={item.id}><i className={item.kind}>{icon(item.kind)}</i><div><b>{item.message}</b><small>{new Date(item.createdAt).toLocaleDateString()}</small></div></article>)}</div> : <p className="share-empty">You’re all caught up. New recommendations, group invites, and streaming alerts will appear here.</p>}</div></div>;
}

function QuickRecommendModal({ onClose, onSelected }: { onClose: () => void; onSelected: (title: ShareTitle) => void }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [searching, setSearching] = useState(false);
  useEffect(() => { const value = query.trim(); if (value.length < 2) { setResults([]); return; } const controller = new AbortController(); const timer = window.setTimeout(() => { setSearching(true); fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(value)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ results?: SearchResult[] }> : null).then(data => setResults((data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv"))).catch(() => undefined).finally(() => setSearching(false)); }, 220); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query]);
  return <div className="backdrop" onClick={onClose}><div className="modal quick-recommend-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">SEND A RECOMMENDATION</p><h2>What should they watch?</h2><p>Find the movie or show first, then choose a friend and add your note.</p><label className="quick-recommend-search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search movies and TV shows" autoFocus /></label>{searching && <p className="share-empty">Searching CineApe…</p>}{!searching && results.length > 0 && <div className="quick-recommend-results">{results.map(result => <button key={`${result.type}-${result.id}`} onClick={() => onSelected({ tmdbId: result.id, type: result.type as "movie" | "tv", name: result.title, year: result.year ? Number(result.year) : null, posterPath: result.image })}>{result.image ? <img src={result.image} alt="" /> : <span>{result.title.slice(0, 1)}</span>}<div><b>{result.title}</b><small>{result.subtitle}</small></div><em>{result.type === "tv" ? "TV" : "Movie"}</em></button>)}</div>}{query.trim().length >= 2 && !searching && !results.length && <p className="share-empty">No movies or TV shows found.</p>}</div></div>;
}

function RecommendationModal({ title, onClose, onSent }: { title: ShareTitle; onClose: () => void; onSent: (name: string) => void }) {
  const [friends, setFriends] = useState<CircleChoice[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading your friends…");
  useEffect(() => { let active = true; void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ friends?: CircleChoice[] }> : null).then(data => { if (active) { setFriends(data?.friends ?? []); setMessage(data?.friends?.length ? "" : "Invite someone to your Circle before sending a recommendation."); } }).catch(() => { if (active) setMessage("Your friends could not be loaded."); }); return () => { active = false; }; }, []);
  const send = async () => { if (!recipientId || saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...title, recipientId, note }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Your recommendation could not be sent."); setSaving(false); return; } const friend = friends.find(item => item.id === recipientId); onSent(friend?.displayName ?? "your friend"); };
  return <div className="backdrop" onClick={onClose}><div className="modal share-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">SEND A RECOMMENDATION</p><h2>Make this pick personal.</h2><div className="selected-title">{title.posterPath ? <img src={title.posterPath} alt="" /> : <span></span>}<b>{title.name}<small>{title.year ?? "—"} · {title.type === "tv" ? "TV series" : "Movie"}</small></b></div><label>SEND TO</label>{friends.length ? <div className="share-people">{friends.map(friend => <button key={friend.id} className={recipientId === friend.id ? "chosen" : ""} onClick={() => setRecipientId(friend.id)}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.displayName?.slice(0, 1)}</span>}<b>{friend.displayName}</b></button>)}</div> : <p className="share-empty">{message}</p>}<label>ADD A NOTE <small>(optional)</small></label><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Why will they love it?" maxLength={1000}/><button className="primary wide" disabled={!recipientId || saving} onClick={() => void send()}>{saving ? "Sending…" : "Send recommendation ✦"}</button>{message && friends.length > 0 && <small className="modal-message">{message}</small>}</div></div>;
}

function GroupPickModal({ title, onClose, onSaved }: { title: ShareTitle; onClose: () => void; onSaved: (name: string) => void }) {
  const [groups, setGroups] = useState<CircleChoice[]>([]);
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading your groups…");
  useEffect(() => { let active = true; void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ groups?: CircleChoice[] }> : null).then(data => { if (active) { setGroups(data?.groups ?? []); setMessage(data?.groups?.length ? "" : "Create a group before adding shared picks."); } }).catch(() => { if (active) setMessage("Your groups could not be loaded."); }); return () => { active = false; }; }, []);
  const save = async () => { if (!groupId || saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/group-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...title, groupId }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "This pick could not be added."); setSaving(false); return; } const group = groups.find(item => item.id === groupId); onSaved(group?.name ?? "your group"); };
  return <div className="backdrop" onClick={onClose}><div className="modal share-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">SHARED GROUP PICK</p><h2>Add it to your people’s list.</h2><div className="selected-title">{title.posterPath ? <img src={title.posterPath} alt="" /> : <span></span>}<b>{title.name}<small>{title.year ?? "—"} · {title.type === "tv" ? "TV series" : "Movie"}</small></b></div><label>CHOOSE A GROUP</label>{groups.length ? <div className="share-people">{groups.map(group => <button key={group.id} className={groupId === group.id ? "chosen" : ""} onClick={() => setGroupId(group.id)}><span>✦</span><b>{group.name}<small>{group.memberCount ?? 0} members</small></b></button>)}</div> : <p className="share-empty">{message}</p>}<button className="primary wide" disabled={!groupId || saving} onClick={() => void save()}>{saving ? "Adding…" : "Add shared pick"}</button>{message && groups.length > 0 && <small className="modal-message">{message}</small>}</div></div>;
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
      <nav aria-label="Landing page"><a href="#how-it-works">How it works</a><a href="#why-cineape">Why CineApe</a><a href="/must-watch">Must watch</a></nav>
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
type StudioStats = { users: number; friendships: number; groups: number; recommendations: number; ratings: number; editorReviews: number; editorLists: number };

function StudioPageOverview() {
  const [stats, setStats] = useState<StudioStats | null>(null);
  useEffect(() => { let active = true; void fetch("/api/admin").then(response => response.ok ? response.json() as Promise<{ stats?: StudioStats | null }> : null).then(data => { if (active) setStats(data?.stats ?? null); }).catch(() => { if (active) setStats(null); }); return () => { active = false; }; }, []);
  const cards = stats ? [["Members", stats.users], ["Friend links", stats.friendships], ["Groups", stats.groups], ["Recommendations", stats.recommendations], ["Community ratings", stats.ratings], ["Editor reviews", stats.editorReviews], ["Editor lists", stats.editorLists]] : [];
  return <section className="page studio-page"><Intro label="PRIVATE CINEAPE STUDIO" title="Your publishing and growth center." text="Track your Circle, then create the editor reviews and must-watch lists that bring new people in." action={null}/>{stats ? <><div className="studio-stats">{cards.map(([label, value]) => <article className="panel" key={String(label)}><b>{value}</b><span>{label}</span></article>)}</div><div className="studio-grid"><article className="panel studio-next"><p className="eyebrow">EDITORIAL</p><h2>Official reviews</h2><p>Draft and publish CineApe editor reviews with a score, spoiler-safe copy, and SEO fields.</p><small>Editorial tools are ready for the next Studio screen.</small></article><article className="panel studio-next"><p className="eyebrow">SEO</p><h2>Must-watch lists</h2><p>Build indexable collections such as “Best TV shows to watch tonight” and “CineApe’s must-watch horror.”</p><small>Public review and list URLs are the next publishing step.</small></article></div></> : <div className="panel studio-access"><b>Studio access is not configured yet.</b><p>Add your email to the Render environment setting <code>ADMIN_EMAILS</code>, then reload CineApe.</p></div>}</section>;
}
type StudioMember = { id: string; email: string; displayName: string; avatarUrl: string | null; bio: string | null; createdAt: string };
type EditorReview = { id: string; headline: string; score: number; status: "draft" | "published"; title: string; posterPath: string | null };
type EditorialTitle = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; subtitle: string };

function StudioPage() {
  const [section, setSection] = useState<"overview" | "members" | "editorial" | "lists">("overview");
  return <section className="page studio-workspace"><div className="studio-workspace-head"><div><p className="eyebrow">PRIVATE CINEAPE STUDIO</p><h1>Run the site behind the scenes.</h1><p>Monitor members and publish the official CineApe point of view.</p></div><div className="tabs studio-tabs"><button className={section === "overview" ? "chosen" : ""} onClick={() => setSection("overview")}>Overview</button><button className={section === "members" ? "chosen" : ""} onClick={() => setSection("members")}>Members</button><button className={section === "editorial" ? "chosen" : ""} onClick={() => setSection("editorial")}>Reviews</button><button className={section === "lists" ? "chosen" : ""} onClick={() => setSection("lists")}>Must watch lists</button></div></div>{section === "overview" && <StudioPageOverview />}{section === "members" && <StudioMembers />}{section === "editorial" && <StudioEditorial />}{section === "lists" && <StudioLists />}</section>;
}

function StudioMembers() {
  const [members, setMembers] = useState<StudioMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); const timer = window.setTimeout(() => { void fetch(`/api/admin/members?q=${encodeURIComponent(query.trim())}`).then(response => response.ok ? response.json() as Promise<{ members?: StudioMember[] }> : null).then(data => { if (active) setMembers(data?.members ?? []); }).catch(() => { if (active) setMembers([]); }).finally(() => { if (active) setLoading(false); }); }, 180); return () => { active = false; window.clearTimeout(timer); }; }, [query]);
  return <section className="studio-members"><div className="studio-section-head"><div><p className="eyebrow">MEMBER DIRECTORY</p><h2>All CineApe members</h2><p>Private to Studio. Search by name or email.</p></div><label className="studio-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search members" /></label></div><div className="panel member-directory">{loading ? <p className="studio-empty">Loading members…</p> : members.length ? members.map(member => <article key={member.id}><Avatar imageUrl={member.avatarUrl}>{member.displayName.slice(0, 2).toUpperCase()}</Avatar><div><b>{member.displayName}</b><small>{member.email}</small>{member.bio && <em>{member.bio}</em>}</div><time>Joined {new Date(member.createdAt).toLocaleDateString()}</time></article>) : <p className="studio-empty">No matching members yet.</p>}</div></section>;
}

function StudioEditorial() {
  const [titleQuery, setTitleQuery] = useState(""); const [matches, setMatches] = useState<EditorialTitle[]>([]); const [selected, setSelected] = useState<EditorialTitle | null>(null);
  const [headline, setHeadline] = useState(""); const [body, setBody] = useState(""); const [score, setScore] = useState(8); const [seoTitle, setSeoTitle] = useState(""); const [seoDescription, setSeoDescription] = useState(""); const [status, setStatus] = useState<"draft" | "published">("draft");
  const [reviews, setReviews] = useState<EditorReview[]>([]); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const loadReviews = () => void fetch("/api/admin/editor-reviews").then(response => response.ok ? response.json() as Promise<{ reviews?: EditorReview[] }> : null).then(data => setReviews(data?.reviews ?? [])).catch(() => setReviews([]));
  useEffect(() => { loadReviews(); }, []);
  const findTitle = async () => { if (titleQuery.trim().length < 2) { setMessage("Type at least two letters to find a movie or show."); return; } setMessage("Finding titles…"); const response = await fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(titleQuery.trim())}`); const data = response.ok ? await response.json() as { results?: EditorialTitle[] } : null; const found = (data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv"); setMatches(found); setMessage(found.length ? "Choose the title you are reviewing." : "No titles found."); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || saving) { setMessage("Choose a movie or show first."); return; } setSaving(true); setMessage(""); const response = await fetch("/api/admin/editor-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: selected.id, type: selected.type, name: selected.title, year: selected.year ? Number(selected.year) : null, posterPath: selected.image, headline, body, score, seoTitle, seoDescription, status }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Review could not be saved."); setSaving(false); return; } setMessage(status === "published" ? "Official review published." : "Draft saved in Studio."); setHeadline(""); setBody(""); setSeoTitle(""); setSeoDescription(""); setSelected(null); setMatches([]); setTitleQuery(""); setSaving(false); loadReviews(); };
  return <section className="studio-editorial"><div className="studio-section-head"><div><p className="eyebrow">EDITORIAL DESK</p><h2>Official CineApe reviews</h2><p>Create a site review, choose whether it stays a draft or goes live, and supply its search preview.</p></div></div><div className="studio-editor-grid"><form className="panel editorial-form" onSubmit={submit}><label>FIND A TITLE<div className="editor-title-search"><input value={titleQuery} onChange={event => setTitleQuery(event.target.value)} placeholder="Search movie or TV show" /><button type="button" className="secondary" onClick={() => void findTitle()}>Find</button></div></label>{matches.length > 0 && <div className="editor-matches">{matches.map(match => <button type="button" className={selected?.id === match.id && selected.type === match.type ? "chosen" : ""} key={`${match.type}-${match.id}`} onClick={() => { setSelected(match); setMatches([]); setMessage(""); }}>{match.image ? <img src={match.image} alt="" /> : <span>◉</span>}<div><b>{match.title}</b><small>{match.subtitle}</small></div></button>)}</div>}{selected && <div className="editor-selected">{selected.image && <img src={selected.image} alt="" />}<b>{selected.title}<small>{selected.subtitle}</small></b><button type="button" onClick={() => setSelected(null)}>×</button></div>}<label>REVIEW HEADLINE<input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={180} placeholder="The short, memorable verdict" /></label><label>CINEAPE SCORE <span>{score}/10</span><input type="range" min="1" max="10" value={score} onChange={event => setScore(Number(event.target.value))} /></label><label>REVIEW<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={12000} placeholder="Write the official CineApe take. Keep it useful and spoiler-safe." /></label><fieldset><legend>SEARCH PREVIEW <small>Optional, but recommended</small></legend><label>SEO TITLE<input value={seoTitle} onChange={event => setSeoTitle(event.target.value)} maxLength={70} placeholder="e.g. The Bear review: worth watching?" /></label><label>META DESCRIPTION<textarea value={seoDescription} onChange={event => setSeoDescription(event.target.value)} maxLength={170} placeholder="A clear 1–2 sentence search description." /></label></fieldset><label>PUBLISHING STATUS<select value={status} onChange={event => setStatus(event.target.value as "draft" | "published")}><option value="draft">Save as draft</option><option value="published">Publish now</option></select></label><button className="primary wide" disabled={saving}>{saving ? "Saving…" : status === "published" ? "Publish official review" : "Save draft"}</button>{message && <p className="editor-message">{message}</p>}</form><div className="studio-review-list"><h3>Recent reviews</h3>{reviews.length ? reviews.map(review => <article className="panel" key={review.id}>{review.posterPath ? <img src={review.posterPath} alt="" /> : <span>★</span>}<div><b>{review.title}</b><small>{review.headline}</small><em>{review.status === "published" ? "Published" : "Draft"} · {review.score}/10</em></div></article>) : <div className="panel studio-empty">Your official CineApe reviews will appear here.</div>}</div></div></section>;
}

type EditorialList = { id: string; name: string; slug: string; status: "draft" | "published"; createdAt: string; publishedAt: string | null };

function StudioLists() {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [seoTitle, setSeoTitle] = useState(""); const [seoDescription, setSeoDescription] = useState(""); const [status, setStatus] = useState<"draft" | "published">("draft");
  const [query, setQuery] = useState(""); const [matches, setMatches] = useState<EditorialTitle[]>([]); const [items, setItems] = useState<EditorialTitle[]>([]); const [lists, setLists] = useState<EditorialList[]>([]); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const loadLists = () => void fetch("/api/admin/editor-lists").then(response => response.ok ? response.json() as Promise<{ lists?: EditorialList[] }> : null).then(data => setLists(data?.lists ?? [])).catch(() => setLists([]));
  useEffect(() => { loadLists(); }, []);
  const find = async () => { if (query.trim().length < 2) { setMessage("Type at least two letters to find a title."); return; } const response = await fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(query.trim())}`); const data = response.ok ? await response.json() as { results?: EditorialTitle[] } : null; setMatches((data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv")); };
  const add = (title: EditorialTitle) => { if (!items.some(item => item.id === title.id && item.type === title.type)) setItems(current => [...current, title]); setMatches([]); setQuery(""); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/admin/editor-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, seoTitle, seoDescription, status, items: items.map(item => ({ tmdbId: item.id, type: item.type, name: item.title, year: item.year ? Number(item.year) : null, posterPath: item.image })) }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "List could not be saved."); setSaving(false); return; } setMessage(status === "published" ? "Must-watch list published." : "List saved as a draft."); setName(""); setDescription(""); setSeoTitle(""); setSeoDescription(""); setItems([]); setSaving(false); loadLists(); };
  return <section className="studio-editorial"><div className="studio-section-head"><div><p className="eyebrow">CINEAPE EDITORIAL</p><h2>Build a must-watch list</h2><p>Published lists appear at <b>/must-watch</b> and are ready to be found and shared.</p></div></div><div className="studio-editor-grid"><form className="panel editorial-form" onSubmit={submit}><label>LIST NAME<input value={name} onChange={event => setName(event.target.value)} maxLength={160} placeholder="e.g. 10 TV shows worth starting tonight" /></label><label>INTRODUCTION<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} placeholder="Tell people why this list is worth their time." /></label><label>ADD TITLES<div className="editor-title-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a movie or show" /><button type="button" className="secondary" onClick={() => void find()}>Find</button></div></label>{matches.length > 0 && <div className="editor-matches">{matches.map(match => <button type="button" key={`${match.type}-${match.id}`} onClick={() => add(match)}>{match.image ? <img src={match.image} alt="" /> : <span>◉</span>}<div><b>{match.title}</b><small>{match.subtitle}</small></div></button>)}</div>}<div className="list-picked-titles">{items.length ? items.map((item, index) => <article key={`${item.type}-${item.id}`}>{item.image ? <img src={item.image} alt="" /> : <span>{index + 1}</span>}<b>{index + 1}. {item.title}</b><button type="button" onClick={() => setItems(current => current.filter(choice => choice.id !== item.id || choice.type !== item.type))}>×</button></article>) : <p>Add at least three movies or shows.</p>}</div><fieldset><legend>SEARCH PREVIEW <small>Optional, but recommended</small></legend><label>SEO TITLE<input value={seoTitle} onChange={event => setSeoTitle(event.target.value)} maxLength={70} /></label><label>META DESCRIPTION<textarea value={seoDescription} onChange={event => setSeoDescription(event.target.value)} maxLength={170} /></label></fieldset><label>PUBLISHING STATUS<select value={status} onChange={event => setStatus(event.target.value as "draft" | "published")}><option value="draft">Save as draft</option><option value="published">Publish now</option></select></label><button className="primary wide" disabled={saving}>{saving ? "Saving…" : status === "published" ? "Publish must-watch list" : "Save draft"}</button>{message && <p className="editor-message">{message}</p>}</form><div className="studio-review-list"><h3>Recent lists</h3>{lists.length ? lists.map(list => <article className="panel" key={list.id}><span>☰</span><div><b>{list.name}</b><small>{list.status === "published" ? "Published" : "Draft"}</small><em>cineape.com/must-watch/{list.slug}</em></div></article>) : <div className="panel studio-empty">Your CineApe lists will appear here.</div>}</div></div></section>;
}

type MemberProfile = { displayName: string; avatarUrl: string | null; bio: string | null };

function ProfilePageLegacy() {
  const { user } = useUser();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [stats, setStats] = useState({ friends: 0, ratings: 0, sent: 0 });
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      await fetch("/api/account", { method: "POST" });
      const response = await fetch("/api/account");
      if (!response.ok || !active) return;
      const data = await response.json() as { profile: MemberProfile; stats: { friends: number; ratings: number; sent: number } };
      if (active) { setProfile(data.profile); setStats(data.stats); setDisplayName(data.profile.displayName); setBio(data.profile.bio ?? ""); }
    })();
    return () => { active = false; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage("Saving…");
    const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, bio }) });
    const data = await response.json() as { profile?: MemberProfile; error?: string };
    if (!response.ok || !data.profile) { setMessage(data.error ?? "Unable to save your profile."); return; }
    setProfile(data.profile); setEditing(false); setMessage("Profile saved.");
  };

  if (!profile) return <section className="page"><div className="panel title-loading">Setting up your profile…</div></section>;
  const initials = profile.displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="page member-profile"><div className="panel member-profile-head"><Avatar imageUrl={profile.avatarUrl ?? user?.imageUrl}>{initials}</Avatar><div><p className="eyebrow">YOUR CINEAPE PROFILE</p><h1>{profile.displayName}</h1><p>{profile.bio || "Add a short bio so your circle knows what you love to watch."}</p></div><button className="secondary" onClick={() => { setEditing(!editing); setMessage(""); }}> {editing ? "Cancel" : "Edit profile"}</button></div>{editing && <form className="panel profile-editor" onSubmit={save}><label>DISPLAY NAME<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50}/></label><label>ABOUT YOU <small>Optional · 280 characters</small><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={280} placeholder="Tell your Circle what you like to watch…"/></label><div><button className="primary" type="submit">Save profile</button>{message && <span>{message}</span>}</div></form>}<div className="profile-stats member-stats"><b>{stats.ratings}<span>Ratings</span></b><b>{stats.friends}<span>Friends</span></b><b>{stats.sent}<span>Recommendations sent</span></b></div><div className="profile-grid member-profile-grid"><article className="panel profile-next"><p className="eyebrow">MAKE IT YOURS</p><h2>Build your taste profile</h2><p>Your profile learns from the movies and shows you rate. Your favorite genres will appear here as your history grows.</p></article><article className="panel profile-next"><p className="eyebrow">YOUR CIRCLE</p><h2>Start with people you trust</h2><p>Invite family and friends to compare ratings and trade recommendations that actually fit.</p></article></div></section>;
}
function ProfilePage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [stats, setStats] = useState({ friends: 0, ratings: 0, sent: 0 });
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const load = async () => { await fetch("/api/account", { method: "POST" }); const response = await fetch("/api/account"); if (!response.ok) return; const data = await response.json() as { profile: MemberProfile; stats: { friends: number; ratings: number; sent: number } }; setProfile(data.profile); setStats(data.stats); setDisplayName(data.profile.displayName); setBio(data.profile.bio ?? ""); };
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setMessage("Saving…"); const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, bio }) }); const data = await response.json() as { profile?: MemberProfile; error?: string }; if (!response.ok || !data.profile) { setMessage(data.error ?? "Unable to save your profile."); return; } setProfile(data.profile); setEditing(false); setMessage("Profile saved."); };
  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !user) return; if (!file.type.startsWith("image/")) { setMessage("Choose an image file."); return; } if (file.size > 5 * 1024 * 1024) { setMessage("Choose an image smaller than 5 MB."); return; } setUploading(true); setMessage("Updating your picture…"); try { await user.setProfileImage({ file }); await user.reload(); await load(); setMessage("Profile picture updated."); } catch { setMessage("Your picture could not be updated. Please try a different image."); } finally { setUploading(false); event.target.value = ""; } };
  if (!profile) return <section className="page"><div className="panel title-loading">Setting up your profile…</div></section>;
  const initials = profile.displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="page member-profile"><div className="panel member-profile-head"><div className="profile-photo"><Avatar imageUrl={profile.avatarUrl ?? user?.imageUrl}>{initials}</Avatar>{editing && <label className="photo-change"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void choosePhoto(event)} disabled={uploading}/>{uploading ? "Uploading…" : "Change photo"}</label>}</div><div><p className="eyebrow">YOUR CINEAPE PROFILE</p><h1>{profile.displayName}</h1><p>{profile.bio || "Add a short bio so your circle knows what you love to watch."}</p></div><button className="secondary" onClick={() => { setEditing(value => !value); setMessage(""); }}>{editing ? "Cancel" : "Edit profile"}</button></div>{editing && <form className="panel profile-editor" onSubmit={save}><label>DISPLAY NAME<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} placeholder="What should your Circle call you?"/></label><label>ABOUT YOU <small>Optional · 280 characters</small><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={280} placeholder="Tell your Circle what you like to watch…"/></label><div><button className="primary" type="submit">Save profile</button>{message && <span>{message}</span>}</div></form>}{!editing && message && <p className="profile-save-message">{message}</p>}<div className="profile-stats member-stats"><b>{stats.ratings}<span>Ratings</span></b><b>{stats.friends}<span>Friends</span></b><b>{stats.sent}<span>Recommendations sent</span></b></div><div className="profile-grid member-profile-grid"><article className="panel profile-next"><p className="eyebrow">MAKE IT YOURS</p><h2>Build your taste profile</h2><p>Your profile learns from the movies and shows you rate. Your favorite genres will appear here as your history grows.</p></article><article className="panel profile-next"><p className="eyebrow">YOUR CIRCLE</p><h2>Start with people you trust</h2><p>Invite family and friends to compare ratings and trade recommendations that actually fit.</p></article></div></section>;
}

type DiscoverTitle = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; score: string };

function DiscoverPage({ onOpen }: { onOpen: (title?: string, meta?: string, score?: string) => void }) {
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [category, setCategory] = useState("all");
  const [titles, setTitles] = useState<DiscoverTitle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const country = navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US";
    void fetch(`/api/tmdb?mode=discover&type=${filter}&category=${category}&country=${country}`).then(response => response.ok ? response.json() as Promise<{ titles?: DiscoverTitle[] }> : null)
      .then(data => { if (active) setTitles(data?.titles ?? []); })
      .catch(() => { if (active) setTitles([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, category]);

  const filters = [{ key: "all", label: "Popular now" }, { key: "movie", label: "Movies" }, { key: "tv", label: "TV shows" }] as const;
  const categories = filter === "movie"
    ? [{ key: "all", label: "All movies" }, { key: "new", label: "New releases" }, { key: "drama", label: "Drama" }, { key: "thriller", label: "Thriller" }, { key: "comedy", label: "Comedy" }, { key: "animation", label: "Animation" }, { key: "horror", label: "Horror" }, { key: "scifi", label: "Sci-fi" }, { key: "family", label: "Family" }]
    : [{ key: "all", label: "All shows" }, { key: "new", label: "New releases" }, { key: "drama", label: "Drama" }, { key: "thriller", label: "Mystery & thriller" }, { key: "comedy", label: "Comedy" }, { key: "animation", label: "Animation" }, { key: "horror", label: "Horror & fantasy" }, { key: "crime", label: "Crime" }, { key: "reality", label: "Reality" }];
  const subtitle = filter === "all" ? "Popular English-language movies and shows for your region." : filter === "movie" ? "Popular English-language movies to save for your next night in." : "Popular English-language series ready for your next binge.";
  return <section className="page live-discover"><Intro label="DISCOVER" title="Find your next obsession." text={subtitle} action={null}/><div className="tabs discover-tabs">{filters.map(item => <button key={item.key} className={filter === item.key ? "chosen" : ""} onClick={() => { setFilter(item.key); setCategory("all"); }}>{item.label}</button>)}</div>{filter !== "all" && <div className="genre-chips" aria-label={`${filter === "movie" ? "Movie" : "TV show"} categories`}>{categories.map(item => <button key={item.key} className={category === item.key ? "chosen" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>}{loading ? <div className="panel discover-loading">Finding great titles…</div> : titles.length ? <div className="discover-grid live-discover-grid">{titles.map((title, index) => <article className="media-card" key={`${title.type}-${title.id}`}><button className={`cover ${["a", "b", "c", "d", "e"][index % 5]}`} onClick={() => onOpen(title.title, `${title.year ?? "—"} · ${title.type === "tv" ? "TV series" : "Movie"}`, title.score)}>{title.image && <img src={title.image} alt={`${title.title} poster`} />}<span className="cover-type">{title.type === "tv" ? "TV" : "Movie"}</span><span className="cover-score">★ {title.score}</span><span className="cover-title"><small>{title.year ?? "New release"}</small>{title.title}</span></button><strong>{title.title}</strong><span>{title.type === "tv" ? "TV series" : "Movie"} · TMDB {title.score}</span></article>)}</div> : <div className="panel discover-empty"><b>Live titles are not available just now.</b><p>Try using the search at the top to find a movie, show, actor, or actress.</p></div>}</section>;
}

type CircleFriend = { id: string; displayName: string; avatarUrl: string | null; bio: string | null };
type CircleGroup = { id: string; name: string; createdAt: string; memberCount: number; pickCount: number; isOwner: boolean };

function CirclePageLegacy({ onInvite }: { onInvite: () => void }) {
  const [friends, setFriends] = useState<CircleFriend[]>([]);
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [invitingGroup, setInvitingGroup] = useState<CircleGroup | null>(null);

  const load = () => {
    setLoading(true);
    void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ friends?: CircleFriend[]; groups?: CircleGroup[] }> : null)
      .then(data => { setFriends(data?.friends ?? []); setGroups(data?.groups ?? []); })
      .catch(() => { setFriends([]); setGroups([]); }).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    setGroupMessage("Creating your group…");
    const response = await fetch("/api/circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: groupName }) });
    const data = await response.json() as { group?: CircleGroup; error?: string };
    if (!response.ok || !data.group) { setGroupMessage(data.error ?? "Your group could not be created."); return; }
    setGroups(current => [data.group!, ...current]); setGroupName(""); setCreating(false); setGroupMessage("");
  };
  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();

  return <section className="page circle-page"><Intro label="YOUR PEOPLE" title="Better together." text="Share the good stuff with the people you actually watch with." action={<button className="primary" onClick={() => { setCreating(true); setGroupMessage(""); }}>+ Create a group</button>}/>{creating && <form className="panel group-creator" onSubmit={createGroup}><label>GROUP NAME<input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Movie night crew" maxLength={60} autoFocus/></label><div><button type="button" className="secondary" onClick={() => { setCreating(false); setGroupMessage(""); }}>Cancel</button><button className="primary" type="submit">Create group</button></div>{groupMessage && <small>{groupMessage}</small>}</form>}<section className="circle-section"><div className="section-title"><div><h2>Your friends <span>{friends.length ? `· ${friends.length}` : ""}</span></h2><p>People in your private CineApe circle.</p></div><button onClick={onInvite}>Invite people</button></div>{loading ? <div className="panel circle-loading">Loading your circle…</div> : friends.length ? <div className="panel circle-friends">{friends.map(friend => <article key={friend.id}><Avatar imageUrl={friend.avatarUrl}>{initials(friend.displayName)}</Avatar><div><b>{friend.displayName}</b><small>{friend.bio || "In your CineApe circle"}</small></div><span>Friend</span></article>)}</div> : <div className="panel circle-empty"><div><b>Your circle starts with your people.</b><p>Invite family and friends to swap recommendations, compare reviews, and plan what to watch next.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}</section><section className="circle-section"><div className="section-title"><div><h2>Your groups <span>{groups.length ? `· ${groups.length}` : ""}</span></h2><p>Private spaces for movie nights, families, and favorite shows.</p></div></div>{loading ? <div className="panel circle-loading">Loading your groups…</div> : groups.length ? <div className="group-grid live-group-grid">{groups.map((group, index) => <article className={`panel group live-group tone-${index % 3}`} key={group.id}><i>{index % 3 === 0 ? "✦" : index % 3 === 1 ? "⌂" : "◉"}</i><h3>{group.name}</h3><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.pickCount} shared {group.pickCount === 1 ? "pick" : "picks"}</p>{group.isOwner && <button onClick={() => setInvitingGroup(group)}>Invite a friend</button>}</article>)}</div> : <div className="panel circle-empty"><div><b>Create a home for your next watch.</b><p>Start a private group for your family, friend group, or recurring movie night.</p></div><button className="primary" onClick={() => setCreating(true)}>Create a group</button></div>}</section>{invitingGroup && <GroupInviteModal group={invitingGroup} friends={friends} onClose={() => setInvitingGroup(null)} onInvited={() => { setInvitingGroup(null); load(); }} />}</section>;
}

type FriendProfileData = {
  profile: { id: string; displayName: string; avatarUrl: string | null; bio: string | null; createdAt: string };
  stats: { ratings: number; sent: number; received: number };
  recentRatings: Array<{ title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; score: number; review: string | null; updatedAt: string }>;
  completed: Array<{ title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null }>;
};

function CirclePage({ onInvite }: { onInvite: () => void }) {
  const [friends, setFriends] = useState<CircleFriend[]>([]);
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [invitingGroup, setInvitingGroup] = useState<CircleGroup | null>(null);
  const [profileFriend, setProfileFriend] = useState<CircleFriend | null>(null);
  const load = () => { setLoading(true); void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ friends?: CircleFriend[]; groups?: CircleGroup[] }> : null).then(data => { setFriends(data?.friends ?? []); setGroups(data?.groups ?? []); }).catch(() => { setFriends([]); setGroups([]); }).finally(() => setLoading(false)); };
  useEffect(load, []);
  const createGroup = async (event: React.FormEvent) => { event.preventDefault(); if (!groupName.trim()) return; setGroupMessage("Creating your group…"); const response = await fetch("/api/circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: groupName }) }); const data = await response.json() as { group?: CircleGroup; error?: string }; if (!response.ok || !data.group) { setGroupMessage(data.error ?? "Your group could not be created."); return; } setGroups(current => [data.group!, ...current]); setGroupName(""); setCreating(false); setGroupMessage(""); };
  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="page circle-page"><Intro label="YOUR PEOPLE" title="Better together." text="Share the good stuff with the people you actually watch with." action={<button className="primary" onClick={() => { setCreating(true); setGroupMessage(""); }}>+ Create a group</button>}/>{creating && <form className="panel group-creator" onSubmit={createGroup}><label>GROUP NAME<input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Movie night crew" maxLength={60} autoFocus/></label><div><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button><button className="primary" type="submit">Create group</button></div>{groupMessage && <small>{groupMessage}</small>}</form>}<section className="circle-section"><div className="section-title"><div><h2>Your friends <span>{friends.length ? `· ${friends.length}` : ""}</span></h2><p>People in your private CineApe circle.</p></div><button onClick={onInvite}>Invite people</button></div>{loading ? <div className="panel circle-loading">Loading your circle…</div> : friends.length ? <div className="panel circle-friends">{friends.map(friend => <button className="friend-profile-link" key={friend.id} onClick={() => setProfileFriend(friend)}><Avatar imageUrl={friend.avatarUrl}>{initials(friend.displayName)}</Avatar><div><b>{friend.displayName}</b><small>{friend.bio || "In your CineApe circle"}</small></div><span>View profile →</span></button>)}</div> : <div className="panel circle-empty"><div><b>Your circle starts with your people.</b><p>Invite family and friends to swap recommendations, compare reviews, and plan what to watch next.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}</section><section className="circle-section"><div className="section-title"><div><h2>Your groups <span>{groups.length ? `· ${groups.length}` : ""}</span></h2><p>Private spaces for movie nights, families, and favorite shows.</p></div></div>{loading ? <div className="panel circle-loading">Loading your groups…</div> : groups.length ? <div className="group-grid live-group-grid">{groups.map((group, index) => <article className={`panel group live-group tone-${index % 3}`} key={group.id}><i>{index % 3 === 0 ? "✦" : index % 3 === 1 ? "⌂" : "◉"}</i><h3>{group.name}</h3><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.pickCount} shared {group.pickCount === 1 ? "pick" : "picks"}</p>{group.isOwner && <button onClick={() => setInvitingGroup(group)}>Invite a friend</button>}</article>)}</div> : <div className="panel circle-empty"><div><b>Create a home for your next watch.</b><p>Start a private group for your family, friend group, or recurring movie night.</p></div><button className="primary" onClick={() => setCreating(true)}>Create a group</button></div>}</section>{profileFriend && <FriendProfileModal friend={profileFriend} onClose={() => setProfileFriend(null)}/>} {invitingGroup && <GroupInviteModal group={invitingGroup} friends={friends} onClose={() => setInvitingGroup(null)} onInvited={() => { setInvitingGroup(null); load(); }} />}</section>;
}

function FriendProfileModal({ friend, onClose }: { friend: CircleFriend; onClose: () => void }) {
  const [data, setData] = useState<FriendProfileData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void fetch(`/api/friends/${friend.id}`).then(response => response.ok ? response.json() as Promise<FriendProfileData> : response.json().then((value: { error?: string }) => Promise.reject(new Error(value.error ?? "Profile unavailable.")))).then(profile => { if (active) setData(profile); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Profile unavailable."); }); return () => { active = false; }; }, [friend.id]);
  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="backdrop" onClick={onClose}><div className="modal friend-profile-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>{!data && !error && <p className="share-empty">Loading {friend.displayName}'s profile…</p>}{error && <p className="share-empty">{error}</p>}{data && <><div className="friend-profile-heading"><Avatar imageUrl={data.profile.avatarUrl}>{initials(data.profile.displayName)}</Avatar><div><p className="eyebrow">IN YOUR CINEAPE CIRCLE</p><h2>{data.profile.displayName}</h2><p>{data.profile.bio || "Watching, rating, and sharing great picks."}</p></div></div><div className="friend-profile-stats"><b>{data.stats.ratings}<span>Ratings</span></b><b>{data.stats.sent}<span>Sent</span></b><b>{data.stats.received}<span>Received</span></b></div><section><h3>Recent ratings</h3>{data.recentRatings.length ? <div className="friend-profile-list">{data.recentRatings.map(item => <article key={`${item.title}-${item.updatedAt}`}>{item.posterPath ? <img src={item.posterPath} alt="" /> : <span>★</span>}<div><b>{item.title}</b><small>{item.review || "Rated on CineApe"}</small></div><strong>{item.score}/10</strong></article>)}</div> : <p className="profile-empty">No ratings yet.</p>}</section><section><h3>Recently completed</h3>{data.completed.length ? <div className="completed-pills">{data.completed.map(item => <span key={`${item.type}-${item.title}`}>{item.title}</span>)}</div> : <p className="profile-empty">No completed titles yet.</p>}</section></>}</div></div>;
}

function GroupInviteModal({ group, friends, onClose, onInvited }: { group: CircleGroup; friends: CircleFriend[]; onClose: () => void; onInvited: () => void }) {
  const [friendId, setFriendId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const invite = async () => { if (!friendId || saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/circle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id, friendId }) }); const data = await response.json() as { error?: string; status?: string }; if (!response.ok) { setMessage(data.error ?? "The invitation could not be sent."); setSaving(false); return; } onInvited(); };
  return <div className="backdrop" onClick={onClose}><div className="modal share-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">INVITE TO GROUP</p><h2>Add a friend to {group.name}</h2><p>They’ll get a CineApe notification and can see the group’s shared picks.</p><label>CHOOSE A FRIEND</label>{friends.length ? <div className="share-people">{friends.map(friend => <button key={friend.id} className={friendId === friend.id ? "chosen" : ""} onClick={() => setFriendId(friend.id)}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.displayName.slice(0, 1)}</span>}<b>{friend.displayName}</b></button>)}</div> : <p className="share-empty">Invite someone to your Circle first.</p>}<button className="primary wide" disabled={!friendId || saving} onClick={() => void invite()}>{saving ? "Inviting…" : "Invite to group"}</button>{message && <small className="modal-message">{message}</small>}</div></div>;
}

type HomeRelease = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; score: string };

function HomeCategories({ onOpen, onInvite }: { onOpen: (title?: string, meta?: string, score?: string) => void; onInvite: () => void }) {
  const [movies, setMovies] = useState<HomeRelease[]>([]);
  const [shows, setShows] = useState<HomeRelease[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch("/api/tmdb?mode=home").then(response => response.ok ? response.json() as Promise<{ movies?: HomeRelease[]; shows?: HomeRelease[] }> : null)
      .then(data => { if (active) { setMovies(data?.movies ?? []); setShows(data?.shows ?? []); } })
      .catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const shelf = (title: string, subtitle: string, items: HomeRelease[]) => <section className="home-shelf"><div className="section-title"><div><h2>{title}</h2><p>{subtitle}</p></div><button>View all</button></div>{loading ? <div className="shelf-loading">Finding what’s new…</div> : <div className="cards">{items.slice(0, 4).map((item, index) => <div className="media-card" key={`${item.type}-${item.id}`}><button className={`cover ${["a", "b", "c", "d"][index]}`} onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, item.score)}>{item.image && <img src={item.image} alt={`${item.title} poster`} />}<span className="cover-type">{item.type === "tv" ? "TV" : "Movie"}</span><span className="cover-score">★ {item.score}</span><span className="cover-title"><small>{item.year ?? "New release"}</small>{item.title}</span></button><strong>{item.title}</strong><span>{item.type === "tv" ? "New episodes airing now" : "Now playing"}</span></div>)}</div>}</section>;
  return <div className="home-categories">{shelf("New release movies", "Fresh films now playing and arriving soon.", movies)}{shelf("New release TV shows", "New and returning series to start tonight.", shows)}<section className="home-shelf friends-shelf"><div className="section-title"><div><h2>What your friends are currently watching</h2><p>Updates from the people in your Circle.</p></div></div><div className="panel friends-empty"><div><b>Your Circle is ready when they are.</b><p>Invite family and friends to see what they are watching, saving, and recommending.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div></section></div>;
}
type LiveRecommendation = { id: string; status: "pending" | "watching" | "watched" | "not_interested"; note: string | null; title: string; type: "movie" | "tv"; year: number | null; person: { displayName: string; avatarUrl: string | null } | null };
type LibraryEntry = { id: string; status: "watchlist" | "watching" | "completed"; tmdbId: number; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null };

function ForYouPage({ onInvite, onOpen }: { onInvite: () => void; onOpen: (title?: string, meta?: string, score?: string) => void }) {
  const [view, setView] = useState<"received" | "sent" | "watchlist" | "watching" | "completed">("received");
  const [recommendations, setRecommendations] = useState<LiveRecommendation[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const personalList = view === "watchlist" || view === "watching" || view === "completed";
  const load = () => {
    setLoading(true);
    const endpoint = personalList ? `/api/library?status=${view}` : `/api/recommendations?view=${view}`;
    void fetch(endpoint).then(response => response.ok ? response.json() as Promise<{ recommendations?: LiveRecommendation[]; entries?: LibraryEntry[] }> : null)
      .then(data => { setRecommendations(data?.recommendations ?? []); setLibrary(data?.entries ?? []); })
      .catch(() => { setRecommendations([]); setLibrary([]); }).finally(() => setLoading(false));
  };
  useEffect(load, [view]);
  const update = async (id: string, status: "watching" | "watched") => {
    const response = await fetch("/api/recommendations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) load();
  };
  const labels = [{ key: "received", label: "For you" }, { key: "sent", label: "Sent" }, { key: "watchlist", label: "Watchlist" }, { key: "watching", label: "Watching" }, { key: "completed", label: "Completed" }] as const;
  const emptyText = view === "sent" ? "You have not sent a recommendation yet." : view === "watchlist" ? "Your watchlist is ready for its first great pick." : view === "watching" ? "Nothing is marked as watching yet." : view === "completed" ? "The titles you finish will appear here." : "No one has recommended something to you yet.";
  const listDescription = view === "watchlist" ? "Your personal list of titles to watch next." : view === "watching" ? "The shows and movies you have started." : "Everything you have finished watching.";
  return <section className="page live-inbox"><Intro label={personalList ? "YOUR PERSONAL LISTS" : "YOUR RECOMMENDATIONS"} title={personalList ? (view === "watchlist" ? "Your watchlist." : view === "watching" ? "Currently watching." : "Completed picks.") : "From people who get you."} text={personalList ? listDescription : "Keep every personal pick, thoughtful note, and your verdict in one place."} action={null}/><div className="tabs live-tabs">{labels.map(tab => <button key={tab.key} className={view === tab.key ? "chosen" : ""} onClick={() => setView(tab.key)}>{tab.label}</button>)}</div>{loading ? <div className="panel inbox-loading">Loading your list…</div> : personalList ? library.length ? <div className="panel inbox live-inbox-list personal-library-list">{library.map(item => <article key={item.id}><button className="inbox-cover library-cover" onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, "—")} aria-label={`Open ${item.title}`}>{item.posterPath && <img src={item.posterPath} alt="" />}</button><div><h3>{item.title}</h3><p>{item.type === "tv" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</p></div><strong className={`library-status ${item.status}`}><span>{item.status === "watchlist" ? "☷" : item.status === "watching" ? "◉" : "✓"}</span>{item.status === "watchlist" ? "Watchlist" : item.status === "watching" ? "Watching" : "Completed"}</strong></article>)}</div> : <div className="panel inbox-empty"><div><b>{emptyText}</b><p>Open a title and add it to this personal list whenever you want to come back to it.</p></div></div> : recommendations.length ? <div className="panel inbox live-inbox-list">{recommendations.map(item => <article key={item.id}><button className="inbox-cover" onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, "—")} aria-label={`Open ${item.title}`}></button><div><h3>{item.title}</h3><p>{view === "sent" ? "Sent to" : "From"} <b>{item.person?.displayName ?? "a CineApe member"}</b> · {item.type === "tv" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</p>{item.note && <em>“{item.note}”</em>}</div>{view === "received" ? <div>{item.status === "pending" && <button className="small-primary" onClick={() => void update(item.id, "watching")}>Start watching</button>}{item.status === "watching" && <button className="small-primary" onClick={() => void update(item.id, "watched")}>Mark watched</button>}</div> : <strong className="rec-status">{item.status === "watched" ? "Watched" : "Sent"}</strong>}</article>)}</div> : <div className="panel inbox-empty"><div><b>{emptyText}</b><p>Invite your people and share your first recommendation when you find a title they will love.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}</section>;
}
type LiveTitle = { id: number; type: "movie" | "tv"; title: string; overview: string; year: string | null; poster: string | null; tmdbScore: number | null; tmdbVotes: number; runtime: number | null; genres: string[]; trailer: string | null; cast: Array<{ name: string; character: string; image: string | null }>; country: "CA" | "US"; providers: Array<{ name: string; image: string | null }>; providerLink?: string | null };
type CommunityReview = { score: number; review: string | null; createdAt: string; displayName: string; avatarUrl: string | null };
type PersonalStatus = "watchlist" | "watching" | "completed" | null;

function TitleDetailsLegacy({ selection, onBack, onRecommend, onAddToGroup }: { selection: { title: string; meta: string; score: string }; onBack: () => void; onRecommend: (title: ShareTitle) => void; onAddToGroup: (title: ShareTitle) => void }) {
  const [details, setDetails] = useState<LiveTitle | null>(null);
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [community, setCommunity] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(8);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [personalStatus, setPersonalStatus] = useState<PersonalStatus>(null);
  const [savingPersonalStatus, setSavingPersonalStatus] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setDetails(null); setReviews([]); setCommunity({ average: null, count: 0 }); setReview(""); setMessage(""); setPersonalStatus(null);
    void fetch(`/api/tmdb?query=${encodeURIComponent(selection.title)}`).then(response => response.ok ? response.json() : null)
      .then(async (match: { id?: number; type?: "movie" | "tv" } | null) => {
        if (!match?.id || !match.type || !active) return;
        const localeCountry = navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US";
        const response = await fetch(`/api/tmdb?id=${match.id}&type=${match.type}&country=${localeCountry}`);
        const next = response.ok ? await response.json() as LiveTitle : null;
        if (!active || !next) return;
        setDetails(next); setLoading(false);
        const libraryResponse = await fetch(`/api/library?tmdbId=${next.id}&type=${next.type}`);
        if (libraryResponse.ok && active) {
          const libraryData = await libraryResponse.json() as { status?: PersonalStatus };
          if (active) setPersonalStatus(libraryData.status ?? null);
        }
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

  const advancePersonalStatus = async () => {
    if (!details || savingPersonalStatus) return;
    const next: PersonalStatus = details.type === "tv"
      ? personalStatus === null ? "watchlist" : personalStatus === "watchlist" ? "watching" : personalStatus === "watching" ? "completed" : null
      : personalStatus === null ? "watchlist" : personalStatus === "watchlist" ? "completed" : null;
    setSavingPersonalStatus(true);
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, posterPath: details.poster, status: next }) });
    if (response.ok) setPersonalStatus(next);
    setSavingPersonalStatus(false);
  };

  const personalLabel = personalStatus === "watchlist" ? "In your watchlist" : personalStatus === "watching" ? "Watching" : personalStatus === "completed" ? "Completed" : "Add to watchlist";
  const personalIcon = personalStatus === "watchlist" ? "☷" : personalStatus === "watching" ? "◉" : personalStatus === "completed" ? "✓" : "+";

  const shownTitle = details?.title ?? selection.title;
  return <section className="page live-title-page"><button className="back-link" onClick={onBack}>← Back to discover</button>{loading && <div className="panel title-loading">Loading live title details…</div>}{!loading && details && <><div className="live-title-head"><div className="live-poster">{details.poster ? <img src={details.poster} alt={`${shownTitle} poster`} /> : <span>{shownTitle}</span>}{personalStatus && <span className={`library-poster-badge ${personalStatus}`} title={personalLabel}>{personalIcon}</span>}</div><div className="live-title-copy"><p className="eyebrow">{details.type === "tv" ? "TV SERIES" : "MOVIE"} · {details.year ?? "—"}</p><h1>{shownTitle}</h1><p className="muted">{details.runtime ? `${details.runtime} min · ` : ""}{details.genres.join(" · ")}</p><div className="where-to-watch"><span>Where to watch</span>{details.providers.length ? <div>{details.providers.map(provider => <div className="provider" key={provider.name}>{provider.image ? <img src={provider.image} alt="" /> : <i>{provider.name.slice(0, 1)}</i>}<small>{provider.name}</small></div>)}{details.providerLink && <a href={details.providerLink} target="_blank" rel="noreferrer">View options ↗</a>}</div> : <p>Availability is not listed for this title yet.</p>}</div><div className="score-cards"><div><b>{community.average ?? "—"}</b><span>CineApe Rating<br/>{community.count ? `${community.count} public review${community.count === 1 ? "" : "s"}` : "No reviews yet"}</span></div><div><b>—</b><span>Circle Rating<br/>Invite people to unlock</span></div><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><b>{details.tmdbScore ?? "—"}</b><span>TMDB score<br/>{details.tmdbVotes.toLocaleString()} votes</span></a></div><p className="live-overview">{details.overview || "A synopsis is not available for this title yet."}</p><div className="live-title-actions"><button className={`secondary library-action ${personalStatus ?? ""}`} onClick={() => void advancePersonalStatus()} disabled={savingPersonalStatus}><span>{personalIcon}</span>{savingPersonalStatus ? "Saving…" : personalLabel}</button><button className="primary" onClick={() => onRecommend({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, posterPath: details.poster })}>✦ Recommend to someone</button><button className="secondary" onClick={() => onAddToGroup({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, posterPath: details.poster })}>+ Add to group list</button><button className="secondary" onClick={() => document.getElementById("write-review")?.scrollIntoView({ behavior: "smooth" })}>☆ Write a review</button></div></div></div>{details.trailer && <section className="trailer-section"><div className="section-title"><h2>Official trailer</h2><span>From TMDB</span></div><div className="trailer-frame"><iframe src={details.trailer} title={`${shownTitle} official trailer`} allowFullScreen /></div></section>}<section className="cast-section"><div className="section-title"><h2>Cast</h2><span>{details.cast.length ? "From TMDB" : "Cast information unavailable"}</span></div><div className="cast-grid">{details.cast.map(person => <article key={`${person.name}-${person.character}`}><div>{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}</div><b>{person.name}</b><small>{person.character || "Cast"}</small></article>)}</div></section><section className="community-section"><div className="section-title"><div><p className="eyebrow">PUBLIC ON CINEAPE</p><h2>Community reviews</h2></div><span>Everyone can read these</span></div><div className="review-layout"><form className="write-review panel" id="write-review" onSubmit={event => { event.preventDefault(); void saveReview(); }}><h3>Rate {shownTitle}</h3><p>Your review will be visible to all CineApe members.</p><div className="rating-buttons">{[1,2,3,4,5,6,7,8,9,10].map(value => <button type="button" className={score === value ? "chosen" : ""} key={value} onClick={() => setScore(value)}>{value}</button>)}</div><textarea value={review} onChange={event => setReview(event.target.value)} placeholder="What did you think? Keep it helpful and spoiler-aware." maxLength={2000}/><button className="primary wide" disabled={saving}>{saving ? "Publishing…" : "Publish my review"}</button>{message && <small className="review-message">{message}</small>}</form><div className="public-reviews">{reviews.length ? reviews.map(item => <article className="panel" key={`${item.displayName}-${item.createdAt}`}><div className="review-author">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span>{item.displayName.slice(0, 1)}</span>}<div><b>{item.displayName}</b><small>Public CineApe review</small></div><strong>{item.score}/10</strong></div>{item.review ? <p>{item.review}</p> : <p className="muted">Rated this title without a written review.</p>}</article>) : <div className="empty-reviews panel"><b>Be the first to review it.</b><p>Your score will begin the CineApe community rating for this title.</p></div>}</div></div></section></>}</section>;
}
type FilmCredit = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; character: string };
type Filmography = { id: number; name: string; image: string | null; department: string; biography: string; filmography: { movies: FilmCredit[]; tv: FilmCredit[] } };

function TitleDetails({ selection, onBack, onRecommend, onAddToGroup }: { selection: { title: string; meta: string; score: string }; onBack: () => void; onRecommend: (title: ShareTitle) => void; onAddToGroup: (title: ShareTitle) => void }) {
  const [castName, setCastName] = useState<string | null>(null);
  const onCastClick = (event: React.MouseEvent<HTMLDivElement>) => { const target = event.target instanceof Element ? event.target : null; const card = target?.closest(".cast-grid article"); const name = card?.querySelector("b")?.textContent?.trim(); if (name) setCastName(name); };
  return <div className="cast-click-zone" onClick={onCastClick}><TitleDetailsLegacy selection={selection} onBack={onBack} onRecommend={onRecommend} onAddToGroup={onAddToGroup}/>{castName && <CastFilmographyModal name={castName} onClose={() => setCastName(null)}/>}</div>;
}

function CastFilmographyModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [person, setPerson] = useState<Filmography | null>(null); const [tab, setTab] = useState<"movies" | "tv">("movies"); const [error, setError] = useState("");
  useEffect(() => { let active = true; setPerson(null); setError(""); void fetch(`/api/tmdb?person=${encodeURIComponent(name)}`).then(response => response.ok ? response.json() as Promise<Filmography> : response.json().then((data: { error?: string }) => Promise.reject(new Error(data.error ?? "Filmography unavailable.")))).then(data => { if (active) setPerson(data); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Filmography unavailable."); }); return () => { active = false; }; }, [name]);
  const credits = person?.filmography[tab] ?? [];
  return <div className="backdrop" onClick={onClose}><div className="modal cast-filmography-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>{!person && !error && <p className="share-empty">Loading {name}'s filmography…</p>}{error && <p className="share-empty">{error}</p>}{person && <><div className="filmography-heading">{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}<div><p className="eyebrow">{person.department}</p><h2>{person.name}</h2>{person.biography && <p>{person.biography}</p>}</div></div><div className="tabs filmography-tabs"><button className={tab === "movies" ? "chosen" : ""} onClick={() => setTab("movies")}>Movies <span>{person.filmography.movies.length}</span></button><button className={tab === "tv" ? "chosen" : ""} onClick={() => setTab("tv")}>TV series <span>{person.filmography.tv.length}</span></button></div>{credits.length ? <div className="filmography-grid">{credits.map(credit => <article key={`${credit.type}-${credit.id}`}><div>{credit.image ? <img src={credit.image} alt="" /> : <span>{credit.title.slice(0, 1)}</span>}</div><b>{credit.title}</b><small>{credit.year ?? "—"}{credit.character ? ` · ${credit.character}` : ""}</small></article>)}</div> : <p className="profile-empty">No {tab === "tv" ? "TV series" : "movies"} listed.</p>}</>}</div></div>;
}

function Intro({label,title,text,action}:{label:string,title:string,text:string,action:React.ReactNode}) { return <div className="intro"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Tabs({labels}:{labels:string[]}) { const [chosen,setChosen]=useState(0); return <div className="tabs">{labels.map((x,i)=><button onClick={()=>setChosen(i)} className={chosen===i?"chosen":""} key={x}>{x}</button>)}</div>; }
function MiniRec({title,person,tone,label}:{title:string,person:string,tone:string,label:string}) { return <div className="mini-rec"><span className={`mini-cover ${tone}`}></span><p><b>{title}</b><span><strong>{person}</strong> thinks you’ll love it</span></p><small>{label}</small></div>; }
function Friend({name, initials, match, tone=""}:{name:string,initials:string,match:string,tone?:string}) { return <div className="friend"><Avatar tone={tone}>{initials}</Avatar><p><b>{name}</b><span>{match} match for you</span></p><strong>{match}</strong></div>; }
function Group({icon,name,info,pink,green}:{icon:string,name:string,info:string,pink?:boolean,green?:boolean}) { return <article className={`panel group ${pink?"pink":""} ${green?"green":""}`}><i>{icon}</i><h3>{name}</h3><p>{info}</p><div><Avatar>SB</Avatar><Avatar tone="blue-tone">MR</Avatar><Avatar tone="rose-tone">JB</Avatar></div><button>Open group →</button></article>; }
function Activity({who,initial,text,time}:{who:string,initial:string,text:string,time:string}) { return <div className="activity-row"><Avatar>{initial}</Avatar><p><b>{who}</b> {text}<span>“The cast is perfect.”</span></p><time>{time}</time></div>; }
