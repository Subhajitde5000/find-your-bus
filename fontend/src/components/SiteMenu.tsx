"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusFront, ChevronRight, Info, Lightbulb, MapPin, Menu, Route, Search, X } from "lucide-react";

/*
 * The navigation drawer for phones and tablets.
 *
 * Above 900px the site header shows its links inline. Below that the links have nowhere to
 * go, so this drawer takes over: a button in the header opens a panel from the left with the
 * same items, the stop map among them. The button is hidden by CSS above 900px, so a desktop
 * never sees any of it.
 *
 * The panel is a portal into <body>. The header it hangs from is sticky and has a
 * backdrop-filter, and either of those would make a fixed-position child lay itself out
 * inside a 58px box instead of over the page.
 *
 * Escape closes it, the scrim closes it, following a link closes it, and the page behind it
 * does not scroll while it is open.
 */

export interface SiteMenuItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Marked as the current page. */
  active?: boolean;
  /** Runs before navigating: the home page uses it to switch its search mode. */
  onSelect?: () => void;
}

interface Props {
  /** Defaults to the site's own links. */
  items?: SiteMenuItem[];
  /** Reports which kind of search was chosen, so the home page can open that form. */
  onChooseSearch?: (mode: "journey" | "route") => void;
}

const MENU_ID = "site-menu";

export function SiteMenu({ items, onChooseSearch }: Props) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back to the button, so the next Tab continues from where it started.
    trigger.current?.focus();
  }, []);
  const openMenu = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // The page behind the drawer does not scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    // Turning a tablet to landscape, or widening a window, leaves the drawer behind.
    const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 901px)") : null;
    const onResize = () => {
      if (wide?.matches) setOpen(false);
    };
    wide?.addEventListener?.("change", onResize);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      wide?.removeEventListener?.("change", onResize);
    };
  }, [open]);

  const links: SiteMenuItem[] = items ?? [
    { href: "/", label: "Home", icon: <BusFront size={18} aria-hidden="true" />, active: pathname === "/" },
    {
      href: "/#search",
      label: "Find a bus",
      icon: <Search size={18} aria-hidden="true" />,
      onSelect: () => onChooseSearch?.("journey"),
    },
    {
      href: "/#route",
      label: "Bus route number",
      icon: <Route size={18} aria-hidden="true" />,
      onSelect: () => onChooseSearch?.("route"),
    },
    { href: "/map", label: "Stop map", icon: <MapPin size={18} aria-hidden="true" />, active: pathname === "/map" },
    { href: "/#how-it-works", label: "How it works", icon: <Lightbulb size={18} aria-hidden="true" /> },
    { href: "/#about", label: "About", icon: <Info size={18} aria-hidden="true" /> },
  ];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="site-menu-trigger"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={openMenu}
      >
        <Menu size={19} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <>
            <div className="site-menu-scrim" onClick={close} aria-hidden="true" />
            <aside
              id={MENU_ID}
              ref={panel}
              className="site-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              tabIndex={-1}
            >
              <div className="site-menu-head">
                <span className="site-menu-brand">
                  <span className="brand-mark">
                    <BusFront size={19} strokeWidth={2.1} aria-hidden="true" />
                  </span>
                  <span className="site-menu-words">
                    <strong>
                      cholo<span>.</span>
                    </strong>
                    <small>KOLKATA BUS GUIDE</small>
                  </span>
                </span>
                <button type="button" className="site-menu-close" aria-label="Close navigation menu" onClick={close}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <nav className="site-menu-nav" aria-label="Main navigation">
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`site-menu-link${item.active ? " active" : ""}`}
                    aria-current={item.active ? "page" : undefined}
                    onClick={() => {
                      item.onSelect?.();
                      setOpen(false);
                    }}
                  >
                    <span className="site-menu-icon">{item.icon}</span>
                    <span className="site-menu-label">{item.label}</span>
                    <ChevronRight className="site-menu-chevron" size={16} aria-hidden="true" />
                  </Link>
                ))}
              </nav>

              <p className="site-menu-foot">Timetables are bundled with this site. Not live tracking.</p>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
