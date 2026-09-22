// ============================================================
// VoiceChessmate — Token Minting API Route
// Mints short-lived AssemblyAI tokens for browser WebSocket auth
// NEVER expose the API key to the client
//
// Security: rate limiting (10 tokens/min per IP) + origin check
// ============================================================

import { NextResponse, NextRequest } from 'next/server';

// --- Simple in-memory rate limiter ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 token mints per minute per IP (see contracts/assemblyai-voice-engine.md, case 2)

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean up stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

export async function GET(request: NextRequest) {
  // --- Origin check: only allow requests from same origin ---
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // In production, reject requests from foreign origins
  if (process.env.NODE_ENV === 'production' && origin && host) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return NextResponse.json(
        { error: 'Forbidden: cross-origin token request' },
        { status: 403 }
      );
    }
  }

  // --- Rate limiting ---
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (isRateLimited(ip)) {
    console.warn(`[Token Route] Rate limited: ${ip}`);
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  // --- Mint token ---
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    return NextResponse.json(
      { error: 'ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev server.' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      'https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=3600',
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token minting failed:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to mint token' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Token minting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

