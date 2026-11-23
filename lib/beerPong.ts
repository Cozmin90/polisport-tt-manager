import { supabase } from "./supabaseClient";

export const categoryLabels: Record<string, string> = { HOBBY: "Hobby", ADVANCED: "Avansați", ELITE: "Elite" };
export const roleLabels: Record<string, string> = { student: "Studenți", employee: "Angajați", partner: "Parteneri", alumni: "Alumni" };
export const serialLabel = (n: number) => String(n).padStart(3, "0");
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(date));
}

export type Edition = {
  id: string; title: string; starts: string; ends: string;
  prize_count: number; roles: string[]; categories: string[];
};
export type ListedEdition = Edition & { state: "open" | "scheduled" | "closed"; participants: number };
export type Standing = { rank: number; name: string; points: number; serves: number; mine: boolean; voucher: number | null };
export type EventView = {
  event: Edition; board: Standing[]; now: string; open: boolean; closed: boolean;
  eligibility: { eligible: boolean; reason: string | null; category: string | null };
  demo_points: number | null;
};

export async function listEditions(): Promise<ListedEdition[]> {
  const { data, error } = await supabase.rpc("beerpong_editions");
  if (error) throw new Error(error.message);
  return data;
}
export async function readEdition(id: string): Promise<EventView> {
  const { data, error } = await supabase.rpc("beerpong_event", { p_id: id });
  if (error) throw new Error(error.message);
  return data;
}
export async function play<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc("beerpong_play", { action, payload });
  if (error) throw new Error(error.message);
  return data;
}
export function editionUrl(id: string) {
  return "/beerpong?editie=" + encodeURIComponent(id) + "#editie";
}
export function byNextStart(a: Edition, b: Edition) {
  return Date.parse(a.starts) - Date.parse(b.starts);
}
