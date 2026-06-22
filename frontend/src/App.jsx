import { useState, useEffect, useRef, useCallback } from "react";
import { fetchSuggestions, submitSearch, fetchTrending } from "./api";
import Metrics from "./Metrics";
import "./style.css";

export default function App() {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [trending, setTrending] = useState([]);
  const abortRef = useRef(null);

  // Debounced suggestion fetch
  useEffect(() => {
    const q = input.trim();
    if (!q) { setSuggestions([]); setActive(-1); return; }
    const t = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true); setError("");
      try {
        const data = await fetchSuggestions(q, controller.signal);
        setSuggestions(data.suggestions); setActive(-1);
      } catch (e) {
        if (e.name !== "AbortError") setError("Could not load suggestions.");
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  // Trending: load once + refresh every 5s
  const loadTrending = useCallback(async () => {
    try { const data = await fetchTrending(10); setTrending(data.trending); } catch { }
  }, []);
  useEffect(() => {
    loadTrending();
    const id = setInterval(loadTrending, 5000);
    return () => clearInterval(id);
  }, [loadTrending]);

  const doSearch = useCallback(async (query) => {
    const q = (query ?? input).trim();
    if (!q) return;
    setError("");
    try {
      const result = await submitSearch(q);
      setSearchResult(result);
      setSuggestions([]); setActive(-1);
      setTimeout(loadTrending, 300);
    } catch { setError("Search failed."); }
  }, [input, loadTrending]);

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      if (active >= 0 && suggestions[active]) { const c = suggestions[active].query; setInput(c); doSearch(c); }
      else doSearch();
    } else if (e.key === "Escape") { setSuggestions([]); setActive(-1); }
  }

  return (
    <div className="container">
      <h1>Search Typeahead</h1>

      <div className="search-box">
        <input
          type="text" value={input} placeholder="Start typing… e.g. iph"
          onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} autoFocus
        />
        <button onClick={() => doSearch()}>Search</button>
        {loading && <div className="hint">Loading…</div>}
        {error && <div className="error">{error}</div>}
        {suggestions.length > 0 && (
          <ul className="dropdown">
            {suggestions.map((s, i) => (
              <li key={s.query} className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => { setInput(s.query); doSearch(s.query); }}>
                <span>{s.query}</span>
                <span className="count">{s.count?.toLocaleString?.() ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searchResult && (
        <div className="result">
          <strong>{searchResult.message}</strong>: “{searchResult.query}”
        </div>
      )}

      <div className="trending">
        <h2>🔥 Trending</h2>
        {trending.length === 0 ? <div className="hint">No trending data yet — try some searches.</div> : (
          <ol>
            {trending.map((t) => (
              <li key={t.query} onClick={() => { setInput(t.query); doSearch(t.query); }}>
                <span>{t.query}</span>
                <span className="count">score {t.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Metrics />
    </div>
  );
}