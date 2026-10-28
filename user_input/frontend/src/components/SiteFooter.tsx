import Link from "next/link";
import { BusFront, Heart } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Link href="/" className="footer-brand"><BusFront size={17} aria-hidden="true" /> Cholo Community Desk</Link>
        <p>Local knowledge makes better journeys. <Heart size={13} aria-label="with care" /></p>
        <Link href="/admin/login" className="footer-admin">Admin access</Link>
      </div>
    </footer>
  );
}
