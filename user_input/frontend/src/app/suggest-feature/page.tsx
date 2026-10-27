import type { Metadata } from "next";
import { ArrowLeft, Clock3, HeartHandshake, Lightbulb } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SubmissionForm } from "@/components/SubmissionForm";

export const metadata: Metadata = { title: "Suggest a feature — KonBus Community Desk" };

export default function SuggestFeaturePage() {
  return (
    <div className="app-shell">
      <SiteHeader active="feature" />
      <main className="inner-page page-wrap">
        <Link href="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to overview</Link>
        <div className="form-page-heading">
          <span className="eyebrow"><span className="eyebrow-dot" /> IDEAS & IMPROVEMENTS</span>
          <h1>What would make<br />your ride <em>easier?</em></h1>
          <p>Share a feature idea for KonBus. Small details can make a big difference to a daily commute.</p>
        </div>
        <div className="form-layout">
          <aside className="form-side-note feature-side-note">
            <div className="side-note-icon"><HeartHandshake size={20} aria-hidden="true" /></div>
            <span className="side-note-label">A GOOD IDEA STARTS HERE</span>
            <h2>Tell us the why, not just the what.</h2>
            <p>What are you trying to do? What feels difficult today? A little context helps us understand how your idea could help passengers.</p>
            <div className="side-note-divider" />
            <div className="side-note-tip"><Clock3 size={15} aria-hidden="true" /><span>Usually takes about 2 minutes</span></div>
            <div className="side-note-tip"><Lightbulb size={15} aria-hidden="true" /><span>Rough ideas are welcome too</span></div>
          </aside>
          <SubmissionForm kind="feature" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
