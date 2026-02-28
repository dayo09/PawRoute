// Centralized in-memory store for sightings (DB-like behavior)
// This manages deduplication and keeps track of all discovered posts.

export interface Sighting {
    id?: string;
    title: string;
    content: string;
    region: string;
    imgUrl: string;
    link: string;
    source: 'Karrot' | 'PawInHand';
    keyword: string;
    timestamp: string;
    analysis?: {
        isDog: boolean;
        breed: string;
        size: string;
        color: string;
        features: string[];
        isLostOrFound: string;
    };
}

class SightingStore {
    private sightings = new Map<string, Sighting>();

    // Add or update a sighting. Returns true if it's a new entry (by URL)
    add(sighting: Sighting): boolean {
        const key = sighting.link;
        const exists = this.sightings.has(key);

        // If it exists, we might want to update it if it has analysis now
        if (exists) {
            const existing = this.sightings.get(key)!;
            this.sightings.set(key, { ...existing, ...sighting });
            return false;
        }

        this.sightings.set(key, sighting);
        return true;
    }

    get(link: string): Sighting | undefined {
        return this.sightings.get(link);
    }

    getAll(): Sighting[] {
        return Array.from(this.sightings.values());
    }

    // Check if an article already exists (by link)
    exists(link: string): boolean {
        return this.sightings.has(link);
    }
}

// Global singleton for the server instance
const globalStore = new SightingStore();

export default globalStore;
