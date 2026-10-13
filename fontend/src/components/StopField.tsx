"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Footprints, MapPin } from "lucide-react";
import { searchStops } from "@/lib/timetables";

export function StopField({
  id,
  label,
  value,
  onChange,
  error,
  destination = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  destination?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Typo-tolerant search that also understands short names and Bengali spellings.
  const matches = useMemo(() => searchStops(value).map((result) => result.name), [value]);

  function select(stop: string) {
    onChange(stop);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div
      className={`stop-field ${error ? "has-error" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="field-shell">
        <span className={`field-marker ${destination ? "destination" : "origin"}`} aria-hidden="true">
          <MapPin size={19} strokeWidth={2.3} />
        </span>
        <div className="field-content">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type="text"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={(event) => {
              setOpen(true);
              event.currentTarget.select();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "ArrowDown" && open) {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
              }
              if (event.key === "ArrowUp" && open) {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && open && matches.length > 0) {
                event.preventDefault();
                select(matches[activeIndex] ?? matches[0]);
              }
            }}
            placeholder="Choose a bus stop"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-suggestions`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        <ChevronDown size={16} className={`field-chevron ${open ? "rotated" : ""}`} aria-hidden="true" />
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
      {open && (
        <div className="suggestions" id={`${id}-suggestions`} role="listbox" aria-label={`${label} suggestions`}>
          {matches.length ? (
            matches.map((stop, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`suggestion ${index === activeIndex ? "active" : ""}`}
                key={stop}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => select(stop)}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>{stop}</span>
                {stop.toLowerCase() === value.trim().toLowerCase() && <Check size={15} aria-hidden="true" />}
              </button>
            ))
          ) : (
            <p className="suggestion-empty">No stops found. Try another Kolkata stop.</p>
          )}
          {matches.length > 0 && (
            <p className="suggestion-hint"><Footprints size={12} aria-hidden="true" /> Tap a stop, or use ↑ ↓ then Enter</p>
          )}
        </div>
      )}
    </div>
  );
}
