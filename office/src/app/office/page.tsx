import { redirect } from "next/navigation";
import { authenticatedStaff } from "@/lib/supabase";
import { logout } from "./logout/actions";

export const dynamic = "force-dynamic";
export default async function OfficeDashboard() {
  const staff = await authenticatedStaff();
  if (!staff) redirect("/office/login");
  const [owners,pets,submissions,appointments] = await Promise.all([
    staff.client.from("pvo_owners").select("id,full_name,email,phone").order("created_at",{ascending:false}).limit(30),
    staff.client.from("pvo_pets").select("id,name,species,owner_id").limit(200),
    staff.client.from("pvo_intake_submissions")
      .select("id,contact_email,status,payload,created_at").order("created_at",{ascending:false}).limit(30),
    staff.client.from("pvo_appointments").select("id,status,scheduled_at")
      .gte("scheduled_at",new Date().toISOString()).limit(100)
  ]);
  const queryError = owners.error || pets.error || submissions.error || appointments.error;
  const pending = (submissions.data || []).filter(s=>s.status==="needs_review");
  return <div className="stack">
    <div className="row wrap"><div><div className="eyebrow">PetVax · Secure dashboard</div><h1>Office overview</h1>
      <p className="muted">Signed in as {staff.user.email || "authorized staff"} ({staff.profile.role})</p></div>
      <form action={logout}><button className="secondary" type="submit">Sign out</button></form></div>
    {queryError && <div role="alert" className="notice error">Could not load all records. Check the database migration and permissions before relying on this dashboard.</div>}
    <div className="stats">
      <div className="stat"><strong>{owners.data?.length || 0}</strong><span>Owners shown</span></div>
      <div className="stat"><strong>{pets.data?.length || 0}</strong><span>Pets shown</span></div>
      <div className="stat"><strong>{pending.length}</strong><span>Intakes needing review</span></div>
    </div>
    <div className="row wrap"><a className="button" href="/office/appointments">Appointments</a>
      <span className="muted">Counts represent retrieved rows, not database-wide totals.</span></div>
    <section className="card stack"><h2>Recent intake submissions</h2>
      {submissions.data?.length ? <div className="tablewrap"><table><thead><tr><th>Received</th><th>Client</th><th>Pets</th><th>Status</th></tr></thead>
      <tbody>{submissions.data.map(s=><tr key={s.id}>
        <td>{new Date(s.created_at).toLocaleString("en-US",{timeZone:"America/New_York"})}</td>
        <td>{s.contact_email}</td>
        <td>{Array.isArray((s.payload as {pets?:unknown[]})?.pets) ? (s.payload as {pets:unknown[]}).pets.length : "—"}</td>
        <td>{s.status==="needs_review" ? "Needs owner matching" : s.status}</td>
      </tr>)}</tbody></table></div> : <p className="muted">No submissions found.</p>}
      <p className="muted">Returning-client submissions remain pending rather than editing existing records without identity verification. Review workflow is under development.</p>
    </section>
    <section className="card stack"><h2>Recent owners</h2>
      {owners.data?.length ? <div className="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>{owners.data.map(o=><tr key={o.id}><td>{o.full_name}</td><td>{o.email}</td><td>{o.phone}</td></tr>)}</tbody></table></div> :
        <p className="muted">No owners found yet.</p>}
    </section>
  </div>;
}
