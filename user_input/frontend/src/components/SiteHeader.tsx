import Link from "next/link";
import { ArrowUpRight, BusFront, LockKeyhole, Sparkles } from "lucide-react";

type ActivePage = "home" | "feature" | "report" | "admin";

export function SiteHeader({ active = "home" }: { active?: ActivePage }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="KonBus Community Desk home">
          <span className="brand-mark"><BusFront size={21} strokeWidth={2.2} aria-hidden="true" /></span>
          <span className="brand-copy">
            <strong>konbus<span>.</span></strong>
            <small>COMMUNITY DESK</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/" className={active === "home" ? "nav-link active" : "nav-link"}>Overview</Link>
          <Link href="/suggest-feature" className={active === "feature" ? "nav-link active" : "nav-link"}>
            <Sparkles size={15} aria-hidden="true" /> Feature ideas
          </Link>
          <Link href="/report-data" className={active === "report" ? "nav-link active" : "nav-link"}>Bus data</Link>
        </nav>
        <Link href={active === "admin" ? "/admin" : "/admin/login"} className="admin-link">
          <LockKeyhole size={15} aria-hidden="true" /> Admin <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
