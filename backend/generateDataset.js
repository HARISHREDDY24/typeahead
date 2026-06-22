import fs from "fs";

const brands = ["iphone", "samsung", "nike", "adidas", "sony", "dell", "hp", "lenovo", "canon", "bosch", "lg", "asus", "apple", "google", "amazon"];
const products = ["charger", "case", "screen", "battery", "cable", "tutorial", "review", "price", "deal", "manual", "driver", "stand", "mount", "adapter", "cover"];
const modifiers = ["15", "16", "pro", "max", "mini", "plus", "2024", "2025", "best", "cheap", "used", "new", "wireless", "fast", "portable"];
const topics = ["java", "python", "react", "node", "sql", "docker", "linux", "aws", "git", "html", "css", "kubernetes", "redis", "mongodb"];
const actions = ["tutorial", "example", "interview questions", "cheat sheet", "roadmap", "vs", "course", "pdf", "documentation", "tips"];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

const set = new Map(); // query -> count (Map dedupes)

function add(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    // Zipf-ish count: short/popular queries get big counts
    const base = Math.floor(Math.random() * 100000) + 1;
    set.set(q, Math.max(set.get(q) || 0, base));
}

// Template 1: brand [+ modifier] [+ product]
for (const b of brands) {
    add(b);
    for (const m of modifiers) {
        add(`${b} ${m}`);
        for (const p of products) add(`${b} ${m} ${p}`);
    }
    for (const p of products) add(`${b} ${p}`);
}

// Template 2: topic + action
for (const t of topics) {
    add(t);
    for (const a of actions) {
        add(`${t} ${a}`);
        add(`${t} ${a} ${pick(modifiers)}`);
    }
}

// Pad with random combos until we exceed 100k
while (set.size < 120000) {
    const kind = Math.random();
    if (kind < 0.5) add(`${pick(brands)} ${pick(modifiers)} ${pick(products)}`);
    else add(`${pick(topics)} ${pick(actions)} ${pick(modifiers)}`);
}

const rows = ["query,count"];
for (const [q, c] of set) {
    // CSV-safe: wrap in quotes if comma present (none here, but safe)
    rows.push(`"${q}",${c}`);
}

fs.mkdirSync("../dataset", { recursive: true });
fs.writeFileSync("../dataset/queries.csv", rows.join("\n"));
console.log(`Generated ${set.size} unique queries -> ../dataset/queries.csv`);