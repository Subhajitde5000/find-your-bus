import Link from "next/link";
import {
  ArrowRight,
  BusFront,
  Check,
  CircleHelp,
  ClipboardCheck,
  Lightbulb,
  MapPinned,
  MessageSquareText,
  Route,
  Sparkles,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <div className="app-shell">
      <SiteHeader active="home" />
      <main>
        <section className="landing-hero page-wrap">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> A BETTER BUS GUIDE, TOGETHER</span>
            <h1>Help Kolkata<br />move <em>better.</em></h1>
            <p className="hero-description">
              Your local knowledge makes Pathsathi more useful for everyone. Share an idea, flag a gap in the bus network, or help us correct something that is off.
            </p>
            <div className="hero-assurance">
              <span><Check size={15} aria-hidden="true" /> Every submission is reviewed</span>
              <span><Check size={15} aria-hidden="true" /> No account needed</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Illustration of a Kolkata bus route">
            <div className="hero-art-top"><span className="art-live-dot" /> COMMUNITY SIGNAL</div>
            <div className="route-art">
              <svg viewBox="0 0 520 250" role="img" aria-label="A route connecting three stops">
                <path d="M52 185 C120 185 130 92 218 92 S330 168 455 50" />
                <path className="route-art-shadow" d="M52 185 C120 185 130 92 218 92 S330 168 455 50" />
              </svg>
              <span className="art-stop stop-a"><MapPinned size={16} /></span>
              <span className="art-stop stop-b"><BusFront size={17} /></span>
              <span className="art-stop stop-c"><Sparkles size={15} /></span>
              <span className="art-label label-a">ESPLANADE</span>
              <span className="art-label label-b">YOUR INPUT</span>
              <span className="art-label label-c">A BETTER ROUTE</span>
            </div>
            <div className="hero-art-bottom"><span>ONE CITY</span><span className="art-bottom-line" /><span>MANY WAYS TO HELP</span></div>
          </div>
        </section>

        <section className="contribution-section page-wrap" aria-labelledby="contribution-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CHOOSE HOW TO HELP</span>
              <h2 id="contribution-title">Two ways to make a difference<span className="accent-dot">.</span></h2>
            </div>
            <p>Pick the path that fits what you want to share. It only takes a minute.</p>
          </div>

          <div className="portal-grid">
            <Link href="/suggest-feature" className="portal-card feature-card">
              <div className="portal-card-head"><span className="portal-icon"><Lightbulb size={22} aria-hidden="true" /></span><span className="portal-number">01</span></div>
              <span className="portal-kicker">IDEAS & IMPROVEMENTS</span>
              <h3>Suggest a feature</h3>
              <p>Have an idea that would make planning a bus trip easier, clearer, or more inclusive? We would love to hear it.</p>
              <span className="portal-action">Share an idea <ArrowRight size={16} aria-hidden="true" /></span>
            </Link>
            <Link href="/report-data" className="portal-card report-card">
              <div className="portal-card-head"><span className="portal-icon"><Route size={22} aria-hidden="true" /></span><span className="portal-number">02</span></div>
              <span className="portal-kicker">ROUTES, BUSES & STOPS</span>
              <h3>Report bus information</h3>
              <p>Tell us about a missing route, bus, or stop—or share a correction when something in the guide is wrong.</p>
              <span className="portal-action">Report an issue <ArrowRight size={16} aria-hidden="true" /></span>
            </Link>
          </div>
        </section>

        <section className="review-band page-wrap" aria-label="What happens next">
          <div className="review-band-icon"><ClipboardCheck size={22} aria-hidden="true" /></div>
          <div><strong>What happens next?</strong><p>Our team checks each submission against the route information we have before making a change.</p></div>
          <Link href="/report-data">See what you can report <ArrowRight size={15} aria-hidden="true" /></Link>
        </section>

        <section className="help-note page-wrap">
          <span className="help-note-icon"><CircleHelp size={18} aria-hidden="true" /></span>
          <p><strong>Know a route by heart?</strong> That local detail is exactly what helps us keep the guide useful for the next passenger.</p>
          <span className="help-note-mark"><MessageSquareText size={20} aria-hidden="true" /></span>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
