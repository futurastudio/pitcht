/**
 * Simple in-memory rate limiter to prevent API abuse
 * Protects against cost overruns on AI endpoints
 */

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
    };
}

const store: RateLimitStore = {};

// Clean up old entries every hour
setInterval(() => {
    const now = Date.now();
    Object.keys(store).forEach(key => {
        if (store[key].resetTime < now) {
            delete store[key];
        }
    });
}, 60 * 60 * 1000);

export const RATE_LIMITS = {
    // AI endpoints (expensive) - PROTECT YOUR WALLET
    GENERATE_QUESTIONS: {
        maxRequests: 10, // 10 sessions per hour per user
        windowMs: 60 * 60 * 1000
    },
    GENERATE_FEEDBACK: {
        maxRequests: 15, // 15 feedback per hour per user
        windowMs: 60 * 60 * 1000
    },
    TRANSCRIBE: {
        maxRequests: 20, // 20 transcriptions per hour
        windowMs: 60 * 60 * 1000
    }
} as const;

export function checkRateLimit(identifier: string, maxRequests: number, windowMs: number) {
    const now = Date.now();
    
    if (!store[identifier] || store[identifier].resetTime < now) {
        store[identifier] = { count: 0, resetTime: now + windowMs };
    }
    
    const entry = store[identifier];
    
    if (entry.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: Math.ceil((entry.resetTime - now) / 60000) // minutes
        };
    }
    
    entry.count++;
    return {
        allowed: true,
        remaining: maxRequests - entry.count,
        resetIn: Math.ceil((entry.resetTime - now) / 60000)
    };
}
