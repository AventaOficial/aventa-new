import { NextResponse } from 'next/server';

/** Liveness: process is up. No dependency calls, no secrets. */
export async function GET() {
  return NextResponse.json({ status: 'ok', live: true });
}
