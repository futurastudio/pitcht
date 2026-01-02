/**
 * Simple in-memory rate limiter to prevent API abuse
 * Protects against cost overruns on AI endpoints
 */

import { NextRequest } from 'next/server';

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

export const RateLimitPresets = {
    // AI endpoints (expensive) - PROTECT YOUR WALLET
    AI_ENDPOINT: {
        maxRequests: 10, // 10 requests per hour per user
        windowMs: 60 * 60 * 1000
    },
    TRANSCRIBE: {
        maxRequests: 20, // 20 transcriptions per hour
        windowMs: 60 * 60 * 1000
    },
    GENERATE_FEEDBACK: {
        maxRequests: 15, // 15 feedback per hour per user
        windowMs: 60 * 60 * 1000
    },
    // Auth endpoints (prevent abuse)
    AUTH_ENDPOINT: {
        maxRequests: 5, // 5 requests per hour (strict to prevent abuse)
        windowMs: 60 * 60 * 1000
    }
} as const;

// Legacy export for backward compatibility
export const RATE_LIMITS = {
    GENERATE_QUESTIONS: RateLimitPresets.AI_ENDPOINT,
    GENERATE_FEEDBACK: RateLimitPresets.GENERATE_FEEDBACK,
    TRANSCRIBE: RateLimitPresets.TRANSCRIBE
} as const;

/**
 * Get user identifier from request (IP address or user ID)
 */
export function getUserIdentifier(request: NextRequest): string {
    // Try to get user ID from header (set by auth middleware)
    const userId = request.headers.get('x-user-id');
    if (userId) return `user:${userId}`;

    // Fallback to IP address
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    return `ip:${ip}`;
}

/**
 * Format reset time for user-friendly display
 */
export function formatResetTime(resetAt: number): string {
    const minutes = Math.ceil((resetAt - Date.now()) / 60000);
    if (minutes < 1) return 'less than a minute';
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.ceil(minutes / 60);
    return hours === 1 ? '1 hour' : `${hours} hours`;
}

/**
 * Check rate limit for a given identifier
 */
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
            resetIn: Math.ceil((entry.resetTime - now) / 60000), // minutes
            resetAt: entry.resetTime
        };
    }

    entry.count++;
    return {
        allowed: true,
        remaining: maxRequests - entry.count,
        resetIn: Math.ceil((entry.resetTime - now) / 60000),
        resetAt: entry.resetTime
    };
}

/**
 * Rate limiter with preset configurations
 */
const rateLimiter = {
    check: (identifier: string, preset: { maxRequests: number; windowMs: number }) => {
        return checkRateLimit(identifier, preset.maxRequests, preset.windowMs);
    }
};

export default rateLimiter;
