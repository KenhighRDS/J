// Push dispatch (filled in by the push stage). Signatures are stable so ingest/admin can call them now.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface FollowUp { type: string; title: string; body: string; style: "call" | "normal"; ringSec?: number }

export async function dispatchSignal(_sb: SupabaseClient, _signalId: string): Promise<{ sent: number }> { return { sent: 0 }; }
export async function dispatchFollowUp(_sb: SupabaseClient, _signalId: string, _f: FollowUp): Promise<{ sent: number }> { return { sent: 0 }; }
export async function dispatchCloseQuestion(_sb: SupabaseClient, _signalId: string, _body: string): Promise<{ sent: number }> { return { sent: 0 }; }
