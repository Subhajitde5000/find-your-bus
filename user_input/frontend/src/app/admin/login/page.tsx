"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { checkAdminSession, signIn } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    checkAdminSession()
      .then(() => { if (active) router.replace("/admin"); })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn(username, password);
      router.replace("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader active="admin" />
      <main className="admin-auth-wrap page-wrap">
        <Link href="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to community desk</Link>
        <section className="admin-auth-card">
          <div className="admin-auth-emblem"><LockKeyhole size={23} aria-hidden="true" /></div>
          <span className="eyebrow"><span className="eyebrow-dot" /> PRIVATE ADMIN AREA</span>
          <h1>Welcome back.</h1>
          <p className="admin-auth-intro">Sign in to review community submissions.</p>
          {checking ? (
            <div className="auth-loading" role="status">Checking your session…</div>
          ) : (
            <form className="admin-login-form" onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="admin-username">Username</label>
                <input id="admin-username" className="form-control" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Admin username" />
              </div>
              <div className="field-group">
                <label htmlFor="admin-password">Password</label>
                <input id="admin-password" className="form-control" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" />
              </div>
              {error && <div className="form-error" role="alert"><ShieldCheck size={16} aria-hidden="true" /> {error}</div>}
              <button className="button-primary login-submit" type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in to review"} {!loading && <ArrowRight size={16} aria-hidden="true" />}
              </button>
              <p className="auth-security-note"><LockKeyhole size={13} aria-hidden="true" /> This area is for the Cholo admin only.</p>
            </form>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
