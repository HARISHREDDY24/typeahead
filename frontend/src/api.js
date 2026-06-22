const BASE = "/api"; // proxied to http://localhost:4000 by Vite

export async function fetchSuggestions(prefix, signal) {
    const res = await fetch(`${BASE}/suggest?q=${encodeURIComponent(prefix)}`, { signal });
    if (!res.ok) throw new Error(`suggest failed: ${res.status}`);
    return res.json();
}

export async function submitSearch(query) {
    const res = await fetch(`${BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
}

export async function fetchTrending(limit = 10) {
    const res = await fetch(`${BASE}/trending?limit=${limit}`);
    if (!res.ok) throw new Error(`trending failed: ${res.status}`);
    return res.json();
}

export async function fetchMetrics() {
    const res = await fetch(`${BASE}/metrics`);
    if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
    return res.json();
}