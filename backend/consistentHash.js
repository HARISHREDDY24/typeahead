import crypto from "crypto";

// Hash any string to a 32-bit unsigned integer position on the ring.
function hash(str) {
    const h = crypto.createHash("md5").update(str).digest();
    // take first 4 bytes -> uint32. (md5 is fine here: we need distribution, not security)
    return h.readUInt32BE(0);
}

export class ConsistentHashRing {
    constructor(nodes = [], virtualNodes = 100) {
        this.virtualNodes = virtualNodes;   // replicas per physical node
        this.ring = new Map();              // ringPosition -> nodeName
        this.sortedPositions = [];          // sorted ring positions for binary search
        this.nodes = new Set();
        for (const n of nodes) this.addNode(n);
    }

    addNode(node) {
        if (this.nodes.has(node)) return;
        this.nodes.add(node);
        for (let i = 0; i < this.virtualNodes; i++) {
            const pos = hash(`${node}#${i}`);   // each virtual node lands at its own spot
            this.ring.set(pos, node);
        }
        this._resort();
    }

    removeNode(node) {
        if (!this.nodes.has(node)) return;
        this.nodes.delete(node);
        for (let i = 0; i < this.virtualNodes; i++) {
            this.ring.delete(hash(`${node}#${i}`));
        }
        this._resort();
    }

    _resort() {
        this.sortedPositions = [...this.ring.keys()].sort((a, b) => a - b);
    }

    // Given a key, find the first node clockwise from the key's hash.
    getNode(key) {
        if (this.sortedPositions.length === 0) return null;
        const h = hash(key);
        // binary search for first position >= h
        let lo = 0, hi = this.sortedPositions.length - 1, idx = 0;
        if (h > this.sortedPositions[hi]) {
            idx = 0; // wrap around to the first node
        } else {
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (this.sortedPositions[mid] >= h) { idx = mid; hi = mid - 1; }
                else lo = mid + 1;
            }
        }
        return this.ring.get(this.sortedPositions[idx]);
    }
}