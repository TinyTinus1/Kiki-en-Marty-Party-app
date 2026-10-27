export type Persona = 'kiki' | 'marty';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'yearly';
export type Member = { user_id: string; display_name: string; persona: Persona };
export type Plan = { id: string; owner_id: string; title: string; starts_at: string; ends_at: string; location: string; description: string; recurrence: Recurrence; all_day: boolean; birthday_user_id: string | null; import_key?: string | null; created_at?: string };
export type Attendance = { event_id: string; user_id: string; occurrence_start: string | null; attending: boolean };
export type Occurrence = Plan & { occurrence_start: string; occurrence_end: string; attendees: string[] };
export type AccessRequest = { user_id: string; display_name: string; birth_date: string; persona: Persona; status: 'pending'|'approved'|'rejected'; email: string };
export type Snapshot = { members: Member[]; plans: Plan[]; attendance: Attendance[]; requests: AccessRequest[] };
