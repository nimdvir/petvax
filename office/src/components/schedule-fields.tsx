import { Field, Input, Select, Textarea } from "./ui";

export function ScheduleFields({ staff, date, time, duration, staffId, address, notes }: {
  staff: { user_id: string; full_name: string; role: string }[]; date?: string; time?: string; duration?: number;
  staffId?: string | null; address?: string | null; notes?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Date"><Input type="date" name="date" defaultValue={date ?? ""} /></Field>
      <Field label="Start time (New York)"><Input type="time" name="time" step={300} defaultValue={time ?? ""} /></Field>
      <Field label="Length (minutes)"><Input name="duration" inputMode="numeric" defaultValue={duration ?? 45} /></Field>
      <Field label="Clinician">
        <Select name="assigned_staff_id" defaultValue={staffId ?? ""}>
          <option value="">Unassigned</option>
          {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</option>)}
        </Select>
      </Field>
      <Field label="Visit address" className="sm:col-span-2"><Input name="visit_address" defaultValue={address ?? ""} /></Field>
      <Field label="Internal notes" className="sm:col-span-3"><Textarea name="internal_notes" defaultValue={notes ?? ""} /></Field>
    </div>
  );
}
