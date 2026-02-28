// Gemini Throughput Manager
// Limits API calls to 30 requests per 60 seconds (Sliding Window)

class GeminiLimiter {
    private requests: number[] = []; // Timestamps of requests
    private readonly LIMIT = 30;
    private readonly WINDOW_MS = 60 * 1000;

    // Check if a request is allowed. Returns true if allowed, false otherwise.
    // If allowed, it records the request timestamp.
    tryAcquire(): boolean {
        const now = Date.now();
        this.cleanOldRequests(now);

        if (this.requests.length >= this.LIMIT) {
            console.warn(`[GeminiLimiter] Rate limit reached! (${this.requests.length}/${this.LIMIT} in 60s)`);
            return false;
        }

        this.requests.push(now);
        console.log(`[GeminiLimiter] Request allowed. (${this.requests.length}/${this.LIMIT} in 60s)`);
        return true;
    }

    // Wait until a request is allowed (with optional timeout)
    async waitAcquire(timeoutMs: number = 30000): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.tryAcquire()) return true;
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return false;
    }

    private cleanOldRequests(now: number) {
        const threshold = now - this.WINDOW_MS;
        this.requests = this.requests.filter(ts => ts > threshold);
    }

    getUsage(): { current: number, limit: number } {
        this.cleanOldRequests(Date.now());
        return { current: this.requests.length, limit: this.LIMIT };
    }
}

const geminiLimiter = new GeminiLimiter();
export default geminiLimiter;
