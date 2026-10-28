import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BusFront, CircleAlert, MapPin, Route } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SubmissionForm } from "@/components/SubmissionForm";

export const metadata: Metadata = { title: "Report bus information — Pathsathi Community Desk" };

export default function ReportDataPage() {
  return (
    <div className="app-shell">
      <SiteHeader active="report" />
      <main className="inner-page page-wrap">
        <Link href="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to overview</Link>
        <div className="form-page-heading report-heading">
          <span className="eyebrow"><span className="eyebrow-dot" /> ROUTES, BUSES & STOPS</span>
          <h1>Help keep our bus<br />information <em>right.</em></h1>
          <p>Spot something missing or incorrect? Tell us where it is and what you know. We will review it before updating the guide.</p>
        </div>
        <div className="form-layout">
          <aside className="form-side-note report-side-note">
            <div className="side-note-icon"><CircleAlert size={20} aria-hidden="true" /></div>
            <span className="side-note-label">WHAT CAN YOU REPORT?</span>
            <h2>Every local detail helps.</h2>
            <ul className="report-options">
              <li><Route size={16} aria-hidden="true" /><span>A route that is missing</span></li>
              <li><BusFront size={16} aria-hidden="true" /><span>A bus missing from a route</span></li>
              <li><MapPin size={16} aria-hidden="true" /><span>A stop that should be listed</span></li>
              <li><CircleAlert size={16} aria-hidden="true" /><span>Wrong or outdated information</span></li>
            </ul>
            <div className="side-note-divider" />
            <p className="side-note-small">Please share what you observed, and when. Do not include anyone else&apos;s personal information.</p>
          </aside>
          <SubmissionForm kind="data_report" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
