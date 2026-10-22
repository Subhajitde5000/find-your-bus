"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { NetworkMap } from "@/components/NetworkMap";

/** The /map page: the same compact header as the ride screen, and the all-stops map. */
export function MapPageShell() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <div className="ride-page">
      <header className="ride-header">
        <Link className="ride-back" href="/"><ArrowLeft size={17} /> Home</Link>
        <span className="ride-header-title">Stop map</span>
        <span className={`ride-online ${online ? "" : "off"}`} title={online ? "You are online, but this map does not need it" : "Offline — this map still works"}>
          {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
          {online ? "Online" : "Offline"}
        </span>
      </header>
      <main className="ride-body">
        <NetworkMap />
      </main>
    </div>
  );
}
