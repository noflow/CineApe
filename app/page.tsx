"use client";

import { useEffect, useRef, useState } from "react";
import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";

type Page = "Home" | "Discover" | "For You" | "Friends & Groups" | "My Profile" | "Studio" | "Title";
type SearchResult = { id: number; type: "movie" | "tv" | "person"; title: string; year: string | null; image: string | null; subtitle: string };
type TitleSelection = { title: string; meta: string; score: string; tmdbId?: number; type?: "movie" | "tv" };
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
  const [navigationReady, setNavigationReady] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<TitleSelection>({ title: "Mickey 17", meta: "2025 · Science fiction", score: "8.2" });
  const [modal, setModal] = useState<"recommend" | "groupPick" | "quickRecommend" | null>(null);
  const [toast, setToast] = useState("");
  const [watching, setWatching] = useState<string[]>(["Slow Horses"]);
  const [shareTitle, setShareTitle] = useState<ShareTitle | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountDisplayName, setAccountDisplayName] = useState<string | null>(null);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [discoverResume, setDiscoverResume] = useState<DiscoverResume | null>(null);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const openTitle = (title = "Mickey 17", meta = "2025 · Science fiction", score = "8.2", tmdbId?: number, type?: "movie" | "tv") => { setSelectedTitle({ title, meta, score, tmdbId, type }); setPage("Title"); };
  const desktopNav = ["Home", "Discover", "For You", "Friends & Groups", "My Profile", ...(isAdmin ? ["Studio" as Page] : [])] as Page[];
  const mobileNav = ["Home", "Discover", "For You", "Friends & Groups", "My Profile"] as Page[];
  const navIcon = (item: Page) => ({ "Home": "⌂", "Discover": "⌕", "For You": "✦", "Friends & Groups": "♧", "My Profile": "◉", "Studio": "✎", "Title": "" }[item]);
  const shown = page === "Title" ? "Title" : page;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("cineape-navigation-v1");
      if (saved) {
        const data = JSON.parse(saved) as { page?: Page; selectedTitle?: TitleSelection };
        if (["Home", "Discover", "For You", "Friends & Groups", "My Profile", "Studio", "Title"].includes(data.page ?? "")) setPage(data.page as Page);
        if (data.selectedTitle?.title && data.selectedTitle.meta && data.selectedTitle.score) setSelectedTitle({ title: data.selectedTitle.title, meta: data.selectedTitle.meta, score: data.selectedTitle.score, tmdbId: data.selectedTitle.tmdbId, type: data.selectedTitle.type === "tv" || data.selectedTitle.type === "movie" ? data.selectedTitle.type : undefined });
      }
    } catch { /* Ignore an invalid saved screen. */ }
    setNavigationReady(true);
  }, []);

  useEffect(() => {
    if (!navigationReady) return;
    sessionStorage.setItem("cineape-navigation-v1", JSON.stringify({ page, selectedTitle }));
  }, [navigationReady, page, selectedTitle]);

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
    if (!isSignedIn) {
      setAccountDisplayName(null);
      setNeedsDisplayName(false);
      return;
    }
    let active = true;
    void (async () => {
      await fetch("/api/account", { method: "POST" });
      const response = await fetch("/api/account");
      if (!response.ok || !active) return;
      const data = await response.json() as { profile?: { displayName?: string } };
      const name = data.profile?.displayName;
      if (!name) return;
      setAccountDisplayName(name);
      setNeedsDisplayName(name === "CineApe member");
    })().catch(() => undefined);
    return () => { active = false; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) { setIsAdmin(false); return; }
    void fetch("/api/admin").then(response => response.ok ? response.json() as Promise<{ isAdmin?: boolean }> : null)
      .then(data => setIsAdmin(Boolean(data?.isAdmin))).catch(() => setIsAdmin(false));
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) { setHasUnreadNotifications(false); return; }
    let active = true;
    const check = () => void fetch("/api/notifications?mode=unread").then(response => response.ok ? response.json() as Promise<{ unread?: number }> : null).then(data => { if (active) setHasUnreadNotifications(Boolean(data?.unread)); }).catch(() => undefined);
    check();
    const interval = window.setInterval(check, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [isSignedIn]);

  const providerAccount = user?.externalAccounts.find(account => account.username || account.firstName || account.lastName);
  const clerkDisplayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || providerAccount?.username || [providerAccount?.firstName, providerAccount?.lastName].filter(Boolean).join(" ") || "CineApe member";
  const displayName = accountDisplayName || clerkDisplayName;
  const firstName = displayName.split(" ")[0] || "there";
  const movieCards = (limit = 4) => <div className="cards">{titles.slice(0, limit).map(([title, meta, score, tone]) => <div className="media-card" key={title}><Cover title={title} meta={meta} score={score} tone={tone} onClick={() => openTitle(title, meta, score)}/><strong>{title}</strong><span>Save it to your watchlist</span></div>)}</div>;
  const recommend = () => page === "Friends & Groups" ? null : <button type="button" className="primary recommend-action" onClick={() => setModal("quickRecommend")} aria-label="Recommend a movie or show" data-tooltip="Recommend a movie or show"><span aria-hidden="true">+</span></button>;
  const chooseShareTitle = (title: ShareTitle, mode: "recommend" | "groupPick") => { setShareTitle(title); setModal(mode); };

  if (!isLoaded) return <div className="session-loading" aria-label="Loading CineApe"><span></span></div>;
  if (!isSignedIn) return <LandingPage />;
  if (!navigationReady) return <div className="session-loading" aria-label="Restoring your CineApe screen"><span></span></div>;

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setPage("Home")} aria-label="CineApe home"><img src="/cineape-logo.png" alt="CineApe"/></button><p>MENU</p><nav className="desktop-nav">{desktopNav.map(item => <button key={item} className={shown === item ? "active" : ""} onClick={() => setPage(item)}><span>{navIcon(item)}</span>{item}</button>)}</nav><nav className="mobile-nav">{mobileNav.map(item => <button key={item} className={shown === item ? "active" : ""} onClick={() => setPage(item)}><span>{navIcon(item)}</span>{item}</button>)}</nav></aside>
    <main><header><button className="mobile-brand" onClick={() => setPage("Home")}><i></i>CineApe</button><label className="search">⌕<input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search movies, shows, people..." aria-label="Search movies, shows, actors, and actresses"/>{searchQuery.trim().length >= 2 && <div className="search-results">{searching && <p>Searching CineApe…</p>}{!searching && searchResults.map(result => result.type === "person" ? <div className="search-result person-result" key={`${result.type}-${result.id}`}>{result.image ? <img src={result.image} alt="" /> : <span>{result.title.slice(0, 1)}</span>}<div><b>{result.title}</b><small>{result.subtitle}</small></div><em>Person</em></div> : <button className="search-result" key={`${result.type}-${result.id}`} onClick={() => { setSearchQuery(""); setSearchResults([]); openTitle(result.title, `${result.year ?? "—"} · ${result.type === "tv" ? "TV series" : "Movie"}`, "—", result.id, result.type as "movie" | "tv"); }}>{result.image ? <img src={result.image} alt="" /> : <span>{result.title.slice(0, 1)}</span>}<div><b>{result.title}</b><small>{result.subtitle}</small></div><em>{result.type === "tv" ? "TV" : "Movie"}</em></button>)}{!searching && !searchResults.length && <p>No movies, shows, or people found.</p>}</div>}</label><div><button className={`bell ${hasUnreadNotifications ? "has-unread" : ""}`} aria-label="Notifications" onClick={() => { setHasUnreadNotifications(false); setNotificationsOpen(true); }}><img className="notification-bell-art" src="/notification-bell.png" alt="" />{hasUnreadNotifications && <span className="notification-dot" aria-hidden="true" />}</button>{recommend()}</div></header>

    {page === "Home" && <section className="page home"><div className="hero onboarding-hero"><div><p className="eyebrow">WELCOME TO CINEAPE, {firstName.toUpperCase()}</p><h1>Your circle starts with one great pick.</h1><p>Catch new releases, see what your Circle is watching, and never lose a good recommendation.</p><button className="light-button" onClick={() => setPage("Discover")}>Discover movies and shows →</button></div><div className="poster-stack"><span className="poster poster-1">YOUR<br/>NEXT</span><span className="poster poster-2">GREAT<br/>PICK</span><span className="poster poster-3">START<br/>HERE</span></div></div><HomeCategories onOpen={openTitle} onInvite={() => setInviteOpen(true)} /></section>}

    {page === "Discover" && <DiscoverPage onOpen={openTitle} resume={discoverResume} onSnapshot={setDiscoverResume} />}

    {page === "Title" && <TitleDetails selection={selectedTitle} onBack={() => setPage("Discover")} onOpenTitle={openTitle} onRecommend={(title) => chooseShareTitle(title, "recommend")} onAddToGroup={(title) => chooseShareTitle(title, "groupPick")}/>} 

    {page === "For You" && <ForYouTrackingPage onInvite={() => setInviteOpen(true)} onOpen={openTitle} />}

    {page === "Friends & Groups" && <CirclePage onInvite={() => setInviteOpen(true)} onOpen={openTitle} />}

    {page === "My Profile" && <><ProfilePage /><ProfileMobileTools isAdmin={isAdmin} onOpenStudio={() => setPage("Studio")} /></>}
    {page === "Studio" && isAdmin && <StudioPage />}
    </main>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    {notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} />}
    <TmdbAttribution />
    <div className="auth-float"><AccountControls /></div>
    {modal === "quickRecommend" && <QuickRecommendModal onClose={() => setModal(null)} onSelected={(title) => { setShareTitle(title); setModal("recommend"); }}/>} {modal === "recommend" && shareTitle && <RecommendationModal title={shareTitle} onClose={() => setModal(null)} onSent={(name) => { setModal(null); flash(`Recommendation sent to ${name} ✦`); }} />}
    {modal === "groupPick" && shareTitle && <GroupPickModal title={shareTitle} onClose={() => setModal(null)} onSaved={(name) => { setModal(null); flash(`Added to ${name}'s shared picks.`); }} />}
    {needsDisplayName && <DisplayNameModal suggestedUsername={user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? ""} onSaved={(name) => { setAccountDisplayName(name); setNeedsDisplayName(false); flash(`Welcome to CineApe, ${name}.`); }} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
function clerkProfileError(error: unknown) {
  const first = typeof error === "object" && error && "errors" in error && Array.isArray((error as { errors?: unknown[] }).errors) ? (error as { errors: Array<{ code?: string; longMessage?: string; message?: string }> }).errors[0] : null;
  if (first?.code === "form_identifier_not_enabled") return "Usernames are not enabled in Clerk yet. Enable Username in Clerk’s User & authentication settings, then try again.";
  if (first?.code === "form_identifier_exists") return "That username is already taken. Please try another one.";
  return first?.longMessage || first?.message || "Clerk could not save this profile. Please try again.";
}

function DisplayNameModal({ suggestedUsername, onSaved }: { suggestedUsername: string; onSaved: (name: string) => void }) {
  const { user } = useUser();
  const [firstName, setFirstName] = useState(() => user?.firstName ?? "");
  const [lastName, setLastName] = useState(() => user?.lastName ?? "");
  const [username, setUsername] = useState(() => suggestedUsername.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50));
  const [showUsername, setShowUsername] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const realNamePreview = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanFirstName = firstName.trim().slice(0, 50);
    const cleanLastName = lastName.trim().slice(0, 50);
    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    const realName = [cleanFirstName, cleanLastName].filter(Boolean).join(" ");
    const useUsername = showUsername || !realName;
    const displayName = useUsername ? cleanUsername : realName;
    if (!useUsername && (cleanFirstName.length < 1 || cleanLastName.length < 1)) { setMessage("Add your last name, or choose to show your username instead."); return; }
    if (cleanUsername.length < 3) { setMessage("Choose a username with at least three letters, numbers, hyphens, or underscores."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, username: cleanUsername }) });
      const data = await response.json() as { error?: string; profile?: { displayName?: string } };
      if (!response.ok || !data.profile?.displayName) { setMessage(data.error ?? "Your display name could not be saved."); return; }
      onSaved(data.profile.displayName);
      // CineApe's profile is the source of truth for the social experience.
      // Sync to Clerk afterwards so a Clerk-side setting cannot trap someone
      // in the welcome screen after their CineApe profile has saved.
      if (user) {
        const clerkUpdates: { username: string; firstName?: string; lastName?: string } = { username: cleanUsername };
        if (cleanFirstName) clerkUpdates.firstName = cleanFirstName;
        if (cleanLastName) clerkUpdates.lastName = cleanLastName;
        void user.update(clerkUpdates).catch(() => undefined);
      }
    } catch (error) { setMessage(clerkProfileError(error)); }
    finally { setSaving(false); }
  };

  return <div className="backdrop name-backdrop"><form className="modal name-modal" onSubmit={save}><p className="eyebrow">WELCOME TO CINEAPE</p><h2>Set up your CineApe profile</h2><p>Your real name stays on your Clerk account. Choose whether friends see it or your username on CineApe.</p><div className="name-fields"><label>FIRST NAME<input value={firstName} onChange={event => setFirstName(event.target.value)} placeholder="First name" autoFocus maxLength={50}/></label><label>LAST NAME<input value={lastName} onChange={event => setLastName(event.target.value)} placeholder="Last name" maxLength={50}/></label></div><label>USERNAME<input value={username} onChange={event => setUsername(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="cinefan" maxLength={50}/><small>Letters, numbers, hyphens, and underscores only.</small></label><label className="display-choice"><input type="checkbox" checked={showUsername} onChange={event => setShowUsername(event.target.checked)}/><span><b>Show my username instead</b><small>{showUsername ? `Friends will see ${username ? `@${username}` : "your username"}.` : `Friends will see ${realNamePreview || "your real name"}.`}</small></span></label><button className="primary wide" disabled={saving}>{saving ? "Saving…" : "Save and continue"}</button>{message && <small className="modal-message">{message}</small>}</form></div>;
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

type AppNotification = { id: string; kind: "recommendation" | "group_join" | "streaming" | "episode" | "chat" | "friend_request"; message: string; createdAt: string; readAt: string | null };

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let active = true;
    const country = navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US";

    void fetch(`/api/notifications?country=${country}`)
      .then(response => response.ok ? response.json() as Promise<{ notifications?: AppNotification[] }> : null)
      .then(data => { if (active) setItems(data?.notifications ?? []); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });

    void fetch("/api/notifications", { method: "PATCH" });
    return () => { active = false; };
  }, []);

  const clearAll = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const response = await fetch("/api/notifications", { method: "DELETE" });
      if (response.ok) setItems([]);
    } finally {
      setClearing(false);
    }
  };

  const icon = (kind: AppNotification["kind"]) => kind === "recommendation" ? "✦" : kind === "group_join" ? "♧" : kind === "chat" ? "✉" : kind === "friend_request" ? "+" : kind === "episode" ? "◉" : "▶";

  return <div className="backdrop" onClick={onClose}><div className="modal notifications-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><div className="notification-heading"><div><p className="eyebrow">YOUR UPDATES</p><h2>Notifications</h2></div>{!loading && items.length > 0 && <button className="clear-notifications" type="button" onClick={() => void clearAll()} disabled={clearing}>{clearing ? "Clearing…" : "Clear all"}</button>}</div>{loading ? <p className="share-empty">Loading updates…</p> : items.length ? <div className="notification-list">{items.map(item => <article key={item.id}><i className={item.kind}>{icon(item.kind)}</i><div><b>{item.message}</b><small>{new Date(item.createdAt).toLocaleDateString()}</small></div></article>)}</div> : <p className="share-empty">You’re all caught up. New recommendations, group invites, and streaming alerts will appear here.</p>}</div></div>;
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
  const send = async () => {
    if (saving) return;
    if (!recipientId) { setMessage("Choose someone in your Circle first."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...title, recipientId, note }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(data.error ?? "Your recommendation could not be sent. Please try again."); setSaving(false); return; }
      const friend = friends.find(item => item.id === recipientId);
      setSaving(false);
      onSent(friend?.displayName ?? "your friend");
    } catch {
      setMessage("Your recommendation could not be sent. Check your connection and try again.");
      setSaving(false);
    }
  };
  return <div className="backdrop" onClick={onClose}><form className="modal share-modal" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void send(); }}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">SEND A RECOMMENDATION</p><h2>Send this pick.</h2><p className="share-shortcut">Choose a friend and send it right away, or add your own note.</p><div className="selected-title">{title.posterPath ? <img src={title.posterPath} alt="" /> : <span></span>}<b>{title.name}<small>{title.year ?? "—"} · {title.type === "tv" ? "TV series" : "Movie"}</small></b></div><label>SEND TO</label>{friends.length ? <div className="share-people">{friends.map(friend => <button type="button" key={friend.id} className={recipientId === friend.id ? "chosen" : ""} onClick={() => { setRecipientId(friend.id); setMessage(""); }}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.displayName?.slice(0, 1)}</span>}<b>{friend.displayName}</b></button>)}</div> : <p className="share-empty">{message}</p>}<label>ADD A NOTE <small>Optional</small></label><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Leave blank to send: “I thought you’d like this.”" maxLength={1000}/><button type="submit" className="primary wide" disabled={!recipientId || saving}>{saving ? "Sending…" : note.trim() ? "Send with note ✦" : "Send recommendation ✦"}</button>{message && friends.length > 0 && <small className="modal-message">{message}</small>}</form></div>;
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

function ProfileMobileTools({ isAdmin, onOpenStudio }: { isAdmin: boolean; onOpenStudio: () => void }) {
  return <section className="profile-mobile-tools panel"><div><p className="eyebrow">ACCOUNT</p><b>Account settings</b><small>Manage your sign-in and account details.</small></div><UserButton appearance={{ elements: { avatarBox: "profile-account-avatar" } }} />{isAdmin && <button className="secondary profile-studio-link" onClick={onOpenStudio}>Open Studio</button>}</section>;
}

function LandingPage() {
  return <div className="landing">
    <header className="landing-nav">
      <a className="landing-brand landing-brand-logo" href="#top" aria-label="CineApe home"><img src="/cineape-logo-dark.png" alt="CineApe"/></a>
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
type EditorReview = { id: string; slug: string; headline: string; body: string; score: number; seoTitle: string | null; seoDescription: string | null; status: "draft" | "published"; tmdbId: number; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; createdAt: string; publishedAt: string | null };
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

function StudioEditorialLegacy() {
  const [titleQuery, setTitleQuery] = useState(""); const [matches, setMatches] = useState<EditorialTitle[]>([]); const [selected, setSelected] = useState<EditorialTitle | null>(null);
  const [headline, setHeadline] = useState(""); const [body, setBody] = useState(""); const [score, setScore] = useState(8); const [seoTitle, setSeoTitle] = useState(""); const [seoDescription, setSeoDescription] = useState(""); const [status, setStatus] = useState<"draft" | "published">("draft");
  const [reviews, setReviews] = useState<EditorReview[]>([]); const [editingReview, setEditingReview] = useState<EditorReview | null>(null); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const loadReviews = () => void fetch("/api/admin/editor-reviews").then(response => response.ok ? response.json() as Promise<{ reviews?: EditorReview[] }> : null).then(data => setReviews(data?.reviews ?? [])).catch(() => setReviews([]));
  useEffect(() => { loadReviews(); }, []);
  const findTitle = async () => { if (titleQuery.trim().length < 2) { setMessage("Type at least two letters to find a movie or show."); return; } setMessage("Finding titles…"); const response = await fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(titleQuery.trim())}`); const data = response.ok ? await response.json() as { results?: EditorialTitle[] } : null; const found = (data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv"); setMatches(found); setMessage(found.length ? "Choose the title you are reviewing." : "No titles found."); };
  const resetEditor = () => { setEditingReview(null); setHeadline(""); setBody(""); setScore(8); setSeoTitle(""); setSeoDescription(""); setStatus("draft"); setSelected(null); setMatches([]); setTitleQuery(""); };
  const editReview = (review: EditorReview) => { setEditingReview(review); setSelected({ id: review.tmdbId, type: review.type, title: review.title, year: review.year ? String(review.year) : null, image: review.posterPath, subtitle: `${review.year ?? "—"} · ${review.type === "tv" ? "TV series" : "Movie"}` }); setHeadline(review.headline); setBody(review.body); setScore(review.score); setSeoTitle(review.seoTitle ?? ""); setSeoDescription(review.seoDescription ?? ""); setStatus(review.status); setMatches([]); setTitleQuery(""); setMessage(`Editing ${review.title}.`); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || saving) { setMessage("Choose a movie or show first."); return; } setSaving(true); setMessage(""); const response = await fetch("/api/admin/editor-reviews", { method: editingReview ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingReview ? { id: editingReview.id, headline, body, score, seoTitle, seoDescription, status } : { tmdbId: selected.id, type: selected.type, name: selected.title, year: selected.year ? Number(selected.year) : null, posterPath: selected.image, headline, body, score, seoTitle, seoDescription, status }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Review could not be saved."); setSaving(false); return; } setMessage(editingReview ? (status === "published" ? "Live review updated." : "Review moved back to drafts.") : (status === "published" ? "Official review published." : "Draft saved in Studio.")); resetEditor(); setSaving(false); loadReviews(); };
  return <section className="studio-editorial"><div className="studio-section-head"><div><p className="eyebrow">EDITORIAL DESK</p><h2>Official CineApe reviews</h2><p>Create a site review, choose whether it stays a draft or goes live, and supply its search preview.</p></div></div><div className="studio-editor-grid"><form className="panel editorial-form" onSubmit={submit}><label>FIND A TITLE<div className="editor-title-search"><input value={titleQuery} onChange={event => setTitleQuery(event.target.value)} placeholder="Search movie or TV show" /><button type="button" className="secondary" onClick={() => void findTitle()}>Find</button></div></label>{matches.length > 0 && <div className="editor-matches">{matches.map(match => <button type="button" className={selected?.id === match.id && selected.type === match.type ? "chosen" : ""} key={`${match.type}-${match.id}`} onClick={() => { setSelected(match); setMatches([]); setMessage(""); }}>{match.image ? <img src={match.image} alt="" /> : <span>◉</span>}<div><b>{match.title}</b><small>{match.subtitle}</small></div></button>)}</div>}{selected && <div className="editor-selected">{selected.image && <img src={selected.image} alt="" />}<b>{selected.title}<small>{selected.subtitle}</small></b><button type="button" onClick={() => setSelected(null)}>×</button></div>}<label>REVIEW HEADLINE<input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={180} placeholder="The short, memorable verdict" /></label><label>CINEAPE SCORE <span>{score}/10</span><input type="range" min="1" max="10" value={score} onChange={event => setScore(Number(event.target.value))} /></label><label>REVIEW<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={12000} placeholder="Write the official CineApe take. Keep it useful and spoiler-safe." /></label><fieldset><legend>SEARCH PREVIEW <small>Optional, but recommended</small></legend><label>SEO TITLE<input value={seoTitle} onChange={event => setSeoTitle(event.target.value)} maxLength={70} placeholder="e.g. The Bear review: worth watching?" /></label><label>META DESCRIPTION<textarea value={seoDescription} onChange={event => setSeoDescription(event.target.value)} maxLength={170} placeholder="A clear 1–2 sentence search description." /></label></fieldset><label>PUBLISHING STATUS<select value={status} onChange={event => setStatus(event.target.value as "draft" | "published")}><option value="draft">Save as draft</option><option value="published">Publish now</option></select></label><button className="primary wide" disabled={saving}>{saving ? "Saving…" : status === "published" ? "Publish official review" : "Save draft"}</button>{message && <p className="editor-message">{message}</p>}</form><div className="studio-review-list"><div className="studio-review-list-head"><h3>Your reviews</h3><a href="/reviews" target="_blank" rel="noreferrer">Open public hub ↗</a></div>{reviews.length ? reviews.map(review => <article className="panel" key={review.id}>{review.posterPath ? <img src={review.posterPath} alt="" /> : <span>★</span>}<div><b>{review.title}</b><small>{review.headline}</small><em>{review.status === "published" ? "Published" : "Draft"} · {review.score}/10</em>{review.status === "published" && <a className="studio-live-link" href={`/reviews/${review.slug}`} target="_blank" rel="noreferrer">View live review ↗</a>}</div></article>) : <div className="panel studio-empty">Your official CineApe reviews will appear here.</div>}</div></div></section>;
}

function StudioEditorial() {
  const [titleQuery, setTitleQuery] = useState("");
  const [matches, setMatches] = useState<EditorialTitle[]>([]);
  const [selected, setSelected] = useState<EditorialTitle | null>(null);
  const [editing, setEditing] = useState<EditorReview | null>(null);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [score, setScore] = useState(8);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [reviews, setReviews] = useState<EditorReview[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const loadReviews = () => void fetch("/api/admin/editor-reviews").then(response => response.ok ? response.json() as Promise<{ reviews?: EditorReview[] }> : null).then(data => setReviews(data?.reviews ?? [])).catch(() => setReviews([]));
  useEffect(() => { loadReviews(); }, []);
  const clearEditor = () => { setEditing(null); setSelected(null); setTitleQuery(""); setMatches([]); setHeadline(""); setBody(""); setScore(8); setSeoTitle(""); setSeoDescription(""); setStatus("draft"); setMessage(""); };
  const chooseReview = (review: EditorReview) => { setEditing(review); setSelected({ id: review.tmdbId, type: review.type, title: review.title, year: review.year ? String(review.year) : null, image: review.posterPath, subtitle: `${review.year ?? "—"} · ${review.type === "tv" ? "TV series" : "Movie"}` }); setHeadline(review.headline); setBody(review.body); setScore(review.score); setSeoTitle(review.seoTitle ?? ""); setSeoDescription(review.seoDescription ?? ""); setStatus(review.status); setTitleQuery(""); setMatches([]); setMessage(`Editing ${review.title}.`); };
  const findTitle = async () => { if (titleQuery.trim().length < 2) { setMessage("Type at least two letters to find a movie or show."); return; } const response = await fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(titleQuery.trim())}`); const data = response.ok ? await response.json() as { results?: EditorialTitle[] } : null; setMatches((data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv")); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || saving) { setMessage("Choose a title first."); return; } setSaving(true); setMessage(""); const payload = editing ? { id: editing.id, headline, body, score, seoTitle, seoDescription, status } : { tmdbId: selected.id, type: selected.type, name: selected.title, year: selected.year ? Number(selected.year) : null, posterPath: selected.image, headline, body, score, seoTitle, seoDescription, status }; const response = await fetch("/api/admin/editor-reviews", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Review could not be saved."); setSaving(false); return; } const wasEditing = Boolean(editing); clearEditor(); setMessage(wasEditing ? "Review updated." : status === "published" ? "Official review published." : "Draft saved in Studio."); setSaving(false); loadReviews(); };
  return <section className="studio-editorial"><div className="studio-section-head"><div><p className="eyebrow">EDITORIAL DESK</p><h2>Official CineApe reviews</h2><p>Publish reviews, then return any time to edit the copy, score, SEO, or status.</p></div></div><div className="studio-editor-grid"><form className="panel editorial-form" onSubmit={submit}>{editing && <div className="editor-editing"><b>Editing: {editing.title}</b><button type="button" onClick={clearEditor}>New review</button></div>}<label>FIND A TITLE<div className="editor-title-search"><input value={titleQuery} onChange={event => setTitleQuery(event.target.value)} placeholder="Search movie or TV show" disabled={Boolean(editing)} /><button type="button" className="secondary" onClick={() => void findTitle()} disabled={Boolean(editing)}>Find</button></div></label>{matches.length > 0 && <div className="editor-matches">{matches.map(match => <button type="button" key={`${match.type}-${match.id}`} onClick={() => { setSelected(match); setMatches([]); }}><div><b>{match.title}</b><small>{match.subtitle}</small></div></button>)}</div>}{selected && <div className="editor-selected">{selected.image && <img src={selected.image} alt=""/>}<b>{selected.title}<small>{selected.subtitle}</small></b>{!editing && <button type="button" onClick={() => setSelected(null)}>×</button>}</div>}<label>REVIEW HEADLINE<input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={180}/></label><label>CINEAPE SCORE <span>{score}/10</span><input type="range" min="1" max="10" value={score} onChange={event => setScore(Number(event.target.value))}/></label><label>REVIEW<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={12000} placeholder="Write the official CineApe take. Keep it useful and spoiler-safe."/></label><fieldset><legend>SEARCH PREVIEW <small>Optional, but recommended</small></legend><label>SEO TITLE<input value={seoTitle} onChange={event => setSeoTitle(event.target.value)} maxLength={70}/></label><label>META DESCRIPTION<textarea value={seoDescription} onChange={event => setSeoDescription(event.target.value)} maxLength={170}/></label></fieldset><label>PUBLISHING STATUS<select value={status} onChange={event => setStatus(event.target.value as "draft" | "published")}><option value="draft">Save as draft</option><option value="published">Publish now</option></select></label><button className="primary wide" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : status === "published" ? "Publish official review" : "Save draft"}</button>{message && <p className="editor-message">{message}</p>}</form><div className="studio-review-list"><div className="studio-review-list-head"><h3>Your reviews</h3><a href="/reviews" target="_blank" rel="noreferrer">Open public hub ↗</a></div>{reviews.length ? reviews.map(review => <article className="panel" key={review.id}>{review.posterPath ? <img src={review.posterPath} alt=""/> : <span>★</span>}<div><b>{review.title}</b><small>{review.headline}</small><em>{review.status === "published" ? "Published" : "Draft"} · {review.score}/10</em>{review.status === "published" && <a className="studio-live-link" href={`/reviews/${review.slug}`} target="_blank" rel="noreferrer">View live review ↗</a>}<button type="button" className="studio-edit-review" onClick={() => chooseReview(review)}>Edit review</button></div></article>) : <div className="panel studio-empty">Your official CineApe reviews will appear here.</div>}</div></div></section>;
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

type MemberProfile = { displayName: string; username: string | null; avatarUrl: string | null; bio: string | null; friendListVisible: boolean };

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
  const [friendListVisible, setFriendListVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const load = async () => { await fetch("/api/account", { method: "POST" }); const response = await fetch("/api/account"); if (!response.ok) return; const data = await response.json() as { profile: MemberProfile; stats: { friends: number; ratings: number; sent: number } }; setProfile(data.profile); setStats(data.stats); setDisplayName(data.profile.displayName); setBio(data.profile.bio ?? ""); setFriendListVisible(data.profile.friendListVisible ?? true); };
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setMessage("Saving…"); const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, bio, friendListVisible }) }); const data = await response.json() as { profile?: MemberProfile; error?: string }; if (!response.ok || !data.profile) { setMessage(data.error ?? "Unable to save your profile."); return; } setProfile(data.profile); setEditing(false); setMessage("Profile saved."); };
  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !user) return; if (!file.type.startsWith("image/")) { setMessage("Choose an image file."); return; } if (file.size > 5 * 1024 * 1024) { setMessage("Choose an image smaller than 5 MB."); return; } setUploading(true); setMessage("Updating your picture…"); try { await user.setProfileImage({ file }); await user.reload(); await load(); setMessage("Profile picture updated."); } catch { setMessage("Your picture could not be updated. Please try a different image."); } finally { setUploading(false); event.target.value = ""; } };
  if (!profile) return <section className="page"><div className="panel title-loading">Setting up your profile…</div></section>;
  const initials = profile.displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="page member-profile"><div className="panel member-profile-head"><div className="profile-photo"><Avatar imageUrl={profile.avatarUrl ?? user?.imageUrl}>{initials}</Avatar>{editing && <label className="photo-change"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void choosePhoto(event)} disabled={uploading}/>{uploading ? "Uploading…" : "Change photo"}</label>}</div><div><p className="eyebrow">YOUR CINEAPE PROFILE</p><h1>{profile.displayName}</h1>{profile.username && <small className="profile-username">@{profile.username}</small>}<p>{profile.bio || "Add a short bio so your circle knows what you love to watch."}</p></div><button className="secondary" onClick={() => { setEditing(value => !value); setMessage(""); }}>{editing ? "Cancel" : "Edit profile"}</button></div>{editing && <form className="panel profile-editor" onSubmit={save}><label>DISPLAY NAME<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} placeholder="What should your Circle call you?"/></label><label>ABOUT YOU <small>Optional · 280 characters</small><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={280} placeholder="Tell your Circle what you like to watch…"/></label><label className="profile-privacy"><input type="checkbox" checked={friendListVisible} onChange={event => setFriendListVisible(event.target.checked)}/><span><b>Let friends view my friends</b><small>Friends can discover people you know from your profile.</small></span></label><div><button className="primary" type="submit">Save profile</button>{message && <span>{message}</span>}</div></form>}{!editing && message && <p className="profile-save-message">{message}</p>}<div className="profile-stats member-stats"><b>{stats.ratings}<span>Ratings</span></b><b>{stats.friends}<span>Friends</span></b><b>{stats.sent}<span>Recommendations sent</span></b></div><div className="profile-grid member-profile-grid"><article className="panel profile-next"><p className="eyebrow">MAKE IT YOURS</p><h2>Build your taste profile</h2><p>Your profile learns from the movies and shows you rate. Your favorite genres will appear here as your history grows.</p></article><article className="panel profile-next"><p className="eyebrow">YOUR CIRCLE</p><h2>Start with people you trust</h2><p>Invite family and friends to compare ratings and trade recommendations that actually fit.</p></article></div></section>;
}

type DiscoverTitle = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; score: string };

function DiscoverPageLegacy({ onOpen }: { onOpen: (title?: string, meta?: string, score?: string) => void }) {
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

function DiscoverPageWithPaginationLegacy({ onOpen }: { onOpen: (title?: string, meta?: string, score?: string) => void }) {
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all"); const [category, setCategory] = useState("all"); const [titles, setTitles] = useState<DiscoverTitle[]>([]); const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [hasMore, setHasMore] = useState(true); const [nextPage, setNextPage] = useState(2); const sentinel = useRef<HTMLDivElement | null>(null);
  const country = () => navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US";
  const fetchTitles = async (page: number) => { const response = await fetch(`/api/tmdb?mode=discover&type=${filter}&category=${category}&country=${country()}&page=${page}`); return response.ok ? await response.json() as { titles?: DiscoverTitle[]; hasMore?: boolean } : { titles: [], hasMore: false }; };
  useEffect(() => { let active = true; setLoading(true); setTitles([]); setHasMore(true); setNextPage(2); void fetchTitles(1).then(data => { if (!active) return; setTitles(data.titles ?? []); setHasMore(Boolean(data.hasMore)); }).catch(() => { if (active) { setTitles([]); setHasMore(false); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [filter, category]);
  const loadMore = async () => { if (loading || loadingMore || !hasMore) return; setLoadingMore(true); try { const data = await fetchTitles(nextPage); const more = data.titles ?? []; setTitles(current => { const existing = new Set(current.map(title => `${title.type}-${title.id}`)); return [...current, ...more.filter(title => !existing.has(`${title.type}-${title.id}`))]; }); setHasMore(Boolean(data.hasMore) && more.length > 0); setNextPage(current => current + 1); } catch { setHasMore(false); } finally { setLoadingMore(false); } };
  useEffect(() => { const node = sentinel.current; if (!node || !hasMore || loading) return; const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "420px" }); observer.observe(node); return () => observer.disconnect(); }, [hasMore, loading, loadingMore, nextPage, titles.length]);
  const filters = [{ key: "all", label: "Popular now" }, { key: "movie", label: "Movies" }, { key: "tv", label: "TV shows" }] as const;
  const categories = filter === "movie" ? [{ key: "all", label: "All movies" }, { key: "new", label: "New releases" }, { key: "drama", label: "Drama" }, { key: "thriller", label: "Thriller" }, { key: "comedy", label: "Comedy" }, { key: "animation", label: "Animation" }, { key: "horror", label: "Horror" }, { key: "scifi", label: "Sci-fi" }, { key: "family", label: "Family" }] : [{ key: "all", label: "All shows" }, { key: "new", label: "New releases" }, { key: "drama", label: "Drama" }, { key: "thriller", label: "Mystery & thriller" }, { key: "comedy", label: "Comedy" }, { key: "animation", label: "Animation" }, { key: "horror", label: "Horror & fantasy" }, { key: "crime", label: "Crime" }, { key: "reality", label: "Reality" }];
  const subtitle = filter === "all" ? "Popular English-language movies and shows for your region." : filter === "movie" ? "Popular English-language movies to save for your next night in." : "Popular English-language series ready for your next binge.";
  return <section className="page live-discover"><Intro label="DISCOVER" title="Find your next obsession." text={subtitle} action={null}/><div className="tabs discover-tabs">{filters.map(item => <button key={item.key} className={filter === item.key ? "chosen" : ""} onClick={() => { setFilter(item.key); setCategory("all"); }}>{item.label}</button>)}</div>{filter !== "all" && <div className="genre-chips" aria-label={`${filter === "movie" ? "Movie" : "TV show"} categories`}>{categories.map(item => <button key={item.key} className={category === item.key ? "chosen" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>}{loading ? <div className="panel discover-loading">Finding great titles…</div> : titles.length ? <><div className="discover-grid live-discover-grid">{titles.map((title, index) => <article className="media-card" key={`${title.type}-${title.id}`}><button className={`cover ${["a", "b", "c", "d", "e"][index % 5]}`} onClick={() => onOpen(title.title, `${title.year ?? "—"} · ${title.type === "tv" ? "TV series" : "Movie"}`, title.score)}>{title.image && <img src={title.image} alt={`${title.title} poster`} />}<span className="cover-type">{title.type === "tv" ? "TV" : "Movie"}</span><span className="cover-score">★ {title.score}</span><span className="cover-title"><small>{title.year ?? "New release"}</small>{title.title}</span></button><strong>{title.title}</strong><span>{title.type === "tv" ? "TV series" : "Movie"} · TMDB {title.score}</span></article>)}</div><div className="discover-more" ref={sentinel}>{loadingMore ? "Loading more great picks…" : hasMore ? "Keep scrolling for more" : "You’ve reached the end for now."}</div>{hasMore && !loadingMore && <button className="secondary discover-more-button" onClick={() => void loadMore()}>Load more</button>}</> : <div className="panel discover-empty"><b>Live titles are not available just now.</b><p>Try using the search at the top to find a movie, show, actor, or actress.</p></div>}</section>;
}

type DiscoverResume = { filter: "all" | "movie" | "tv"; category: string; titles: DiscoverTitle[]; nextPage: number; hasMore: boolean; scrollY: number };

function DiscoverPage({ onOpen, resume, onSnapshot }: { onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void; resume: DiscoverResume | null; onSnapshot: (snapshot: DiscoverResume) => void }) {
  const [filter, setFilter] = useState<"all" | "movie" | "tv">(() => resume?.filter ?? "all");
  const [category, setCategory] = useState(() => resume?.category ?? "all");
  const [titles, setTitles] = useState<DiscoverTitle[]>(() => resume?.titles ?? []);
  const [loading, setLoading] = useState(() => !resume?.titles.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => resume?.hasMore ?? true);
  const [nextPage, setNextPage] = useState(() => resume?.nextPage ?? 2);
  const [restoring, setRestoring] = useState(() => Boolean(resume?.titles.length));
  const sentinel = useRef<HTMLDivElement | null>(null);
  const country = () => navigator.language.split("-")[1]?.toUpperCase() === "CA" ? "CA" : "US";
  const fetchTitles = async (page: number) => { const response = await fetch(`/api/tmdb?mode=discover&type=${filter}&category=${category}&country=${country()}&page=${page}`); return response.ok ? await response.json() as { titles?: DiscoverTitle[]; hasMore?: boolean } : { titles: [], hasMore: false }; };
  useEffect(() => {
    if (restoring) {
      const frame = window.requestAnimationFrame(() => window.scrollTo(0, resume?.scrollY ?? 0));
      setRestoring(false);
      return () => window.cancelAnimationFrame(frame);
    }
    let active = true;
    setLoading(true); setTitles([]); setHasMore(true); setNextPage(2); window.scrollTo(0, 0);
    void fetchTitles(1).then(data => { if (active) { setTitles(data.titles ?? []); setHasMore(Boolean(data.hasMore)); } }).catch(() => { if (active) { setTitles([]); setHasMore(false); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, category]);
  const loadMore = async () => { if (loading || loadingMore || !hasMore) return; setLoadingMore(true); try { const data = await fetchTitles(nextPage); const more = data.titles ?? []; setTitles(current => { const existing = new Set(current.map(title => `${title.type}-${title.id}`)); return [...current, ...more.filter(title => !existing.has(`${title.type}-${title.id}`))]; }); setHasMore(Boolean(data.hasMore) && more.length > 0); setNextPage(current => current + 1); } catch { setHasMore(false); } finally { setLoadingMore(false); } };
  useEffect(() => { const node = sentinel.current; if (!node || !hasMore || loading) return; const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "420px" }); observer.observe(node); return () => observer.disconnect(); }, [hasMore, loading, loadingMore, nextPage, titles.length]);
  const rememberAndOpen = (title: DiscoverTitle) => { onSnapshot({ filter, category, titles, nextPage, hasMore, scrollY: window.scrollY }); onOpen(title.title, `${title.year ?? "—"} · ${title.type === "tv" ? "TV series" : "Movie"}`, title.score, title.id, title.type); };
  const filters = [{ key: "all", label: "Popular now" }, { key: "movie", label: "Movies" }, { key: "tv", label: "TV shows" }] as const;
  const categories = filter === "movie" ? [
    { key: "all", label: "All movies" }, { key: "new", label: "New releases" }, { key: "past6months", label: "Past 6 months" }, { key: "pastyear", label: "Past year" }, { key: "upcoming", label: "Coming soon" },
    { key: "action", label: "Action" }, { key: "adventure", label: "Adventure" }, { key: "comedy", label: "Comedy" }, { key: "drama", label: "Drama" }, { key: "thriller", label: "Thriller" }, { key: "crime", label: "Crime" },
    { key: "horror", label: "Horror" }, { key: "scifi", label: "Sci-fi" }, { key: "fantasy", label: "Fantasy" }, { key: "romance", label: "Romance" }, { key: "animation", label: "Animation" }, { key: "family", label: "Family" }, { key: "documentary", label: "Documentary" },
  ] : [
    { key: "all", label: "All shows" }, { key: "new", label: "New releases" }, { key: "upcoming", label: "Coming soon" },
    { key: "drama", label: "Drama" }, { key: "comedy", label: "Comedy" }, { key: "crime", label: "Crime" }, { key: "thriller", label: "Mystery & thriller" }, { key: "action", label: "Action & adventure" },
    { key: "scifi", label: "Sci-fi & fantasy" }, { key: "animation", label: "Animation" }, { key: "documentary", label: "Documentary" }, { key: "kids", label: "Kids & family" }, { key: "reality", label: "Reality TV" },
  ];
  const subtitle = category === "upcoming" ? `Upcoming ${filter === "tv" ? "series" : "movies"} ordered by their nearest release date.` : category === "past6months" ? "Movies released in the past six months, newest first." : category === "pastyear" ? "Movies released in the past year, newest first." : category === "new" ? `Recently released ${filter === "tv" ? "series" : "movies"} you can look for now.` : category === "reality" ? "Reality TV only, kept separate from scripted series." : filter === "all" ? "Popular English-language movies and scripted series for your region." : filter === "movie" ? "Popular English-language movies to save for your next night in." : "Popular scripted series ready for your next binge.";
  return <section className="page live-discover"><Intro label="DISCOVER" title="Find your next obsession." text={subtitle} action={null}/><div className="tabs discover-tabs">{filters.map(item => <button key={item.key} className={filter === item.key ? "chosen" : ""} onClick={() => { setFilter(item.key); setCategory("all"); }}>{item.label}</button>)}</div>{filter !== "all" && <div className="genre-chips" aria-label={`${filter === "movie" ? "Movie" : "TV show"} categories`}>{categories.map(item => <button key={item.key} className={category === item.key ? "chosen" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>}{loading ? <div className="panel discover-loading">Finding great titles…</div> : titles.length ? <><div className="discover-grid live-discover-grid">{titles.map((title, index) => <article className="media-card" key={`${title.type}-${title.id}`}><button className={`cover ${["a", "b", "c", "d", "e"][index % 5]}`} onClick={() => rememberAndOpen(title)}>{title.image && <img src={title.image} alt={`${title.title} poster`} />}<span className="cover-type">{title.type === "tv" ? "TV" : "Movie"}</span><span className="cover-score">★ {title.score}</span><span className="cover-title"><small>{title.year ?? "New release"}</small>{title.title}</span></button><strong>{title.title}</strong><span>{title.type === "tv" ? "TV series" : "Movie"} · TMDB {title.score}</span></article>)}</div><div className="discover-more" ref={sentinel}>{loadingMore ? "Loading more great picks…" : hasMore ? "Keep scrolling for more" : "You’ve reached the end for now."}</div>{hasMore && !loadingMore && <button className="secondary discover-more-button" onClick={() => void loadMore()}>Load more</button>}</> : <div className="panel discover-empty"><b>Live titles are not available just now.</b><p>Try using the search at the top to find a movie, show, actor, or actress.</p></div>}</section>;
}

type CircleFriend = { id: string; displayName: string; avatarUrl: string | null; bio: string | null; unreadMessages?: boolean };
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
  profile: { id: string; displayName: string; username: string | null; avatarUrl: string | null; bio: string | null; friendListVisible: boolean; createdAt: string };
  connectionLevel: "friend" | "mutual";
  friendsVisible: boolean;
  friends: Array<{ id: string; displayName: string; username: string | null; avatarUrl: string | null; bio: string | null; mutualCount: number; relationship: "friend" | "none" }>;
  stats: { ratings: number; sent: number; received: number };
  recentRatings: Array<{ title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; score: number; review: string | null; updatedAt: string }>;
  completed: Array<{ title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null }>;
  currentlyWatching: Array<{ title: string; year: number | null; posterPath: string | null; currentSeason: number | null; currentEpisode: number | null }>;
};

function CirclePageBase({ onInvite }: { onInvite: () => void }) {
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

type MovieNightChoice = { id: string; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; votes: number; voters: Array<{ id: string; displayName: string; avatarUrl: string | null }>; selected: boolean };
type MovieNightPoll = { id: string; question: string; status: "open" | "closed"; creator: string; totalVotes: number; options: MovieNightChoice[] };

function CompactPeopleFinder() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [suggestions, setSuggestions] = useState<PersonCard[]>([]);
  const [requests, setRequests] = useState<Array<{ id: string; person?: PersonCard }>>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CircleFriend | null>(null);

  const load = async (value = query) => {
    setLoading(true);
    const response = await fetch(`/api/people${value.trim().length >= 2 ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
    const data = response.ok ? await response.json() as { people?: PersonCard[]; suggestions?: PersonCard[]; requests?: Array<{ id: string; person?: PersonCard }> } : null;
    setPeople(data?.people ?? []); setSuggestions(data?.suggestions ?? []); setRequests(data?.requests ?? []); setLoading(false);
  };
  useEffect(() => { void load(""); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (query.trim().length >= 2) void load(query); else setPeople([]); }, 240); return () => window.clearTimeout(timer); }, [query]);
  const send = async (person: PersonCard) => { const response = await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendId: person.id }) }); const data = await response.json() as { error?: string }; setMessage(response.ok ? `Friend request sent to ${person.displayName}.` : data.error ?? "Friend request could not be sent."); if (response.ok) await load(query); };
  const respond = async (requestId: string, action: "accept" | "decline") => { const response = await fetch("/api/people", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) }); const data = await response.json() as { error?: string }; setMessage(response.ok ? (action === "accept" ? "Friend request accepted." : "Friend request declined.") : data.error ?? "Unable to update this request."); await load(query); };
  const open = (person: PersonCard) => setSelected({ id: person.id, displayName: person.displayName, avatarUrl: person.avatarUrl, bio: person.bio });
  const personCard = (person: PersonCard) => <article className="compact-person" key={person.id}><button onClick={() => open(person)}><Avatar imageUrl={person.avatarUrl}>{person.displayName.slice(0, 2).toUpperCase()}</Avatar><span><b>{person.displayName}</b><small>{person.username ? `@${person.username}` : "CineApe member"}{person.mutualCount ? ` · ${person.mutualCount} mutual` : ""}</small></span></button>{person.relationship === "incoming" ? <button className="small-primary" onClick={() => void respond(person.requestId!, "accept")}>Accept</button> : person.relationship === "outgoing" ? <em>Requested</em> : person.relationship === "friend" ? <em>Friends</em> : <button className="small-primary" onClick={() => void send(person)}>Add</button>}</article>;

  return <section className="compact-people panel"><div className="compact-people-head"><div><p className="eyebrow">YOUR CIRCLE</p><h2>Find your people</h2></div><span>Search a username or email</span></div><label className="compact-people-search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="@username or email address" aria-label="Find a CineApe member by username or email"/></label>{query.trim().length >= 2 && <div className="compact-people-results">{loading ? <p>Searching CineApe…</p> : people.length ? people.map(personCard) : <p>No matching CineApe members found.</p>}</div>}{requests.length > 0 && <div className="compact-people-section"><b>Friend requests · {requests.length}</b><div>{requests.filter(request => request.person).map(request => <article className="compact-person" key={request.id}><button onClick={() => open(request.person!)}><Avatar imageUrl={request.person!.avatarUrl}>{request.person!.displayName.slice(0, 2).toUpperCase()}</Avatar><span><b>{request.person!.displayName}</b><small>{request.person!.username ? `@${request.person!.username}` : "CineApe member"}</small></span></button><button className="small-primary" onClick={() => void respond(request.id, "accept")}>Accept</button><button className="small-ghost" onClick={() => void respond(request.id, "decline")}>Decline</button></article>)}</div></div>}{suggestions.length > 0 && <div className="compact-people-section"><b>People you may know</b><div>{suggestions.map(personCard)}</div></div>}{message && <small className="compact-people-message">{message}</small>}{selected && <FriendProfileModal friend={selected} onClose={() => setSelected(null)}/>}</section>;
}

function ProfileChatBox({ friend, onRead }: { friend: CircleFriend; onRead: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => { const response = await fetch(`/api/chat?friendId=${encodeURIComponent(friend.id)}`); const data = response.ok ? await response.json() as { viewerId?: string; messages?: ChatMessage[] } : null; if (data) { setViewerId(data.viewerId ?? ""); setMessages(data.messages ?? []); onRead(); } setLoading(false); };
  useEffect(() => { setLoading(true); void load(); const interval = window.setInterval(() => void load(), 12000); return () => window.clearInterval(interval); }, [friend.id]);
  const send = async (event: React.FormEvent) => { event.preventDefault(); if (!draft.trim() || sending) return; setSending(true); setNotice(""); const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendId: friend.id, body: draft }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setNotice(data.error ?? "Message could not be sent."); setSending(false); return; } setDraft(""); setSending(false); await load(); };
  return <section className="profile-chat"><h3>Message {friend.displayName}</h3><div className="profile-chat-messages">{loading ? <p>Loading conversation…</p> : messages.length ? messages.map(message => <article key={message.id} className={message.sender.id === viewerId ? "mine" : ""}><b>{message.sender.id === viewerId ? "You" : message.sender.displayName}</b>{message.body && <p>{message.body}</p>}{message.title && <small>Shared: {message.title.name}</small>}</article>) : <p>Say hello and start your CineApe conversation.</p>}</div><form onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${friend.displayName}`} maxLength={2000}/><button className="primary" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></form>{notice && <small className="modal-message">{notice}</small>}</section>;
}

function FriendChatProfileModalLegacy({ friend, onClose, onRead }: { friend: CircleFriend; onClose: () => void; onRead: () => void }) {
  const [data, setData] = useState<FriendProfileData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void fetch(`/api/friends/${friend.id}`).then(response => response.ok ? response.json() as Promise<FriendProfileData> : Promise.reject(new Error("Profile unavailable."))).then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Profile unavailable."); }); return () => { active = false; }; }, [friend.id]);
  const initials = friend.displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="backdrop" onClick={onClose}><div className="modal friend-profile-modal chat-profile-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>{error && <p className="share-empty">{error}</p>}{!data && !error && <p className="share-empty">Loading {friend.displayName}'s profile…</p>}{data && <><div className="friend-profile-heading"><Avatar imageUrl={data.profile.avatarUrl}>{initials}</Avatar><div><p className="eyebrow">IN YOUR CINEAPE CIRCLE</p><h2>{data.profile.displayName}</h2><p>{data.profile.bio || "Watching, rating, and sharing great picks."}</p></div></div><div className="friend-profile-stats"><b>{data.stats.ratings}<span>Ratings</span></b><b>{data.stats.sent}<span>Sent</span></b><b>{data.stats.received}<span>Received</span></b></div><ProfileChatBox friend={friend} onRead={onRead}/></>}</div></div>;
}

function FriendChatProfileModal({ friend, onClose, onRead }: { friend: CircleFriend; onClose: () => void; onRead: () => void }) {
  const [data, setData] = useState<FriendProfileData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/friends/${friend.id}`)
      .then(response => response.ok ? response.json() as Promise<FriendProfileData> : response.json().then((value: { error?: string }) => Promise.reject(new Error(value.error ?? "Profile unavailable."))))
      .then(value => { if (active) setData(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Profile unavailable."); });
    return () => { active = false; };
  }, [friend.id]);

  const initials = friend.displayName.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="backdrop" onClick={onClose}><div className="modal friend-profile-modal chat-profile-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>
    {error && <p className="share-empty">{error}</p>}
    {!data && !error && <p className="share-empty">Loading {friend.displayName}'s profile…</p>}
    {data && <><div className="friend-profile-heading"><Avatar imageUrl={data.profile.avatarUrl}>{initials}</Avatar><div><p className="eyebrow">IN YOUR CINEAPE CIRCLE</p><h2>{data.profile.displayName}</h2><p>{data.profile.bio || "Watching, rating, and sharing great picks."}</p></div></div><div className="friend-profile-stats"><b>{data.stats.ratings}<span>Ratings</span></b><b>{data.stats.sent}<span>Sent</span></b><b>{data.stats.received}<span>Received</span></b></div>
      <section className="friend-watching"><h3>Currently watching</h3>{data.currentlyWatching.length ? <div>{data.currentlyWatching.map(item => <article key={item.title}>{item.posterPath ? <img src={item.posterPath} alt=""/> : <span>TV</span>}<div><b>{item.title}</b><small>{item.currentSeason && item.currentEpisode ? `Up to Season ${item.currentSeason}, Episode ${item.currentEpisode}` : "Watching now"}</small></div></article>)}</div> : <p className="profile-empty">No TV shows marked as watching yet.</p>}</section>
      <ProfileChatBox friend={friend} onRead={onRead}/>
    </>}</div></div>;
}

function CompactCirclePage({ onInvite }: { onInvite: () => void }) {
  const [friends, setFriends] = useState<CircleFriend[]>([]);
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CircleFriend | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [invitingGroup, setInvitingGroup] = useState<CircleGroup | null>(null);
  const load = () => { setLoading(true); void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ friends?: CircleFriend[]; groups?: CircleGroup[] }> : null).then(data => { setFriends(data?.friends ?? []); setGroups(data?.groups ?? []); }).finally(() => setLoading(false)); };
  useEffect(load, []);
  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    setGroupMessage("Creating your group…");
    try {
      const response = await fetch("/api/circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json() as { group?: CircleGroup; error?: string };
      if (!response.ok || !data.group) { setGroupMessage(data.error ?? "Your group could not be created."); return; }
      setGroups(current => [data.group!, ...current]);
      setGroupName("");
      setCreating(false);
      setGroupMessage("");
    } catch {
      setGroupMessage("Your group could not be created. Please try again.");
    }
  };
  const markRead = (id: string) => setFriends(current => current.map(friend => friend.id === id ? { ...friend, unreadMessages: false } : friend));
  return <section className="compact-circle"><section className="circle-section"><div className="section-title"><div><h2>Your friends <span>{friends.length ? `· ${friends.length}` : ""}</span></h2><p>Tap a friend to view their profile or send a message.</p></div><button onClick={onInvite}>Invite people</button></div>{loading ? <div className="panel circle-loading">Loading your circle…</div> : friends.length ? <div className="panel circle-friends compact-friends">{friends.map(friend => <button className={`friend-profile-link ${friend.unreadMessages ? "has-unread" : ""}`} key={friend.id} onClick={() => setSelected(friend)}><Avatar imageUrl={friend.avatarUrl}>{initials(friend.displayName)}</Avatar><b>{friend.displayName}</b></button>)}</div> : <div className="panel circle-empty"><div><b>Your circle starts with your people.</b><p>Invite family and friends to swap recommendations and compare reviews.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}</section><section className="circle-section"><div className="section-title"><div><h2>Your groups <span>{groups.length ? `· ${groups.length}` : ""}</span></h2><p>Private spaces for movie nights, families, and favorite shows.</p></div></div>{groups.length ? <div className="group-grid live-group-grid">{groups.map((group, index) => <article className={`panel group live-group tone-${index % 3}`} key={group.id}><i>{index % 3 === 0 ? "✦" : index % 3 === 1 ? "⌂" : "◉"}</i><h3>{group.name}</h3><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.pickCount} shared {group.pickCount === 1 ? "pick" : "picks"}</p></article>)}</div> : <div className="panel circle-empty"><div><b>Create a home for your next watch.</b><p>Start a private group for your family, friend group, or recurring movie night.</p></div></div>}</section>{selected && <FriendChatProfileModal friend={selected} onClose={() => setSelected(null)} onRead={() => markRead(selected.id)}/>}</section>;
}

function CompactCirclePageV2({ onInvite, onOpen }: { onInvite: () => void; onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void }) {
  const [friends, setFriends] = useState<CircleFriend[]>([]);
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CircleFriend | null>(null);
  const [invitingGroup, setInvitingGroup] = useState<CircleGroup | null>(null);
  const [openGroup, setOpenGroup] = useState<CircleGroup | null>(null);

  const load = () => {
    setLoading(true);
    void fetch("/api/circle")
      .then(response => response.ok ? response.json() as Promise<{ friends?: CircleFriend[]; groups?: CircleGroup[] }> : null)
      .then(data => { setFriends(data?.friends ?? []); setGroups(data?.groups ?? []); })
      .catch(() => { setFriends([]); setGroups([]); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    setMessage("Creating your group...");
    try {
      const response = await fetch("/api/circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json() as { group?: CircleGroup; error?: string };
      if (!response.ok || !data.group) { setMessage(data.error ?? "Your group could not be created."); return; }
      setGroups(current => [data.group!, ...current]);
      setGroupName("");
      setCreating(false);
      setMessage("");
    } catch {
      setMessage("Your group could not be created. Please try again.");
    }
  };

  return <section className="compact-circle">
    <section className="circle-section">
      <div className="section-title"><div><h2>Your friends <span>{friends.length ? `· ${friends.length}` : ""}</span></h2><p>Tap a friend to view their profile or send a message.</p></div><button onClick={onInvite}>Invite people</button></div>
      {loading ? <div className="panel circle-loading">Loading your circle...</div> : friends.length ? <div className="circle-friends compact-friends">{friends.map(friend => <button className={`friend-profile-link ${friend.unreadMessages ? "has-unread" : ""}`} key={friend.id} onClick={() => setSelected(friend)}><Avatar imageUrl={friend.avatarUrl}>{initials(friend.displayName)}</Avatar><b>{friend.displayName}</b></button>)}</div> : <div className="panel circle-empty"><div><b>Your circle starts with your people.</b><p>Invite family and friends to swap recommendations and compare reviews.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}
    </section>
    <section className="circle-section">
      <div className="section-title"><div><h2>Group chats <span>{groups.length ? `· ${groups.length}` : ""}</span></h2><p>Private places for conversation and shared picks.</p></div><button className="primary compact-create-group" onClick={() => { setCreating(true); setMessage(""); }}>+ Create group</button></div>
      {creating && <form className="panel group-creator" onSubmit={createGroup}><label>GROUP NAME<input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Movie night crew" maxLength={60} autoFocus/></label><div><button type="button" className="secondary" onClick={() => { setCreating(false); setMessage(""); }}>Cancel</button><button className="primary" type="submit">Create group</button></div>{message && <small>{message}</small>}</form>}
      {loading ? <div className="panel circle-loading">Loading your groups...</div> : groups.length ? <div className="group-grid live-group-grid">{groups.map((group, index) => <article className={`panel group live-group tone-${index % 3}`} key={group.id}><i>{index % 3 === 0 ? "✦" : index % 3 === 1 ? "⌂" : "◉"}</i><h3>{group.name}</h3><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.pickCount} shared {group.pickCount === 1 ? "pick" : "picks"}</p><button className="group-open" onClick={() => setOpenGroup(group)}>Open group →</button>{group.isOwner && <button className="group-invite" onClick={() => setInvitingGroup(group)}>Invite a friend</button>}</article>)}</div> : !creating && <div className="panel circle-empty"><div><b>Create a home for your next watch.</b><p>Start a private group for your family, friend group, or recurring movie night.</p></div><button className="primary" onClick={() => setCreating(true)}>Create a group</button></div>}
    </section>
    {selected && <FriendChatProfileModal friend={selected} onClose={() => setSelected(null)} onRead={() => setFriends(current => current.map(friend => friend.id === selected.id ? { ...friend, unreadMessages: false } : friend))}/>} 
    {invitingGroup && <GroupInviteModal group={invitingGroup} friends={friends} onClose={() => setInvitingGroup(null)} onInvited={() => { setInvitingGroup(null); load(); }} />}
    {openGroup && <GroupSpaceModal group={openGroup} onClose={() => setOpenGroup(null)} onOpen={onOpen}/>} 
  </section>;
}

type DateNight = {
  id: string; name: string; creator: string; status: "open" | "closed";
  participants: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
  slots: Array<{ id: string; day: string; votes: number; selected: boolean }>;
  options: Array<{ id: string; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; votes: number; selected: boolean }>;
};

function DateNightPanel() {
  const [friends, setFriends] = useState<CircleFriend[]>([]); const [nights, setNights] = useState<DateNight[]>([]); const [planning, setPlanning] = useState(false); const [name, setName] = useState("Date night"); const [guestIds, setGuestIds] = useState<string[]>([]); const [days, setDays] = useState<string[]>([""]); const [query, setQuery] = useState(""); const [matches, setMatches] = useState<EditorialTitle[]>([]); const [choices, setChoices] = useState<EditorialTitle[]>([]); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const load = async () => { const [circle, dateNights] = await Promise.all([fetch("/api/circle"), fetch("/api/date-nights")]); const circleData = circle.ok ? await circle.json() as { friends?: CircleFriend[] } : null; const nightData = dateNights.ok ? await dateNights.json() as { nights?: DateNight[] } : null; setFriends(circleData?.friends ?? []); setNights(nightData?.nights ?? []); };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const term = query.trim(); if (term.length < 2) { setMatches([]); return; } const timer = window.setTimeout(() => { void fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(term)}`).then(response => response.ok ? response.json() as Promise<{ results?: EditorialTitle[] }> : null).then(data => setMatches((data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv").slice(0, 6))).catch(() => undefined); }, 220); return () => window.clearTimeout(timer); }, [query]);
  const toggleGuest = (id: string) => setGuestIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const addChoice = (choice: EditorialTitle) => { if (!choices.some(item => item.id === choice.id && item.type === choice.type)) setChoices(current => [...current, choice].slice(0, 5)); setQuery(""); setMatches([]); };
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/date-nights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, friendIds: guestIds, days: days.filter(Boolean), options: choices.map(item => ({ tmdbId: item.id, type: item.type, name: item.title, year: item.year ? Number(item.year) : null, posterPath: item.image })) }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Date Night could not be created."); setSaving(false); return; } setPlanning(false); setGuestIds([]); setDays([""]); setChoices([]); setName("Date night"); setSaving(false); await load(); };
  const vote = async (nightId: string, kind: "day" | "title", choiceId: string) => { const response = await fetch("/api/date-nights", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nightId, kind, choiceId }) }); if (response.ok) await load(); };
  const formatDay = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00`));
  return <section className="date-night-page"><div className="date-night-heading"><div><p className="eyebrow">DATE NIGHT</p><h2>Plan a movie night.</h2><p>Invite your people, choose a few possible days, then let everyone vote on the pick.</p></div><button className="primary" onClick={() => { setPlanning(true); setMessage(""); }}>Plan a Date Night</button></div>{planning && <form className="date-night-builder" onSubmit={create}><div className="date-night-builder-head"><div><p className="eyebrow">NEW DATE NIGHT</p><h3>Make the plan together.</h3></div><button type="button" className="close" onClick={() => setPlanning(false)}>×</button></div><label>NAME<input value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Date night"/></label><div className="date-night-field"><b>INVITE YOUR CIRCLE</b><div className="date-night-guests">{friends.length ? friends.map(friend => <button type="button" key={friend.id} className={guestIds.includes(friend.id) ? "chosen" : ""} onClick={() => toggleGuest(friend.id)}><Avatar imageUrl={friend.avatarUrl}>{friend.displayName.slice(0, 2).toUpperCase()}</Avatar>{friend.displayName}</button>) : <p>Invite a friend to your Circle first.</p>}</div></div><div className="date-night-field"><b>POSSIBLE DAYS</b><div className="date-night-days">{days.map((day, index) => <div key={index}><input type="date" value={day} onChange={event => setDays(current => current.map((value, position) => position === index ? event.target.value : value))}/>{days.length > 1 && <button type="button" onClick={() => setDays(current => current.filter((_, position) => position !== index))}>×</button>}</div>)}</div>{days.length < 4 && <button className="date-night-add" type="button" onClick={() => setDays(current => [...current, ""])}>+ Add another day</button>}</div><div className="date-night-field"><b>MOVIE OR TV SHOW VOTE</b><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles to add"/>{matches.length > 0 && <div className="date-night-results">{matches.map(item => <button type="button" key={`${item.type}-${item.id}`} onClick={() => addChoice(item)}><span>{item.type === "tv" ? "TV" : "Movie"}</span><b>{item.title}</b><small>{item.subtitle}</small></button>)}</div>}<div className="date-night-choices">{choices.map(item => <article key={`${item.type}-${item.id}`}>{item.image ? <img src={item.image} alt=""/> : <span>{item.type === "tv" ? "TV" : "Movie"}</span>}<b>{item.title}</b><button type="button" onClick={() => setChoices(current => current.filter(choice => !(choice.id === item.id && choice.type === item.type)))}>×</button></article>)}{!choices.length && <p>Add at least three titles so everyone has a real choice.</p>}</div></div><div className="date-night-actions"><button type="button" className="secondary" onClick={() => setPlanning(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Sending…" : "Send invitations & open poll"}</button></div>{message && <small className="modal-message">{message}</small>}</form>}{nights.length ? <div className="date-night-list">{nights.map(night => <article className="date-night-card" key={night.id}><header><div><p className="eyebrow">DATE NIGHT POLL</p><h3>{night.name}</h3><span>Hosted by {night.creator}</span></div><div className="date-night-avatars">{night.participants.slice(0, 6).map(person => <Avatar key={person.id} imageUrl={person.avatarUrl}>{person.displayName.slice(0, 2).toUpperCase()}</Avatar>)}</div></header><section><b>Which day works?</b><div className="date-night-vote-row">{night.slots.map(slot => <button key={slot.id} className={slot.selected ? "chosen" : ""} onClick={() => void vote(night.id, "day", slot.id)}>{formatDay(slot.day)}<small>{slot.votes} vote{slot.votes === 1 ? "" : "s"}</small></button>)}</div></section><section><b>What should we watch?</b><div className="date-night-title-votes">{night.options.map(option => <button key={option.id} className={option.selected ? "chosen" : ""} onClick={() => void vote(night.id, "title", option.id)}>{option.posterPath ? <img src={option.posterPath} alt=""/> : <span>{option.type === "tv" ? "TV" : "Movie"}</span>}<strong>{option.title}<small>{option.type === "tv" ? "TV series" : "Movie"}{option.year ? ` · ${option.year}` : ""}</small></strong><em>{option.votes} vote{option.votes === 1 ? "" : "s"}</em></button>)}</div></section></article>)}</div> : !planning && <div className="date-night-empty"><div><b>No Date Nights are planned yet.</b><p>Keep group chats for sharing picks. Use Date Night when you want to settle on a day and a movie together.</p></div></div>}</section>;
}

function CirclePage({ onInvite, onOpen }: { onInvite: () => void; onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void }) { return <><CompactPeopleFinder/><CompactCirclePageV2 onInvite={onInvite} onOpen={onOpen}/><DateNightPanel/></>; }

type PersonCard = { id: string; displayName: string; username: string | null; avatarUrl: string | null; bio: string | null; relationship: "none" | "incoming" | "outgoing" | "friend"; requestId?: string | null; mutualCount?: number };

function PeopleFinder() {
  const [query, setQuery] = useState(""); const [people, setPeople] = useState<PersonCard[]>([]); const [suggestions, setSuggestions] = useState<PersonCard[]>([]); const [requests, setRequests] = useState<Array<{ id: string; person?: PersonCard }>>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [selected, setSelected] = useState<CircleFriend | null>(null);
  const load = async (value = query) => { setLoading(true); const response = await fetch(`/api/people${value.trim().length >= 2 ? `?q=${encodeURIComponent(value.trim())}` : ""}`); const data = response.ok ? await response.json() as { people?: PersonCard[]; suggestions?: PersonCard[]; requests?: Array<{ id: string; person?: PersonCard }> } : null; setPeople(data?.people ?? []); setSuggestions(data?.suggestions ?? []); setRequests(data?.requests ?? []); setLoading(false); };
  useEffect(() => { void load(""); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (query.trim().length >= 2) void load(query); else setPeople([]); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const send = async (person: PersonCard) => { setMessage(""); const response = await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendId: person.id }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Friend request could not be sent."); return; } setMessage(`Friend request sent to ${person.displayName}.`); await load(query); };
  const respond = async (requestId: string, action: "accept" | "decline") => { const response = await fetch("/api/people", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) }); const data = await response.json() as { error?: string }; setMessage(response.ok ? (action === "accept" ? "Friend request accepted." : "Friend request declined.") : data.error ?? "Unable to update this request."); await load(query); };
  const card = (person: PersonCard) => <article key={person.id} className="people-card"><button className="people-profile" onClick={() => setSelected({ id: person.id, displayName: person.displayName, avatarUrl: person.avatarUrl, bio: person.bio })}><Avatar imageUrl={person.avatarUrl}>{person.displayName.slice(0, 2).toUpperCase()}</Avatar><span><b>{person.displayName}</b><small>{person.username ? `@${person.username}` : "CineApe member"}{person.mutualCount ? ` · ${person.mutualCount} mutual ${person.mutualCount === 1 ? "friend" : "friends"}` : ""}</small></span></button>{person.relationship === "incoming" ? <button className="small-primary" onClick={() => void respond(person.requestId!, "accept")}>Accept</button> : person.relationship === "outgoing" ? <span className="request-pending">Requested</span> : person.relationship === "friend" ? <span className="request-pending">Friends</span> : <button className="small-primary" onClick={() => void send(person)}>Add friend</button>}</article>;
  return <section className="page people-page"><Intro label="GROW YOUR CIRCLE" title="Find your people." text="Search a unique @username, accept requests, or connect through mutual friends." action={null}/><div className="people-search panel"><label>⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by @username" aria-label="Search people by username"/></label>{query.trim().length >= 2 && <div className="people-results">{loading ? <p>Searching CineApe…</p> : people.length ? people.map(card) : <p>No members found with that username.</p>}</div>}</div>{requests.length > 0 && <section className="people-section"><div className="section-title"><h2>Friend requests <span>· {requests.length}</span></h2></div><div className="people-grid">{requests.filter(request => request.person).map(request => <article className="people-card" key={request.id}><button className="people-profile" onClick={() => setSelected({ id: request.person!.id, displayName: request.person!.displayName, avatarUrl: request.person!.avatarUrl, bio: request.person!.bio })}><Avatar imageUrl={request.person!.avatarUrl}>{request.person!.displayName.slice(0, 2).toUpperCase()}</Avatar><span><b>{request.person!.displayName}</b><small>{request.person!.username ? `@${request.person!.username}` : "CineApe member"}</small></span></button><div className="people-request-actions"><button className="small-primary" onClick={() => void respond(request.id, "accept")}>Accept</button><button className="small-ghost" onClick={() => void respond(request.id, "decline")}>Decline</button></div></article>)}</div></section>}{suggestions.length > 0 && <section className="people-section"><div className="section-title"><div><h2>People you may know</h2><p>Connected through friends in your Circle.</p></div></div><div className="people-grid">{suggestions.map(card)}</div></section>}{message && <p className="people-message">{message}</p>}{selected && <FriendProfileModal friend={selected} onClose={() => setSelected(null)}/>}</section>;
}

type ChatMessage = { id: string; body: string; createdAt: string; sender: { id: string; displayName: string; avatarUrl: string | null }; title: { id: string; name: string; type: "movie" | "tv"; year: number | null; posterPath: string | null } | null };
type ChatChannel = { kind: "friend" | "group"; id: string; name: string; avatarUrl?: string | null };

function ChatWall({ onOpen }: { onOpen: (title?: string, meta?: string, score?: string) => void }) {
  const [channels, setChannels] = useState<ChatChannel[]>([]); const [selected, setSelected] = useState<ChatChannel | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([]); const [viewerId, setViewerId] = useState(""); const [loading, setLoading] = useState(true); const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false); const [notice, setNotice] = useState(""); const [titleSearchOpen, setTitleSearchOpen] = useState(false); const [titleQuery, setTitleQuery] = useState(""); const [titleResults, setTitleResults] = useState<SearchResult[]>([]); const [attachedTitle, setAttachedTitle] = useState<ShareTitle | null>(null);
  useEffect(() => { let active = true; void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ friends?: CircleFriend[]; groups?: CircleGroup[] }> : null).then(data => { if (!active) return; const next = [...(data?.friends ?? []).map(friend => ({ kind: "friend" as const, id: friend.id, name: friend.displayName, avatarUrl: friend.avatarUrl })), ...(data?.groups ?? []).map(group => ({ kind: "group" as const, id: group.id, name: group.name }))]; setChannels(next); setSelected(current => current && next.some(item => item.kind === current.kind && item.id === current.id) ? current : next[0] ?? null); }).catch(() => { if (active) setChannels([]); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!selected) { setLoading(false); setMessages([]); return; } let active = true; const load = async () => { const query = selected.kind === "friend" ? `friendId=${encodeURIComponent(selected.id)}` : `groupId=${encodeURIComponent(selected.id)}`; const response = await fetch(`/api/chat?${query}`); const data = response.ok ? await response.json() as { viewerId?: string; messages?: ChatMessage[] } : null; if (active) { setViewerId(data?.viewerId ?? ""); setMessages(data?.messages ?? []); setLoading(false); } }; setLoading(true); void load(); const interval = window.setInterval(() => void load(), 12000); return () => { active = false; window.clearInterval(interval); }; }, [selected]);
  useEffect(() => { const query = titleQuery.trim(); if (!titleSearchOpen || query.length < 2) { setTitleResults([]); return; } const controller = new AbortController(); const timer = window.setTimeout(() => { void fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(query)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ results?: SearchResult[] }> : null).then(data => setTitleResults((data?.results ?? []).filter(result => result.type === "movie" || result.type === "tv"))).catch(() => undefined); }, 220); return () => { controller.abort(); window.clearTimeout(timer); }; }, [titleSearchOpen, titleQuery]);
  const send = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || sending || (!draft.trim() && !attachedTitle)) return; setSending(true); setNotice(""); const payload = { body: draft, title: attachedTitle, ...(selected.kind === "friend" ? { friendId: selected.id } : { groupId: selected.id }) }; const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json() as { error?: string }; if (!response.ok) { setNotice(data.error ?? "Your message could not be sent."); setSending(false); return; } setDraft(""); setAttachedTitle(null); setTitleSearchOpen(false); setTitleQuery(""); setSending(false); const query = selected.kind === "friend" ? `friendId=${encodeURIComponent(selected.id)}` : `groupId=${encodeURIComponent(selected.id)}`; const fresh = await fetch(`/api/chat?${query}`).then(result => result.ok ? result.json() as Promise<{ viewerId?: string; messages?: ChatMessage[] }> : null); setViewerId(fresh?.viewerId ?? viewerId); setMessages(fresh?.messages ?? messages); };
  return <section className="page chat-page"><Intro label="CIRCLE CHAT" title="Talk about what to watch." text="Private chats for your friends, family, and groups. New messages refresh automatically." action={null}/>{channels.length ? <div className="chat-shell panel"><aside className="chat-channels"><p>YOUR CHATS</p>{channels.map(channel => <button key={`${channel.kind}-${channel.id}`} className={selected?.kind === channel.kind && selected.id === channel.id ? "chosen" : ""} onClick={() => { setSelected(channel); setNotice(""); }}><Avatar imageUrl={channel.avatarUrl}>{channel.kind === "group" ? "✦" : channel.name.slice(0, 2).toUpperCase()}</Avatar><span><b>{channel.name}</b><small>{channel.kind === "group" ? "Group wall" : "Direct chat"}</small></span></button>)}</aside><div className="chat-thread"><header><div><p className="eyebrow">{selected?.kind === "group" ? "GROUP WALL" : "DIRECT CHAT"}</p><h2>{selected?.name}</h2></div><span>Private to your Circle</span></header><div className="chat-messages">{loading ? <p className="chat-empty">Loading your conversation…</p> : messages.length ? messages.map(message => <article key={message.id} className={message.sender.id === viewerId ? "mine" : ""}>{message.sender.id !== viewerId && <Avatar imageUrl={message.sender.avatarUrl}>{message.sender.displayName.slice(0, 2).toUpperCase()}</Avatar>}<div><b>{message.sender.id === viewerId ? "You" : message.sender.displayName}</b>{message.body && <p>{message.body}</p>}{message.title && <button className="chat-title-card" onClick={() => onOpen(message.title!.name, `${message.title!.year ?? "—"} · ${message.title!.type === "tv" ? "TV series" : "Movie"}`, "—")}>{message.title.posterPath ? <img src={message.title.posterPath} alt=""/> : <span>★</span>}<strong>{message.title.name}<small>{message.title.type === "tv" ? "TV series" : "Movie"}{message.title.year ? ` · ${message.title.year}` : ""}</small></strong></button>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>) : <p className="chat-empty">Start the conversation. Share a thought, a plan, or a great title.</p>}</div><form className="chat-compose" onSubmit={send}>{attachedTitle && <div className="chat-attached">{attachedTitle.posterPath ? <img src={attachedTitle.posterPath} alt=""/> : <span>★</span>}<b>{attachedTitle.name}</b><button type="button" onClick={() => setAttachedTitle(null)}>×</button></div>}{titleSearchOpen && <div className="chat-title-search"><input value={titleQuery} onChange={event => setTitleQuery(event.target.value)} placeholder="Search a movie or show" autoFocus/>{titleResults.map(result => <button type="button" key={`${result.type}-${result.id}`} onClick={() => { setAttachedTitle({ tmdbId: result.id, type: result.type as "movie" | "tv", name: result.title, year: result.year ? Number(result.year) : null, posterPath: result.image }); setTitleSearchOpen(false); setTitleQuery(""); }}><b>{result.title}</b><small>{result.subtitle}</small></button>)}</div>}<div><button type="button" className="chat-attach" title="Attach a movie or TV show" onClick={() => setTitleSearchOpen(open => !open)}>＋</button><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${selected?.name ?? "your Circle"}`} maxLength={2000}/><button className="primary" disabled={sending || (!draft.trim() && !attachedTitle)}>{sending ? "Sending…" : "Send"}</button></div>{notice && <small className="modal-message">{notice}</small>}</form></div></div> : <div className="panel chat-start"><b>Your chats will appear here.</b><p>Invite a friend or add someone to a group to start sharing what to watch together.</p></div>}</section>;
}

function MovieNightPanel() {
  const [groups, setGroups] = useState<CircleGroup[]>([]); const [groupId, setGroupId] = useState(""); const [poll, setPoll] = useState<MovieNightPoll | null>(null); const [loading, setLoading] = useState(true); const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("What should we watch?"); const [query, setQuery] = useState(""); const [matches, setMatches] = useState<EditorialTitle[]>([]); const [choices, setChoices] = useState<EditorialTitle[]>([]); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/circle").then(response => response.ok ? response.json() as Promise<{ groups?: CircleGroup[] }> : null).then(data => { const next = data?.groups ?? []; setGroups(next); setGroupId(current => current || next[0]?.id || ""); }).catch(() => setGroups([])); }, []);
  const loadPoll = async (id = groupId) => { if (!id) { setPoll(null); setLoading(false); return; } setLoading(true); const response = await fetch(`/api/movie-nights?groupId=${encodeURIComponent(id)}`); const data = response.ok ? await response.json() as { poll?: MovieNightPoll | null } : null; setPoll(data?.poll ?? null); setLoading(false); };
  useEffect(() => { void loadPoll(); }, [groupId]);
  const find = async () => { if (query.trim().length < 2) { setMessage("Type at least two letters to find a title."); return; } const response = await fetch(`/api/tmdb?mode=search&query=${encodeURIComponent(query.trim())}`); const data = response.ok ? await response.json() as { results?: EditorialTitle[] } : null; setMatches((data?.results ?? []).filter(item => item.type === "movie" || item.type === "tv")); };
  const addChoice = (item: EditorialTitle) => { if (choices.length >= 5) { setMessage("A Movie Night can have up to five options."); return; } if (!choices.some(choice => choice.id === item.id && choice.type === item.type)) setChoices(current => [...current, item]); setMatches([]); setQuery(""); };
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (!groupId || saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/movie-nights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId, question, options: choices.map(choice => ({ tmdbId: choice.id, type: choice.type, name: choice.title, year: choice.year ? Number(choice.year) : null, posterPath: choice.image })) }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setMessage(data.error ?? "Movie Night could not be created."); setSaving(false); return; } setChoices([]); setCreating(false); setSaving(false); setMessage(""); await loadPoll(); };
  const vote = async (optionId: string) => { if (!poll || saving) return; setSaving(true); const response = await fetch("/api/movie-nights", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pollId: poll.id, optionId }) }); const data = await response.json() as { error?: string }; if (!response.ok) setMessage(data.error ?? "Your vote could not be saved."); await loadPoll(); setSaving(false); };
  const selectedGroup = groups.find(group => group.id === groupId);
  return <section className="page movie-night-page"><Intro label="MOVIE NIGHT" title="Decide together." text="Start a pick, let your people vote, then make the night happen." action={groups.length && !poll ? <button className="primary" onClick={() => { setCreating(true); setMessage(""); }}>+ Start Movie Night</button> : null}/>{groups.length ? <><div className="tabs movie-night-groups">{groups.map(group => <button key={group.id} className={group.id === groupId ? "chosen" : ""} onClick={() => { setGroupId(group.id); setCreating(false); }}>{group.name}</button>)}</div>{loading ? <div className="panel movie-night-loading">Loading {selectedGroup?.name ?? "group"}'s Movie Night…</div> : creating ? <form className="panel movie-night-builder" onSubmit={create}><p className="eyebrow">{selectedGroup?.name ?? "YOUR GROUP"}</p><h2>Start a Movie Night</h2><label>QUESTION<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={180}/></label><label>ADD 3–5 TITLES<div className="editor-title-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search movie or TV show"/><button type="button" className="secondary" onClick={() => void find()}>Find</button></div></label>{matches.length > 0 && <div className="editor-matches">{matches.map(item => <button key={`${item.type}-${item.id}`} type="button" onClick={() => addChoice(item)}>{item.image ? <img src={item.image} alt=""/> : <span>◉</span>}<div><b>{item.title}</b><small>{item.subtitle}</small></div></button>)}</div>}<div className="movie-night-choices">{choices.length ? choices.map((item, index) => <article key={`${item.type}-${item.id}`}>{item.image ? <img src={item.image} alt=""/> : <span>{index + 1}</span>}<b>{item.title}</b><button type="button" onClick={() => setChoices(current => current.filter(choice => choice.id !== item.id || choice.type !== item.type))}>×</button></article>) : <p>Pick at least three choices for your group.</p>}</div><div><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Starting…" : "Start the vote"}</button></div>{message && <small>{message}</small>}</form> : poll ? <section className="panel movie-night-poll"><div className="movie-night-poll-head"><div><p className="eyebrow">{selectedGroup?.name ?? "YOUR GROUP"} · {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}</p><h2>{poll.question}</h2><span>Started by {poll.creator}. Everyone gets one vote.</span></div><button className="secondary" onClick={() => { setCreating(true); setPoll(null); }}>New Movie Night</button></div><div className="movie-night-options">{poll.options.map((option, index) => <article className={option.selected ? "selected" : ""} key={option.id}>{option.posterPath ? <img src={option.posterPath} alt=""/> : <span>{index + 1}</span>}<div><b>{option.title}</b><small>{option.type === "tv" ? "TV series" : "Movie"}{option.year ? ` · ${option.year}` : ""}</small><div className="movie-night-voters">{option.voters.map(voter => <Avatar key={voter.id} imageUrl={voter.avatarUrl}>{voter.displayName.slice(0, 2).toUpperCase()}</Avatar>)}{option.votes ? <em>{option.votes} {option.votes === 1 ? "vote" : "votes"}</em> : <em>Be first to vote</em>}</div></div><button className={option.selected ? "secondary" : "primary"} disabled={saving} onClick={() => void vote(option.id)}>{option.selected ? "Your pick" : "Vote"}</button></article>)}</div></section> : <div className="panel movie-night-empty"><div><b>No Movie Night is running yet.</b><p>Start a friendly vote and give everyone a say in the next group watch.</p></div><button className="primary" onClick={() => setCreating(true)}>Start Movie Night</button></div>}</> : <div className="panel movie-night-empty"><div><b>Movie Nights happen in groups.</b><p>Create a family, friend, or movie-night group first—then everyone can vote on what to watch.</p></div></div>}</section>;
}

function FriendProfileModal({ friend, onClose }: { friend: CircleFriend; onClose: () => void }) {
  const [activeFriend, setActiveFriend] = useState(friend);
  const [data, setData] = useState<FriendProfileData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(""); setNotice("");
    void fetch(`/api/friends/${activeFriend.id}`)
      .then(response => response.ok ? response.json() as Promise<FriendProfileData> : response.json().then((value: { error?: string }) => Promise.reject(new Error(value.error ?? "Profile unavailable."))))
      .then(profile => { if (active) setData(profile); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Profile unavailable."); });
    return () => { active = false; };
  }, [activeFriend.id]);

  const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const addFriend = async (person: FriendProfileData["friends"][number]) => {
    setRequesting(person.id); setNotice("");
    const response = await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendId: person.id }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? `Friend request sent to ${person.displayName}.` : result.error ?? "Friend request could not be sent.");
    setRequesting(null);
  };

  return <div className="backdrop" onClick={onClose}><div className="modal friend-profile-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>
    {activeFriend.id !== friend.id && <button className="friend-profile-back" onClick={() => setActiveFriend(friend)}>← Back to {friend.displayName}</button>}
    {!data && !error && <p className="share-empty">Loading {activeFriend.displayName}'s profile…</p>}
    {error && <p className="share-empty">{error}</p>}
    {data && <><div className="friend-profile-heading"><Avatar imageUrl={data.profile.avatarUrl}>{initials(data.profile.displayName)}</Avatar><div><p className="eyebrow">{data.connectionLevel === "friend" ? "IN YOUR CINEAPE CIRCLE" : "CONNECTED THROUGH YOUR CIRCLE"}</p><h2>{data.profile.displayName}</h2>{data.profile.username && <small className="profile-username">@{data.profile.username}</small>}<p>{data.profile.bio || "Watching, rating, and sharing great picks."}</p></div></div><div className="friend-profile-stats"><b>{data.stats.ratings}<span>Ratings</span></b><b>{data.stats.sent}<span>Sent</span></b><b>{data.stats.received}<span>Received</span></b></div>
      <section><h3>Friends</h3>{data.friendsVisible ? data.friends.length ? <div className="friend-network-list">{data.friends.map(person => <article key={person.id}><button onClick={() => setActiveFriend({ id: person.id, displayName: person.displayName, avatarUrl: person.avatarUrl, bio: person.bio })}><Avatar imageUrl={person.avatarUrl}>{initials(person.displayName)}</Avatar><span><b>{person.displayName}</b><small>{person.username ? `@${person.username}` : "CineApe member"}{person.mutualCount ? " · Your friend too" : ""}</small></span></button>{person.relationship === "friend" ? <em>Friend</em> : <button className="small-primary" disabled={requesting === person.id} onClick={() => void addFriend(person)}>{requesting === person.id ? "Adding…" : "Add friend"}</button>}</article>)}</div> : <p className="profile-empty">No other friends to show yet.</p> : <p className="profile-empty">Their friends list is private.</p>}</section>
      {notice && <p className="people-message">{notice}</p>}
      <section><h3>Recent ratings</h3>{data.recentRatings.length ? <div className="friend-profile-list">{data.recentRatings.map(item => <article key={`${item.title}-${item.updatedAt}`}>{item.posterPath ? <img src={item.posterPath} alt="" /> : <span>★</span>}<div><b>{item.title}</b><small>{item.review || "Rated on CineApe"}</small></div><strong>{item.score}/10</strong></article>)}</div> : <p className="profile-empty">No ratings yet.</p>}</section><section><h3>Recently completed</h3>{data.completed.length ? <div className="completed-pills">{data.completed.map(item => <span key={`${item.type}-${item.title}`}>{item.title}</span>)}</div> : <p className="profile-empty">No completed titles yet.</p>}</section></>}
  </div></div>;
}

function GroupInviteModal({ group, friends, onClose, onInvited }: { group: CircleGroup; friends: CircleFriend[]; onClose: () => void; onInvited: () => void }) {
  const [friendId, setFriendId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const invite = async () => { if (!friendId || saving) return; setSaving(true); setMessage(""); const response = await fetch("/api/circle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id, friendId }) }); const data = await response.json() as { error?: string; status?: string }; if (!response.ok) { setMessage(data.error ?? "The invitation could not be sent."); setSaving(false); return; } onInvited(); };
  return <div className="backdrop" onClick={onClose}><div className="modal share-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><p className="eyebrow">INVITE TO GROUP</p><h2>Add a friend to {group.name}</h2><p>They’ll get a CineApe notification and can see the group’s shared picks.</p><label>CHOOSE A FRIEND</label>{friends.length ? <div className="share-people">{friends.map(friend => <button key={friend.id} className={friendId === friend.id ? "chosen" : ""} onClick={() => setFriendId(friend.id)}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.displayName.slice(0, 1)}</span>}<b>{friend.displayName}</b></button>)}</div> : <p className="share-empty">Invite someone to your Circle first.</p>}<button className="primary wide" disabled={!friendId || saving} onClick={() => void invite()}>{saving ? "Inviting…" : "Invite to group"}</button>{message && <small className="modal-message">{message}</small>}</div></div>;
}

type GroupSharedPick = { id: string; titleId: string; tmdbId: number; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; addedBy: { id: string; displayName: string; avatarUrl: string | null }; savedCount: number; savedByViewer: boolean; reactionCounts: Record<string, number>; viewerReaction: string | null };

function GroupSpaceModalLegacy({ group, onClose, onOpen }: { group: CircleGroup; onClose: () => void; onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [picks, setPicks] = useState<GroupSharedPick[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingPick, setSavingPick] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const [chatResponse, pickResponse] = await Promise.all([fetch(`/api/chat?groupId=${encodeURIComponent(group.id)}`), fetch(`/api/group-picks?groupId=${encodeURIComponent(group.id)}`)]);
    const chat = chatResponse.ok ? await chatResponse.json() as { viewerId?: string; messages?: ChatMessage[] } : null;
    const pickData = pickResponse.ok ? await pickResponse.json() as { picks?: GroupSharedPick[] } : null;
    setViewerId(chat?.viewerId ?? "");
    setMessages(chat?.messages ?? []);
    setPicks(pickData?.picks ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 12000); return () => window.clearInterval(interval); }, [group.id]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true); setNotice("");
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id, body: draft }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setNotice(data.error ?? "Your message could not be sent."); else { setDraft(""); await load(); }
    setSending(false);
  };
  const savePick = async (pick: GroupSharedPick) => {
    if (savingPick || pick.savedByViewer) return;
    setSavingPick(pick.id); setNotice("");
    const response = await fetch("/api/group-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", groupId: group.id, pickId: pick.id }) });
    const data = await response.json() as { error?: string; status?: string; savedCount?: number };
    if (!response.ok) setNotice(data.error ?? "This pick could not be saved.");
    else {
      setPicks(current => current.map(item => item.id === pick.id ? { ...item, savedByViewer: true, savedCount: data.savedCount ?? item.savedCount + 1 } : item));
      setNotice(data.status === "already_saved" ? "Already in your watchlist." : `Added ${pick.title} to your watchlist — ${pick.addedBy.displayName} gets the recommendation credit.`);
    }
    setSavingPick(null);
  };
  const reactToPick = async (pick: GroupSharedPick, emoji: string) => {
    const response = await fetch("/api/group-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "react", groupId: group.id, pickId: pick.id, emoji }) });
    const data = await response.json() as { reactionCounts?: Record<string, number>; viewerReaction?: string | null };
    if (response.ok) setPicks(current => current.map(item => item.id === pick.id ? { ...item, reactionCounts: data.reactionCounts ?? item.reactionCounts, viewerReaction: data.viewerReaction ?? null } : item));
  };
  const visiblePicks = filter === "all" ? picks : picks.filter(pick => pick.type === filter);
  return <div className="backdrop group-space-backdrop" onClick={onClose}><section className="modal group-space-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><header className="group-space-head"><div><p className="eyebrow">YOUR GROUP</p><h2>{group.name}</h2><span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · Share picks, plan your next watch, and talk about it here.</span></div></header><div className="group-space-grid"><section className="group-wall"><div className="group-space-section-head"><div><p className="eyebrow">GROUP WALL</p><h3>Talk it out</h3></div><span>Private to this group</span></div><div className="group-wall-messages">{loading ? <p>Loading the wall...</p> : messages.length ? messages.map(message => <article key={message.id} className={message.sender.id === viewerId ? "mine" : ""}>{message.sender.id !== viewerId && <Avatar imageUrl={message.sender.avatarUrl}>{message.sender.displayName.slice(0, 2).toUpperCase()}</Avatar>}<div><b>{message.sender.id === viewerId ? "You" : message.sender.displayName}</b>{message.body && <p>{message.body}</p>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>) : <p>Start the group wall. Ask what everyone is watching or plan your next movie night.</p>}</div><form className="group-wall-compose" onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${group.name}`} maxLength={2000}/><button className="primary" disabled={sending || !draft.trim()}>{sending ? "Sending..." : "Send"}</button></form></section><section className="group-picks"><div className="group-space-section-head"><div><p className="eyebrow">SHARED LIST</p><h3>Movies & TV shows</h3></div><span>{picks.length} {picks.length === 1 ? "pick" : "picks"}</span></div><div className="tabs group-pick-tabs"><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "movie" ? "chosen" : ""} onClick={() => setFilter("movie")}>Movies</button><button className={filter === "tv" ? "chosen" : ""} onClick={() => setFilter("tv")}>TV shows</button></div><div className="group-pick-list">{loading ? <p>Loading shared picks...</p> : visiblePicks.length ? visiblePicks.map(pick => <article key={pick.id}><button className="group-pick-title" onClick={() => { onClose(); onOpen(pick.title, `${pick.year ?? "—"} · ${pick.type === "tv" ? "TV series" : "Movie"}`, "—", pick.tmdbId, pick.type); }}>{pick.posterPath ? <img src={pick.posterPath} alt=""/> : <span>{pick.type === "tv" ? "TV" : "Movie"}</span>}<div><b>{pick.title}</b><small>{pick.type === "tv" ? "TV series" : "Movie"}{pick.year ? ` · ${pick.year}` : ""}</small><em>Added by {pick.addedBy.displayName} · {pick.savedCount} {pick.savedCount === 1 ? "save" : "saves"}</em></div></button><button className={pick.savedByViewer ? "secondary saved-group-pick" : "small-primary"} disabled={Boolean(savingPick) || pick.savedByViewer} onClick={() => void savePick(pick)}>{savingPick === pick.id ? "Saving..." : pick.savedByViewer ? "In watchlist" : "Add to watchlist"}</button></article>) : <p>No {filter === "all" ? "shared picks" : filter === "tv" ? "TV shows" : "movies"} yet. Add one from any title page with “Add to group list.”</p>}</div></section></div>{notice && <p className="group-space-notice">{notice}</p>}</section></div>;
}

function GroupPickReactions({ pick, onReact }: { pick: GroupSharedPick; onReact: (emoji: string) => void }) {
  return <div className="group-pick-reactions" aria-label="React to this shared pick">{["🍿", "🔥", "👀"].map(emoji => <button key={emoji} type="button" className={pick.viewerReaction === emoji ? "chosen" : ""} onClick={() => onReact(emoji)}>{emoji}{pick.reactionCounts?.[emoji] ? <small>{pick.reactionCounts[emoji]}</small> : null}</button>)}</div>;
}

function GroupSpaceModal({ group, onClose, onOpen }: { group: CircleGroup; onClose: () => void; onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [picks, setPicks] = useState<GroupSharedPick[]>([]); const [viewerId, setViewerId] = useState(""); const [draft, setDraft] = useState(""); const [filter, setFilter] = useState<"all" | "movie" | "tv">("all"); const [loading, setLoading] = useState(true); const [savingPick, setSavingPick] = useState<string | null>(null);
  const load = async () => { const [chatResponse, pickResponse] = await Promise.all([fetch(`/api/chat?groupId=${encodeURIComponent(group.id)}`), fetch(`/api/group-picks?groupId=${encodeURIComponent(group.id)}`)]); const chat = chatResponse.ok ? await chatResponse.json() as { viewerId?: string; messages?: ChatMessage[] } : null; const pickData = pickResponse.ok ? await pickResponse.json() as { picks?: GroupSharedPick[] } : null; setViewerId(chat?.viewerId ?? ""); setMessages(chat?.messages ?? []); setPicks(pickData?.picks ?? []); setLoading(false); };
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 12000); return () => window.clearInterval(interval); }, [group.id]);
  const send = async (event: React.FormEvent) => { event.preventDefault(); if (!draft.trim()) return; const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: group.id, body: draft }) }); if (response.ok) { setDraft(""); await load(); } };
  const savePick = async (pick: GroupSharedPick) => { if (savingPick || pick.savedByViewer) return; setSavingPick(pick.id); const response = await fetch("/api/group-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", groupId: group.id, pickId: pick.id }) }); const data = await response.json() as { savedCount?: number }; if (response.ok) setPicks(current => current.map(item => item.id === pick.id ? { ...item, savedByViewer: true, savedCount: data.savedCount ?? item.savedCount + 1 } : item)); setSavingPick(null); };
  const reactToPick = async (pick: GroupSharedPick, emoji: string) => { const response = await fetch("/api/group-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "react", groupId: group.id, pickId: pick.id, emoji }) }); const data = await response.json() as { reactionCounts?: Record<string, number>; viewerReaction?: string | null }; if (response.ok) setPicks(current => current.map(item => item.id === pick.id ? { ...item, reactionCounts: data.reactionCounts ?? item.reactionCounts, viewerReaction: data.viewerReaction ?? null } : item)); };
  const visiblePicks = filter === "all" ? picks : picks.filter(pick => pick.type === filter); const newest = picks[0];
  return <div className="backdrop group-space-backdrop" onClick={onClose}><section className="modal group-space-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button><header className="group-space-head"><div><p className="eyebrow">YOUR GROUP</p><h2>{group.name}</h2><span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · Share picks and plan your next watch.</span>{newest && <p className="group-whats-new"><b>What’s new</b> {newest.addedBy.displayName} added {newest.title}</p>}</div></header><div className="group-space-grid"><section className="group-wall"><div className="group-space-section-head"><div><p className="eyebrow">GROUP WALL</p><h3>Talk it out</h3></div><span>Private to this group</span></div><div className="group-wall-messages">{loading ? <p>Loading the wall...</p> : messages.length ? messages.map(message => <article key={message.id} className={message.sender.id === viewerId ? "mine" : ""}>{message.sender.id !== viewerId && <Avatar imageUrl={message.sender.avatarUrl}>{message.sender.displayName.slice(0, 2).toUpperCase()}</Avatar>}<div><b>{message.sender.id === viewerId ? "You" : message.sender.displayName}</b><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>) : <p>Start the conversation. Make the next watch a group decision.</p>}</div><form className="group-wall-compose" onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${group.name}`} maxLength={2000}/><button className="primary" disabled={!draft.trim()}>Send</button></form></section><section className="group-picks"><div className="group-space-section-head"><div><p className="eyebrow">SHARED LIST</p><h3>Movies & TV shows</h3></div><span>{picks.length} {picks.length === 1 ? "pick" : "picks"}</span></div><div className="tabs group-pick-tabs"><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "movie" ? "chosen" : ""} onClick={() => setFilter("movie")}>Movies</button><button className={filter === "tv" ? "chosen" : ""} onClick={() => setFilter("tv")}>TV shows</button></div><div className="group-pick-list">{loading ? <p>Loading shared picks...</p> : visiblePicks.length ? visiblePicks.map(pick => <article key={pick.id}><button className="group-pick-title" onClick={() => { onClose(); onOpen(pick.title, `${pick.year ?? "—"} · ${pick.type === "tv" ? "TV series" : "Movie"}`, "—", pick.tmdbId, pick.type); }}>{pick.posterPath ? <img src={pick.posterPath} alt=""/> : <span>{pick.type === "tv" ? "TV" : "Movie"}</span>}<div><b>{pick.title}</b><small>{pick.type === "tv" ? "TV series" : "Movie"}{pick.year ? ` · ${pick.year}` : ""}</small><em>Added by {pick.addedBy.displayName} · {pick.savedCount} {pick.savedCount === 1 ? "save" : "saves"}</em><GroupPickReactions pick={pick} onReact={emoji => void reactToPick(pick, emoji)}/></div></button><button className={pick.savedByViewer ? "secondary saved-group-pick" : "small-primary"} disabled={Boolean(savingPick) || pick.savedByViewer} onClick={() => void savePick(pick)}>{savingPick === pick.id ? "Saving..." : pick.savedByViewer ? "In watchlist" : "Add to watchlist"}</button></article>) : <p>No shared picks yet. Add one from any title page with “Add to group list.”</p>}</div></section></div></section></div>;
}

type HomeRelease = { id: number; type: "movie" | "tv"; title: string; year: string | null; date?: string | null; image: string | null; score: string };

function HomeCategories({ onOpen, onInvite }: { onOpen: (title?: string, meta?: string, score?: string, tmdbId?: number, type?: "movie" | "tv") => void; onInvite: () => void }) {
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [media, setMedia] = useState<"all" | "movie" | "tv">("all");
  const [titles, setTitles] = useState<HomeRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const rail = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetch(`/api/tmdb?mode=home&period=${period}&media=${media}`).then(response => response.ok ? response.json() as Promise<{ titles?: HomeRelease[] }> : null)
      .then(data => { if (active) setTitles(data?.titles ?? []); })
      .catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, media]);
  const dateLabel = (item: HomeRelease) => item.date ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${item.date}T12:00:00`)) : item.year ?? "Coming soon";
  const scrollRail = (direction: -1 | 1) => rail.current?.scrollBy({ left: direction * 520, behavior: "smooth" });
  return <div className="home-categories"><section className="home-shelf trending-shelf"><div className="trending-heading"><h2>Trending</h2><div className="trending-controls"><div className="trending-period" aria-label="Trending time period"><button type="button" className={period === "day" ? "chosen" : ""} onClick={() => setPeriod("day")}>Today</button><button type="button" className={period === "week" ? "chosen" : ""} onClick={() => setPeriod("week")}>This week</button></div><div className="trending-media" aria-label="Trending media type"><button type="button" className={media === "all" ? "chosen" : ""} onClick={() => setMedia("all")}>All</button><button type="button" className={media === "movie" ? "chosen" : ""} onClick={() => setMedia("movie")}>Movies</button><button type="button" className={media === "tv" ? "chosen" : ""} onClick={() => setMedia("tv")}>TV shows</button></div></div></div>{loading ? <div className="shelf-loading">Finding what people are watching…</div> : titles.length ? <div className="trending-rail"><button type="button" className="trending-arrow left" onClick={() => scrollRail(-1)} aria-label="Show earlier trending titles">‹</button><div className="trending-scroll" ref={rail}>{titles.map(item => <article className="trending-card" key={`${item.type}-${item.id}`}><button type="button" className="trending-poster" onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, item.score, item.id, item.type)}>{item.image && <img src={item.image} alt={`${item.title} poster`} />}<span>{item.type === "tv" ? "TV" : "Movie"}</span></button><b>{item.title}</b><small>{dateLabel(item)}</small></article>)}</div><button type="button" className="trending-arrow right" onClick={() => scrollRail(1)} aria-label="Show more trending titles">›</button></div> : <div className="panel discover-empty"><b>Trending titles are unavailable just now.</b><p>Try again shortly.</p></div>}</section><section className="home-shelf friends-shelf"><div className="section-title"><div><h2>What your friends are currently watching</h2><p>Updates from the people in your Circle.</p></div></div><div className="panel friends-empty"><div><b>Your Circle is ready when they are.</b><p>Invite family and friends to see what they are watching, saving, and recommending.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div></section></div>;
}
type LiveRecommendation = { id: string; titleId: string; status: "pending" | "watching" | "watched" | "not_interested"; note: string | null; recommendationScore?: number | null; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; person: { displayName: string; avatarUrl: string | null } | null };
type SentRecommendation = LiveRecommendation & { recipients: string[]; recipientStatuses: LiveRecommendation["status"][] };
type LibraryEntry = { id: string; status: "watchlist" | "watching" | "completed"; tmdbId: number; title: string; type: "movie" | "tv"; year: number | null; posterPath: string | null; currentSeason: number | null; currentEpisode: number | null };
type EpisodeGuide = { season: number; episodes: number; name: string };

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

function ForYouTrackingPage({ onInvite, onOpen }: { onInvite: () => void; onOpen: (title?: string, meta?: string, score?: string) => void }) {
  const [view, setView] = useState<"received" | "sent" | "watchlist" | "watching" | "completed">("received");
  const [recommendations, setRecommendations] = useState<LiveRecommendation[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [continueWatching, setContinueWatching] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodeGuides, setEpisodeGuides] = useState<Record<string, EpisodeGuide[]>>({});
  const [progressLoading, setProgressLoading] = useState(false);
  const personalList = view === "watchlist" || view === "watching" || view === "completed";

  const load = () => {
    setLoading(true);
    const endpoint = personalList ? `/api/library?status=${view}` : `/api/recommendations?view=${view}`;
    void Promise.all([
      fetch(endpoint).then(response => response.ok ? response.json() as Promise<{ recommendations?: LiveRecommendation[]; entries?: LibraryEntry[] }> : null),
      fetch("/api/library?status=watching").then(response => response.ok ? response.json() as Promise<{ entries?: LibraryEntry[] }> : null),
    ]).then(([data, watching]) => {
      setRecommendations(data?.recommendations ?? []);
      setLibrary(data?.entries ?? []);
      setContinueWatching((watching?.entries ?? []).filter(item => item.type === "tv"));
    }).catch(() => {
      setRecommendations([]); setLibrary([]); setContinueWatching([]);
    }).finally(() => setLoading(false));
  };

  useEffect(load, [view]);

  const updateRecommendation = async (id: string, status: "watching" | "watched") => {
    const response = await fetch("/api/recommendations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) load();
  };
  const rateRecommendation = async (id: string, rating: number) => {
    const response = await fetch("/api/recommendations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, rating }) });
    if (response.ok) load();
  };

  const saveProgress = async (item: LibraryEntry, status: "watching" | "completed" = "watching") => {
    const response = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, type: item.type, name: item.title, year: item.year, posterPath: item.posterPath, status, currentSeason: status === "watching" ? season : null, currentEpisode: status === "watching" ? episode : null }),
    });
    if (response.ok) { setEditing(null); load(); }
  };

  const openProgress = async (item: LibraryEntry) => {
    setEditing(item.id);
    setSeason(item.currentSeason ?? 1);
    setEpisode(item.currentEpisode ?? 1);
    const savedGuide = episodeGuides[item.id];
    if (savedGuide?.length) {
      const savedSeason = savedGuide.find(entry => entry.season === item.currentSeason) ?? savedGuide[0];
      setSeason(savedSeason.season);
      setEpisode(Math.min(Math.max(item.currentEpisode ?? 1, 1), savedSeason.episodes));
      return;
    }
    setProgressLoading(true);
    try {
      const response = await fetch(`/api/tmdb?id=${item.tmdbId}&type=tv`);
      const data = response.ok ? await response.json() as { seasons?: EpisodeGuide[] } : null;
      const guide = data?.seasons ?? [];
      setEpisodeGuides(current => ({ ...current, [item.id]: guide }));
      const selectedSeason = guide.find(entry => entry.season === item.currentSeason) ?? guide[0];
      if (selectedSeason) {
        setSeason(selectedSeason.season);
        setEpisode(Math.min(Math.max(item.currentEpisode ?? 1, 1), selectedSeason.episodes));
      }
    } finally { setProgressLoading(false); }
  };

  const labels = [{ key: "received", label: "For you" }, { key: "sent", label: "Sent" }, { key: "watchlist", label: "Watchlist" }, { key: "watching", label: "Watching" }, { key: "completed", label: "Completed" }] as const;
  const emptyText = view === "sent" ? "You have not sent a recommendation yet." : view === "watchlist" ? "Your watchlist is ready for its first great pick." : view === "watching" ? "Nothing is marked as watching yet." : view === "completed" ? "The titles you finish will appear here." : "No one has recommended something to you yet.";
  const title = personalList ? (view === "watchlist" ? "Your watchlist." : view === "watching" ? "Currently watching." : "Completed picks.") : "From people who get you.";
  const subtitle = personalList ? (view === "watchlist" ? "Your personal list of titles to watch next." : view === "watching" ? "Update an episode as you go. Your Circle can see the TV shows you are currently watching." : "Everything you have finished watching.") : "Keep every personal pick, thoughtful note, and your verdict in one place.";
  const groupedSentRecommendations = Array.from(recommendations.reduce((groups, item) => {
    const recipient = item.person?.displayName ?? "a CineApe member";
    const existing = groups.get(item.titleId);
    if (existing) {
      if (!existing.recipients.includes(recipient)) existing.recipients.push(recipient);
      existing.recipientStatuses.push(item.status);
    } else {
      groups.set(item.titleId, { ...item, recipients: [recipient], recipientStatuses: [item.status] });
    }
    return groups;
  }, new Map<string, SentRecommendation>()).values());
  const displayedRecommendations: Array<LiveRecommendation | SentRecommendation> = view === "sent" ? groupedSentRecommendations : recommendations;
  const sentRecipients = (item: LiveRecommendation | SentRecommendation) => "recipients" in item ? item.recipients.join(", ") : item.person?.displayName ?? "a CineApe member";
  const sentStatus = (item: LiveRecommendation | SentRecommendation) => "recipientStatuses" in item && item.recipientStatuses.every(status => status === "watched") ? "Watched" : "Sent";

  const libraryRow = (item: LibraryEntry) => <article key={item.id} className="tracking-row">
    <button className="inbox-cover library-cover" onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, "—")} aria-label={`Open ${item.title}`}>{item.posterPath && <img src={item.posterPath} alt="" />}</button>
    <div><h3>{item.title}</h3><p>{item.type === "tv" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</p>{item.status === "watching" && item.type === "tv" && <small className="episode-progress">{item.currentSeason && item.currentEpisode ? `Up to S${item.currentSeason} · E${item.currentEpisode}` : "Add your episode progress"}</small>}</div>
    <div className="tracking-actions">
      {item.status === "watching" && item.type === "tv" && <button className="small-ghost" onClick={() => openProgress(item)}>Update progress</button>}
      {item.status === "watching" && <button className="small-primary" onClick={() => void saveProgress(item, "completed")}>Mark completed</button>}
      {editing === item.id && <div className="progress-editor">{progressLoading ? <small>Loading episode guide…</small> : episodeGuides[item.id]?.length ? <><label>Season<select value={season} onChange={event => { const nextSeason = Number(event.target.value); const nextGuide = episodeGuides[item.id].find(entry => entry.season === nextSeason); setSeason(nextSeason); setEpisode(current => Math.min(current, nextGuide?.episodes ?? 1)); }}>{episodeGuides[item.id].map(entry => <option key={entry.season} value={entry.season}>{entry.name}</option>)}</select></label><label>Episode<select value={episode} onChange={event => setEpisode(Number(event.target.value))}>{Array.from({ length: episodeGuides[item.id].find(entry => entry.season === season)?.episodes ?? 0 }, (_, index) => index + 1).map(number => <option key={number} value={number}>Episode {number}</option>)}</select></label><button className="small-primary" onClick={() => void saveProgress(item)}>Save</button></> : <small>Episode information is not available for this show yet.</small>}</div>}
    </div>
  </article>;

  return <section className="page live-inbox tracking-inbox">
    <Intro label={personalList ? "YOUR PERSONAL LISTS" : "YOUR RECOMMENDATIONS"} title={title} text={subtitle} action={null}/>
    {!loading && continueWatching.length > 0 && <section className="continue-watching"><div className="section-title"><div><p className="eyebrow">KEEP GOING</p><h2>Continue watching</h2></div><button onClick={() => setView("watching")}>View all</button></div><div className="continue-watching-list">{continueWatching.slice(0, 4).map(item => <button key={item.id} onClick={() => { setView("watching"); openProgress(item); }}>{item.posterPath ? <img src={item.posterPath} alt="" /> : <span>TV</span>}<div><b>{item.title}</b><small>{item.currentSeason && item.currentEpisode ? `S${item.currentSeason} · E${item.currentEpisode}` : "Add episode progress"}</small></div></button>)}</div></section>}
    <div className="tabs live-tabs">{labels.map(tab => <button key={tab.key} className={view === tab.key ? "chosen" : ""} onClick={() => setView(tab.key)}>{tab.label}</button>)}</div>
    {loading ? <div className="panel inbox-loading">Loading your list…</div> : personalList ? library.length ? <div className="panel inbox live-inbox-list personal-library-list tracking-library">{library.map(libraryRow)}</div> : <div className="panel inbox-empty"><div><b>{emptyText}</b><p>Open a title and add it to this personal list whenever you want to come back to it.</p></div></div> : displayedRecommendations.length ? <div className="panel inbox live-inbox-list">{displayedRecommendations.map(item => <article key={item.id}><button className="inbox-cover" onClick={() => onOpen(item.title, `${item.year ?? "—"} · ${item.type === "tv" ? "TV series" : "Movie"}`, "—")} aria-label={`Open ${item.title}`}>{item.posterPath && <img src={item.posterPath} alt="" />}</button><div><h3>{item.title}</h3><p>{view === "sent" ? "Sent to" : "From"} <b>{view === "sent" ? sentRecipients(item) : item.person?.displayName ?? "a CineApe member"}</b> · {item.type === "tv" ? "TV series" : "Movie"}{item.year ? ` · ${item.year}` : ""}</p>{item.note && <em>“{item.note}”</em>}</div>{view === "received" ? <div className="recommendation-actions">{item.status === "pending" && <button className="small-primary" onClick={() => void updateRecommendation(item.id, "watching")}>Start watching</button>}{item.status === "watching" && <button className="small-primary" onClick={() => void updateRecommendation(item.id, "watched")}>Mark watched</button>}{item.status === "watched" && !item.recommendationScore && <div className="recommendation-followup"><span>How was their pick?</span><div>{[1, 2, 3, 4, 5].map(rating => <button key={rating} onClick={() => void rateRecommendation(item.id, rating)} aria-label={`Rate ${rating} out of 5`}>{rating}</button>)}</div></div>}{item.status === "watched" && item.recommendationScore && <small className="recommendation-rated">You rated this pick {item.recommendationScore}/5</small>}</div> : <strong className="rec-status">{view === "sent" ? sentStatus(item) : item.status === "watched" ? "Watched" : "Sent"}</strong>}</article>)}</div> : <div className="panel inbox-empty"><div><b>{emptyText}</b><p>Invite your people and share your first recommendation when you find a title they will love.</p></div><button className="primary" onClick={onInvite}>Invite people</button></div>}
  </section>;
}
type LiveTitle = { id: number; type: "movie" | "tv"; title: string; overview: string; year: string | null; poster: string | null; tmdbScore: number | null; tmdbVotes: number; runtime: number | null; genres: string[]; trailer: string | null; cast: Array<{ name: string; character: string; image: string | null }>; country: "CA" | "US"; providers: Array<{ name: string; image: string | null }>; providerLink?: string | null };
type CommunityReview = { score: number; review: string | null; createdAt: string; displayName: string; avatarUrl: string | null; slug?: string };
type OfficialReview = CommunityReview & { slug: string };
type PersonalStatus = "watchlist" | "watching" | "completed" | null;

function TitleDetailsLegacy({ selection, onBack, onRecommend, onAddToGroup }: { selection: TitleSelection; onBack: () => void; onRecommend: (title: ShareTitle) => void; onAddToGroup: (title: ShareTitle) => void }) {
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
    const selectedMatch = selection.tmdbId && selection.type
      ? Promise.resolve({ id: selection.tmdbId, type: selection.type })
      : fetch(`/api/tmdb?query=${encodeURIComponent(selection.title)}`).then(response => response.ok ? response.json() : null);
    void selectedMatch
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
        const communityData = await reviewResponse.json() as { reviews: CommunityReview[]; officialReviews?: OfficialReview[]; average: number | null; count: number };
        if (active) { setReviews([...(communityData.officialReviews ?? []), ...communityData.reviews]); setCommunity({ average: communityData.average, count: communityData.count }); }
      }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection.title, selection.tmdbId, selection.type]);

  const saveReview = async () => {
    if (!details) return;
    setSaving(true); setMessage("");
    const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, score, review }) });
    if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; setMessage(data?.error ?? "Your review could not be saved."); setSaving(false); return; }
    setMessage("Your CineApe review is live."); setSaving(false);
    const refresh = await fetch(`/api/reviews?tmdbId=${details.id}&type=${details.type}`);
    if (refresh.ok) { const data = await refresh.json() as { reviews: CommunityReview[]; officialReviews?: OfficialReview[]; average: number | null; count: number }; setReviews([...(data.officialReviews ?? []), ...data.reviews]); setCommunity({ average: data.average, count: data.count }); }
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
  return <section className="page live-title-page"><button className="back-link" onClick={onBack}>← Back to discover</button>{loading && <div className="panel title-loading">Loading live title details…</div>}{!loading && details && <><div className="live-title-head"><div className="live-poster">{details.poster ? <img src={details.poster} alt={`${shownTitle} poster`} /> : <span>{shownTitle}</span>}{personalStatus && <span className={`library-poster-badge ${personalStatus}`} title={personalLabel}>{personalIcon}</span>}</div><div className="live-title-copy"><p className="eyebrow">{details.type === "tv" ? "TV SERIES" : "MOVIE"} · {details.year ?? "—"}</p><h1>{shownTitle}</h1><p className="muted">{details.runtime ? `${details.runtime} min · ` : ""}{details.genres.join(" · ")}</p><div className="where-to-watch"><span>Where to watch</span>{details.providers.length ? <div>{details.providers.map(provider => <div className="provider" key={provider.name}>{provider.image ? <img src={provider.image} alt="" /> : <i>{provider.name.slice(0, 1)}</i>}<small>{provider.name}</small></div>)}{details.providerLink && <a href={details.providerLink} target="_blank" rel="noreferrer">View options ↗</a>}</div> : <p>Availability is not listed for this title yet.</p>}</div><div className="score-cards"><div><b>{community.average ?? "—"}</b><span>CineApe Rating<br/>{community.count ? `${community.count} public review${community.count === 1 ? "" : "s"}` : "No reviews yet"}</span></div><div><b>—</b><span>Circle Rating<br/>Invite people to unlock</span></div><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><b>{details.tmdbScore ?? "—"}</b><span>TMDB score<br/>{details.tmdbVotes.toLocaleString()} votes</span></a></div><p className="live-overview">{details.overview || "A synopsis is not available for this title yet."}</p><div className="live-title-actions"><button className={`secondary library-action ${personalStatus ?? ""}`} onClick={() => void advancePersonalStatus()} disabled={savingPersonalStatus}><span>{personalIcon}</span>{savingPersonalStatus ? "Saving…" : personalLabel}</button><button className="primary" onClick={() => onRecommend({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, posterPath: details.poster })}>✦ Recommend to someone</button><button className="secondary" onClick={() => onAddToGroup({ tmdbId: details.id, type: details.type, name: details.title, year: details.year ? Number(details.year) : null, posterPath: details.poster })}>+ Add to group list</button><button className="secondary" onClick={() => document.getElementById("write-review")?.scrollIntoView({ behavior: "smooth" })}>☆ Write a review</button></div></div></div>{details.trailer && <section className="trailer-section"><div className="section-title"><h2>Official trailer</h2><span>From TMDB</span></div><div className="trailer-frame"><iframe src={details.trailer} title={`${shownTitle} official trailer`} allowFullScreen /></div></section>}<section className="cast-section"><div className="section-title"><h2>Cast</h2><span>{details.cast.length ? "From TMDB" : "Cast information unavailable"}</span></div><div className="cast-grid">{details.cast.map(person => <article key={`${person.name}-${person.character}`}><div>{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}</div><b>{person.name}</b><small>{person.character || "Cast"}</small></article>)}</div></section><section className="community-section"><div className="section-title"><div><p className="eyebrow">PUBLIC ON CINEAPE</p><h2>Community reviews</h2></div><span>Everyone can read these</span></div><div className="review-layout"><form className="write-review panel" id="write-review" onSubmit={event => { event.preventDefault(); void saveReview(); }}><h3>Rate {shownTitle}</h3><p>Your review will be visible to all CineApe members.</p><div className="rating-buttons">{[1,2,3,4,5,6,7,8,9,10].map(value => <button type="button" className={score === value ? "chosen" : ""} key={value} onClick={() => setScore(value)}>{value}</button>)}</div><textarea value={review} onChange={event => setReview(event.target.value)} placeholder="What did you think? Keep it helpful and spoiler-aware." maxLength={2000}/><button className="primary wide" disabled={saving}>{saving ? "Publishing…" : "Publish my review"}</button>{message && <small className="review-message">{message}</small>}</form><div className="public-reviews">{reviews.length ? reviews.map(item => <article className="panel" key={`${item.displayName}-${item.createdAt}`}><div className="review-author">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span>{item.displayName.slice(0, 1)}</span>}<div><b>{item.displayName}</b><small>{item.slug ? "Official CineApe review" : "Public CineApe review"}</small></div><strong>{item.score}/10</strong></div>{item.review ? <p>{item.review}</p> : <p className="muted">Rated this title without a written review.</p>}{item.slug && <a className="circle-editor-link" href={`/reviews/${item.slug}`} target="_blank" rel="noreferrer">Read the full CineApe review ↗</a>}</article>) : <div className="empty-reviews panel"><b>Be the first to review it.</b><p>Your score will begin the CineApe community rating for this title.</p></div>}</div></div></section></>}</section>;
}
type FilmCredit = { id: number; type: "movie" | "tv"; title: string; year: string | null; image: string | null; character: string };
type Filmography = { id: number; name: string; image: string | null; department: string; biography: string; filmography: { movies: FilmCredit[]; tv: FilmCredit[] } };

function mobileTrailerSource(src: string) {
  const trailerUrl = new URL(src);
  trailerUrl.searchParams.set("autoplay", "0");
  trailerUrl.searchParams.set("playsinline", "0");
  trailerUrl.searchParams.set("enablejsapi", "1");
  trailerUrl.searchParams.set("fs", "1");
  if (typeof window !== "undefined") trailerUrl.searchParams.set("origin", window.location.origin);
  return trailerUrl.toString();
}

function TitleDetails({ selection, onBack, onOpenTitle, onRecommend, onAddToGroup }: { selection: TitleSelection; onBack: () => void; onOpenTitle: (title: string, meta: string, score: string) => void; onRecommend: (title: ShareTitle) => void; onAddToGroup: (title: ShareTitle) => void }) {
  const [castName, setCastName] = useState<string | null>(null);
  const [mobileTrailer, setMobileTrailer] = useState<string | null>(null);
  const onTitleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest(".cast-grid article");
    const name = card?.querySelector("b")?.textContent?.trim();
    if (name) { setCastName(name); return; }
    const poster = target?.closest(".live-poster");
    if (!poster || !window.matchMedia("(max-width: 620px)").matches) return;
    const player = poster.closest(".live-title-page")?.querySelector<HTMLIFrameElement>(".trailer-frame iframe");
    if (!player) return;
    player.src = mobileTrailerSource(player.src);
    const playerOrigin = new URL(player.src).origin;
    const playCommand = JSON.stringify({ event: "command", func: "playVideo", args: [] });
    // Calling fullscreen on the actual YouTube iframe is the browser equivalent
    // of tapping YouTube's expand control, rather than merely enlarging our page.
    if (player.requestFullscreen) {
      void player.requestFullscreen().catch(() => setMobileTrailer(player.src));
    } else {
      setMobileTrailer(player.src);
    }
    [0, 180, 500, 1000, 1800].forEach(delay => window.setTimeout(() => player.contentWindow?.postMessage(playCommand, playerOrigin), delay));
  };
  return <div className="cast-click-zone" onClick={onTitleClick}><TitleDetailsLegacy selection={selection} onBack={onBack} onRecommend={onRecommend} onAddToGroup={onAddToGroup}/>{castName && <CastFilmographyModal name={castName} onClose={() => setCastName(null)} onOpenTitle={onOpenTitle}/>} {mobileTrailer && <MobileTrailerModal src={mobileTrailer} title={selection.title} onClose={() => setMobileTrailer(null)}/>}</div>;
}

function MobileTrailerModal({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  // Fallback for browsers that do not allow an iframe to enter native fullscreen.
  const trailerUrl = new URL(src);
  trailerUrl.hostname = "www.youtube-nocookie.com";
  trailerUrl.searchParams.set("autoplay", "1");
  trailerUrl.searchParams.set("mute", "0");
  trailerUrl.searchParams.set("playsinline", "0");
  trailerUrl.searchParams.set("enablejsapi", "1");
  trailerUrl.searchParams.set("fs", "0");
  trailerUrl.searchParams.set("rel", "0");
  trailerUrl.searchParams.set("modestbranding", "1");
  if (typeof window !== "undefined") trailerUrl.searchParams.set("origin", window.location.origin);
  const autoplaySrc = trailerUrl.toString();
  const close = onClose;
  const startPlayback = (frame: HTMLIFrameElement) => {
    // Repeat the requested start after YouTube initializes. The original poster
    // tap is the user gesture that permits playback with sound where supported.
    const playCommand = JSON.stringify({ event: "command", func: "playVideo", args: [] });
    [80, 350, 900, 1500].forEach(delay => window.setTimeout(() => {
      frame.contentWindow?.postMessage(playCommand, trailerUrl.origin);
    }, delay));
  };
  return <div className="backdrop mobile-trailer-backdrop" onClick={close}><div className="mobile-trailer-modal" onClick={event => event.stopPropagation()}><button className="mobile-trailer-close" onClick={close} aria-label="Close trailer">×</button><iframe key={autoplaySrc} src={autoplaySrc} title={`${title} official trailer`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={event => startPlayback(event.currentTarget)} /></div></div>;
}

function CastFilmographyModal({ name, onClose, onOpenTitle }: { name: string; onClose: () => void; onOpenTitle: (title: string, meta: string, score: string) => void }) {
  const [person, setPerson] = useState<Filmography | null>(null); const [tab, setTab] = useState<"movies" | "tv">("movies"); const [error, setError] = useState("");
  useEffect(() => { let active = true; setPerson(null); setError(""); void fetch(`/api/tmdb?person=${encodeURIComponent(name)}`).then(response => response.ok ? response.json() as Promise<Filmography> : response.json().then((data: { error?: string }) => Promise.reject(new Error(data.error ?? "Filmography unavailable.")))).then(data => { if (active) setPerson(data); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Filmography unavailable."); }); return () => { active = false; }; }, [name]);
  const credits = person?.filmography[tab] ?? [];
  const openCredit = (credit: FilmCredit) => { onClose(); onOpenTitle(credit.title, `${credit.year ?? "—"} · ${credit.type === "tv" ? "TV series" : "Movie"}`, "—"); };
  return <div className="backdrop" onClick={onClose}><div className="modal cast-filmography-modal" onClick={event => event.stopPropagation()}><button className="close" onClick={onClose}>×</button>{!person && !error && <p className="share-empty">Loading {name}'s filmography…</p>}{error && <p className="share-empty">{error}</p>}{person && <><div className="filmography-heading">{person.image ? <img src={person.image} alt="" /> : <span>{person.name.slice(0, 1)}</span>}<div><p className="eyebrow">{person.department}</p><h2>{person.name}</h2>{person.biography && <p>{person.biography}</p>}</div></div><div className="tabs filmography-tabs"><button className={tab === "movies" ? "chosen" : ""} onClick={() => setTab("movies")}>Movies <span>{person.filmography.movies.length}</span></button><button className={tab === "tv" ? "chosen" : ""} onClick={() => setTab("tv")}>TV series <span>{person.filmography.tv.length}</span></button></div>{credits.length ? <div className="filmography-grid">{credits.map(credit => <article key={`${credit.type}-${credit.id}`} className="filmography-card" role="button" tabIndex={0} onClick={() => openCredit(credit)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCredit(credit); } }} aria-label={`Open ${credit.title}`}><div>{credit.image ? <img src={credit.image} alt="" /> : <span>{credit.title.slice(0, 1)}</span>}</div><b>{credit.title}</b><small>{credit.year ?? "—"}{credit.character ? ` · ${credit.character}` : ""}</small></article>)}</div> : <p className="profile-empty">No {tab === "tv" ? "TV series" : "movies"} listed.</p>}</>}</div></div>;
}

function Intro({label,title,text,action}:{label:string,title:string,text:string,action:React.ReactNode}) { return <div className="intro"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Tabs({labels}:{labels:string[]}) { const [chosen,setChosen]=useState(0); return <div className="tabs">{labels.map((x,i)=><button onClick={()=>setChosen(i)} className={chosen===i?"chosen":""} key={x}>{x}</button>)}</div>; }
function MiniRec({title,person,tone,label}:{title:string,person:string,tone:string,label:string}) { return <div className="mini-rec"><span className={`mini-cover ${tone}`}></span><p><b>{title}</b><span><strong>{person}</strong> thinks you’ll love it</span></p><small>{label}</small></div>; }
function Friend({name, initials, match, tone=""}:{name:string,initials:string,match:string,tone?:string}) { return <div className="friend"><Avatar tone={tone}>{initials}</Avatar><p><b>{name}</b><span>{match} match for you</span></p><strong>{match}</strong></div>; }
function Group({icon,name,info,pink,green}:{icon:string,name:string,info:string,pink?:boolean,green?:boolean}) { return <article className={`panel group ${pink?"pink":""} ${green?"green":""}`}><i>{icon}</i><h3>{name}</h3><p>{info}</p><div><Avatar>SB</Avatar><Avatar tone="blue-tone">MR</Avatar><Avatar tone="rose-tone">JB</Avatar></div><button>Open group →</button></article>; }
function Activity({who,initial,text,time}:{who:string,initial:string,text:string,time:string}) { return <div className="activity-row"><Avatar>{initial}</Avatar><p><b>{who}</b> {text}<span>“The cast is perfect.”</span></p><time>{time}</time></div>; }
