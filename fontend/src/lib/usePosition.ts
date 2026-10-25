"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPlausibleFix, type GeoFix } from "./geo";

/*
 * One GPS reading for the QR screens, and what to say when there is none.
 *
 * Both QR screens ask for a position once and then stop asking: they are opened for a
 * few seconds at a shelter or on a bus, and a permanent location watch would drain the
 * battery for nothing. "Improve location" asks for a second, more careful reading.
 *
 * A fix outside the service area is rejected by the same rule the ride screen uses, so
 * a phone reporting a stale position in another city cannot put the passenger on a bus
 * in Kolkata.
 */

export type PositionStatus = "idle" | "locating" | "ready" | "denied" | "unavailable" | "unsupported" | "implausible";

export interface PositionState {
  status: PositionStatus;
  fix: GeoFix | null;
  message: string | null;
}

const INITIAL: PositionState = { status: "idle", fix: null, message: null };

export function usePosition() {
  const [state, setState] = useState<PositionState>(INITIAL);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported", fix: null, message: "This browser cannot read a position." });
      return;
    }
    setState({ status: "locating", fix: null, message: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        const fix: GeoFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
          timestamp: position.timestamp || Date.now(),
        };
        if (!isPlausibleFix(fix)) {
          setState({ status: "implausible", fix: null, message: "The position reported was outside Kolkata, so it was ignored." });
          return;
        }
        setState({
          status: "ready",
          fix,
          message: fix.accuracy > 150 ? `Position is rough (about ${Math.round(fix.accuracy)} m).` : null,
        });
      },
      (error) => {
        if (!mounted.current) return;
        if (error.code === error.PERMISSION_DENIED) {
          setState({
            status: "denied",
            fix: null,
            message: "Location is blocked. You can still pick your stop yourself.",
          });
          return;
        }
        setState({
          status: "unavailable",
          fix: null,
          message: error.code === error.TIMEOUT ? "Location timed out. Pick your stop instead." : "No position available. Pick your stop instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);

  return { ...state, locate };
}
