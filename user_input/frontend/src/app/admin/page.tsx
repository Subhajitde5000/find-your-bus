"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BusFront,
  Check,
  CircleAlert,
  Clock3,
  Filter,
  Inbox,
  LockKeyhole,
  LogOut,
  MapPin,
  RefreshCw,
  Route,
  Search,
  Sparkles,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { checkAdminSession, loadSubmissions, signOut } from "@/lib/api";
import { FEATURE_AREA_LABELS, ISSUE_LABELS, type SubmissionKind, type SubmissionRecord } from "@/lib/types";

export default function AdminPage() {
  const router = useRouter();
  const [items, setItems] = useState<SubmissionRecord[]>([]);
  const [filter, setFilter] = useState<"all" | SubmissionKind>("all");
  const [query, setQuery] = useState("");
  const [storage, setStorage] = useState("loading");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    checkAdminSession()
      .then(() => { if (active) setChecking(false); })
      .catch(() => { if (active) router.replace("/admin/login"); });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async (kind: "all" | SubmissionKind = filter) => {
    setLoading(true);
    setError("");
    try {
      const result = await loadSubmissions(kind === "all" ? undefined : kind);
      setItems(result.items);
      setStorage(result.storage);
    } catch (caught) {
      if (caught instanceof Error && caught.message.toLowerCase().includes("sign-in")) {
        router.replace("/admin/login");
      } else {
        setError(caught instanceof Error ? caught.message : "Could not load submissions.");
      }
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [filter, router]);

  useEffect(() => {
    if (checking) return;
    const timer = window.setTimeout(() => { void refresh(filter); }, 0);
    return () => window.clearTimeout(timer);
  }, [checking, filter, refresh]);

  async function handleSignOut() {
    setSigningOut(true);
    try { await signOut(); } finally { router.replace("/admin/login"); }
  }

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => [
      item.title,
      item.details,
      item.category ? ISSUE_LABELS[item.category] : "",
      item.feature_area ? FEATURE_AREA_LABELS[item.feature_area] : "",
      item.route_number,
      item.bus_number,
      item.origin,
      item.destination,
      item.stop_name,
      item.operator,
      item.email,
    ].some((value) => value?.toLowerCase().includes(needle)));
  }, [items, query]);

  const featureCount = items.filter((item) => item.kind === "feature").length;
  const reportCount = items.filter((item) => item.kind === "data_report").length;

  if (checking) {
    return (
      <div className="app-shell">
        <SiteHeader active="admin" />
        <main className="admin-loading page-wrap" role="status"><RefreshCw size={18} className="spin" /> Checking admin access…</main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SiteHeader active="admin" />
      <main className="admin-page page-wrap">
        <div className="admin-page-top">
          <div>
            <span className="eyebrow"><span className="eyebrow-dot" /> PRIVATE REVIEW SPACE</span>
            <h1>Community inbox<span className="accent-dot">.</span></h1>
            <p>Review ideas and bus information reports submitted by riders.</p>
          </div>
          <div className="admin-actions">
            <button className="button-secondary" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>
            <button className="button-secondary logout-button" type="button" onClick={handleSignOut} disabled={signingOut}><LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}</button>
          </div>
        </div>

        <div className="admin-stat-grid">
          <div className="admin-stat"><span className="admin-stat-icon mint"><Inbox size={17} /></span><span><strong>{items.length}</strong><small>Showing in inbox</small></span></div>
          <div className="admin-stat"><span className="admin-stat-icon lilac"><Sparkles size={17} /></span><span><strong>{featureCount}</strong><small>Feature ideas</small></span></div>
          <div className="admin-stat"><span className="admin-stat-icon peach"><Route size={17} /></span><span><strong>{reportCount}</strong><small>Bus data reports</small></span></div>
          <div className={`storage-status ${storage === "mongodb" ? "connected" : "memory"}`}>
            <span className="storage-pulse" />
            <span><strong>{storage === "mongodb" ? "MongoDB connected" : storage === "memory" ? "Preview memory mode" : "Checking storage"}</strong><small>{storage === "memory" ? "Set MONGODB_URI to keep submissions" : "Submission storage"}</small></span>
          </div>
        </div>

        {error && <div className="admin-error" role="alert"><CircleAlert size={17} /> {error}</div>}

        <section className="inbox-panel">
          <div className="inbox-toolbar">
            <div className="inbox-heading"><span className="inbox-heading-icon"><ArrowDownToLine size={18} /></span><div><h2>All submissions</h2><p>{visibleItems.length} {visibleItems.length === 1 ? "entry" : "entries"} match your view</p></div></div>
            <label className="admin-search"><Search size={16} aria-hidden="true" /><input aria-label="Search submissions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suggestions…" /></label>
          </div>
          <div className="inbox-filters" role="tablist" aria-label="Filter submissions">
            <span className="filter-label"><Filter size={14} /> Filter</span>
            {(["all", "feature", "data_report"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                {item === "all" ? "All" : item === "feature" ? "Feature ideas" : "Bus data reports"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="inbox-empty"><RefreshCw size={21} className="spin" /><strong>Loading submissions…</strong></div>
          ) : visibleItems.length ? (
            <div className="submission-list">
              {visibleItems.map((item) => <SubmissionEntry key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="inbox-empty"><span className="empty-inbox-icon"><Inbox size={23} /></span><strong>{query ? "No matches found" : "Your inbox is clear"}</strong><p>{query ? "Try another title, route, stop, or email." : "New feature ideas and bus reports will appear here."}</p></div>
          )}
        </section>

        <p className="admin-footnote"><LockKeyhole size={13} /> Signed in to the Cholo Community Desk · <Link href="/">Open public portal <ArrowUpRight size={13} /></Link></p>
      </main>
      <SiteFooter />
    </div>
  );
}

function SubmissionEntry({ item }: { item: SubmissionRecord }) {
  const label = item.kind === "feature"
    ? item.feature_area ? FEATURE_AREA_LABELS[item.feature_area] : "Feature idea"
    : item.category ? ISSUE_LABELS[item.category] : "Bus data report";
  const dateLabel = Number.isNaN(Date.parse(item.created_at))
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at));

  return (
    <article className="submission-entry">
      <div className="entry-topline">
        <span className={`entry-kind ${item.kind === "feature" ? "feature" : "report"}`}>
          {item.kind === "feature" ? <Sparkles size={13} /> : <Route size={13} />} {item.kind === "feature" ? "Feature idea" : "Bus data report"}
        </span>
        <span className="entry-category">{label}</span>
        <span className="entry-date"><Clock3 size={13} /> {dateLabel}</span>
      </div>
      <div className="entry-body">
        <div className="entry-copy"><h3>{item.title}</h3><p>{item.details}</p></div>
        <span className="entry-status"><span /> {item.status === "new" ? "New" : item.status}</span>
      </div>
      {(item.route_number || item.bus_number || item.origin || item.destination || item.stop_name || item.operator || item.context) && (
        <div className="entry-details">
          {item.route_number && <span><Route size={13} /> Route {item.route_number}</span>}
          {item.bus_number && <span><BusFront size={13} /> Bus {item.bus_number}</span>}
          {(item.origin || item.destination) && <span><MapPin size={13} /> {item.origin || "?"} → {item.destination || "?"}</span>}
          {item.stop_name && <span><MapPin size={13} /> Stop: {item.stop_name}</span>}
          {item.direction && <span>Direction: {item.direction}</span>}
          {item.operator && <span>Operator: {item.operator}</span>}
          {item.context && <span>Context: {item.context}</span>}
        </div>
      )}
      <div className="entry-foot"><span>{item.email ? <>Follow-up: <a href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a></> : <><Check size={13} /> No follow-up email provided</>}</span><small>Ref {item.id.slice(0, 8).toUpperCase()}</small></div>
    </article>
  );
}
