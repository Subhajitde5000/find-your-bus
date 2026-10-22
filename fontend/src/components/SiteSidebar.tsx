"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BusFront,
  ChevronRight,
  CircleHelp,
  Info,
  Map,
  MapPin,
  Route,
  Search,
  X,
} from "lucide-react";
import { DATA_COUNTS } from "@/lib/timetables";

type SearchMode = "journey" | "route";

interface SiteSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  searchMode: SearchMode;
  onSetSearchMode: (mode: SearchMode) => void;
}

/** Primary navigation for the bus guide. It becomes a drawer on smaller screens. */
export function SiteSidebar({ isOpen, onClose, searchMode, onSetSearchMode }: SiteSidebarProps) {
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose]);

  function selectMode(mode: SearchMode) {
    onSetSearchMode(mode);
    onClose();
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside id="site-sidebar" className={`site-sidebar ${isOpen ? "is-open" : ""}`} aria-label="Cholo navigation">
        <div className="sidebar-heading">
          <span className="sidebar-heading-icon"><BusFront size={19} strokeWidth={2.2} aria-hidden="true" /></span>
          <span className="sidebar-heading-copy">
            <small>YOUR KOLKATA GUIDE</small>
            <strong>Get moving</strong>
          </span>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <p className="sidebar-label">PLAN YOUR RIDE</p>
        <nav className="sidebar-nav" aria-label="Plan your ride">
          <a
            href="#search"
            className={`sidebar-nav-link ${searchMode === "journey" ? "active" : ""}`}
            aria-current={searchMode === "journey" ? "page" : undefined}
            onClick={() => selectMode("journey")}
          >
            <span className="sidebar-nav-icon"><Search size={17} aria-hidden="true" /></span>
            <span>Find a bus</span>
            <ChevronRight size={15} className="sidebar-nav-chevron" aria-hidden="true" />
          </a>
          <a
            href="#search"
            className={`sidebar-nav-link ${searchMode === "route" ? "active" : ""}`}
            aria-current={searchMode === "route" ? "page" : undefined}
            onClick={() => selectMode("route")}
          >
            <span className="sidebar-nav-icon"><Route size={17} aria-hidden="true" /></span>
            <span>Bus route number</span>
            <ChevronRight size={15} className="sidebar-nav-chevron" aria-hidden="true" />
          </a>
        </nav>

        <p className="sidebar-label sidebar-label-spaced">DISCOVER</p>
        <nav className="sidebar-nav" aria-label="Explore Cholo">
          <Link href="/map" className="sidebar-nav-link" onClick={onClose}>
            <span className="sidebar-nav-icon"><Map size={17} aria-hidden="true" /></span>
            <span>All bus stops</span>
            <ChevronRight size={15} className="sidebar-nav-chevron" aria-hidden="true" />
          </Link>
          <a href="#how-it-works" className="sidebar-nav-link" onClick={onClose}>
            <span className="sidebar-nav-icon"><CircleHelp size={17} aria-hidden="true" /></span>
            <span>How it works</span>
            <ChevronRight size={15} className="sidebar-nav-chevron" aria-hidden="true" />
          </a>
          <a href="#about" className="sidebar-nav-link" onClick={onClose}>
            <span className="sidebar-nav-icon"><Info size={17} aria-hidden="true" /></span>
            <span>About the data</span>
            <ChevronRight size={15} className="sidebar-nav-chevron" aria-hidden="true" />
          </a>
        </nav>

        <div className="sidebar-spacer" />

        <section className="sidebar-network-card" aria-label="Kolkata bus network">
          <span className="sidebar-network-kicker"><span className="city-pulse" aria-hidden="true" /> KOLKATA NETWORK</span>
          <strong>{DATA_COUNTS.routes}<span> routes listed</span></strong>
          <p>{DATA_COUNTS.stops} stops <i aria-hidden="true">·</i> {DATA_COUNTS.stands} bus stands</p>
          <a href="#about" onClick={onClose}>How the data works <ArrowUpRight size={14} aria-hidden="true" /></a>
        </section>

        <div className="sidebar-location">
          <span className="sidebar-location-icon"><MapPin size={16} aria-hidden="true" /></span>
          <span><strong>Kolkata, West Bengal</strong><small>Made for local journeys</small></span>
        </div>
      </aside>
    </>
  );
}
