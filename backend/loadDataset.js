import fs from "fs";
import readline from "readline";
import db from "./db.js";

const insert = db.prepare(
    "INSERT OR REPLACE INTO queries (query, count, last_searched) VALUES (?, ?, 0)"
);

const insertMany = db.transaction((rows) => {
    for (const [q, c] of rows) insert.run(q, c);
});

async function run() {
    const stream = fs.createReadStream("../dataset/queries.csv");
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const rows = [];
    let first = true;
    for await (const line of rl) {
        if (first) { first = false; continue; } // skip header
        if (!line.trim()) continue;
        // query is quoted: "iphone 15",85000
        const m = line.match(/^"(.*)",(\d+)$/);
        if (!m) continue;
        rows.push([m[1], parseInt(m[2], 10)]);
    }

    insertMany(rows);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM queries").get();
    console.log(`Loaded ${rows.length} rows. Table now has ${n} queries.`);
}

run();