import { NextResponse } from 'next/server';

export function ok(data = {}) { return NextResponse.json(data); }
export function fail(message, status = 400) {
    return NextResponse.json({ error: message }, { status });
}
export function handle(err) {
    console.error('[api]', err);
    return fail(err?.message || 'Server error', err?.status || 500);
}
