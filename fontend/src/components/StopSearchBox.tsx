"use client";

import { useId, useMemo, useState } from "react";
import { MapPinOff, Search, X } from "lucide-react";
import { searchStops, STOP_INDEX, type StopIndex } from "@/lib/stopIndex";

interface Props {
  /** Called with the stop's exact name. */
  onPick: (name: string) => void;
  index?: StopIndex;
  /** Only offer these stops, for example the stops of one route. */
  only?: Set<string>;
  placeholder?: string;
  label?: string;
}

/** A stop search with a short list of matches. Works with keyboard and touch. */
export function StopSearchBox({ onPick, index = STOP_INDEX, only, placeholder = "Search a stop", label = "Search a stop" }: Props) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const hits = useMemo(() => {
    const all = searchStops(index, query, only ? 200 : 8);
    return (only ? all.filter((hit) => only.has(hit.stop.name)) : all).slice(0, 8);
  }, [index, query, only]);
  const open = query.trim().length > 0;

  const pick = (name: string) => {
    onPick(name);
    setQuery("");
  };

  return (
    <div className="stop-search">
      <label className="stop-search-field">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label={label}
          aria-controls={listId}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && hits[0]) {
              event.preventDefault();
              pick(hits[0].stop.name);
            }
            if (event.key === "Escape") setQuery("");
          }}
        />
        {query && (
          <button type="button" className="stop-search-clear" aria-label="Clear the search" onClick={() => setQuery("")}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </label>
      {open && (
        <ul id={listId} className="stop-search-results" role="listbox" aria-label="Matching stops">
          {hits.length === 0 && <li className="stop-search-empty">No stop with that name.</li>}
          {hits.map(({ stop }) => (
            <li key={stop.name} role="option" aria-selected="false">
              <button type="button" onClick={() => pick(stop.name)}>
                <span className="stop-search-name">{stop.name}</span>
                <span className="stop-search-meta">
                  {stop.buses.length} bus{stop.buses.length === 1 ? "" : "es"}
                  {stop.position === null && (
                    <span className="stop-search-off"><MapPinOff size={11} aria-hidden="true" /> not on the map</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
