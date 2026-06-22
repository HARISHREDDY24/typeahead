import { useEffect, useState } from "react";
import { fetchMetrics } from "./api";
import { Doughnut, Bar } from "react-chartjs-2";
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from "chart.js";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Metrics() {
    const [m, setM] = useState(null);
    const [err, setErr] = useState("");

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const data = await fetchMetrics();
                if (alive) { setM(data); setErr(""); }
            } catch {
                if (alive) setErr("Could not load metrics.");
            }
        };
        load();
        const id = setInterval(load, 3000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    if (err) return <div className="error">{err}</div>;
    if (!m) return <div className="hint">Loading metrics…</div>;

    const cacheData = {
        labels: ["Hits", "Misses"],
        datasets: [{ data: [m.cache.hits, m.cache.misses], backgroundColor: ["#4a7bff", "#e0e0e0"] }],
    };
    const batchData = {
        labels: ["Searches received", "DB writes"],
        datasets: [{ label: "Count", data: [m.batching.searchesReceived, m.batching.dbWrites], backgroundColor: ["#4a7bff", "#6AA84F"] }],
    };

    return (
        <div className="metrics">
            <h2>Metrics</h2>
            <div className="stat-grid">
                <div className="stat"><span>p95 latency</span><strong>{m.latencyMs.p95} ms</strong></div>
                <div className="stat"><span>avg latency</span><strong>{m.latencyMs.avg} ms</strong></div>
                <div className="stat"><span>cache hit rate</span><strong>{(m.cache.hitRate * 100).toFixed(1)}%</strong></div>
                <div className="stat"><span>DB reads</span><strong>{m.db.reads}</strong></div>
                <div className="stat"><span>DB writes</span><strong>{m.db.writes}</strong></div>
                <div className="stat"><span>write reduction</span><strong>{m.batching.reductionPct}%</strong></div>
            </div>
            <div className="charts">
                <div className="chart-box"><h3>Cache hit / miss</h3><Doughnut data={cacheData} /></div>
                <div className="chart-box"><h3>Batch write reduction</h3><Bar data={batchData} options={{ scales: { y: { beginAtZero: true } } }} /></div>
            </div>
        </div>
    );
}