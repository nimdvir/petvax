import {redirect} from "next/navigation";
import {authenticatedStaff} from "@/lib/supabase";
import AppointmentForm from "@/components/AppointmentForm";
export const dynamic="force-dynamic";
export default async function Appointments() {
  const staff=await authenticatedStaff();
  if(!staff)redirect("/office/login");
  const [pets,appointments]=await Promise.all([
    staff.client.from("pvo_pets").select("id,name,pvo_owners(full_name)").order("name").limit(300),
    staff.client.from("pvo_appointments").select("id,scheduled_at,status,visit_address")
      .order("scheduled_at",{ascending:true}).limit(150)
  ]);
  const opts=(pets.data||[]).map(p=>({id:p.id,name:p.name,
    owner:(p.pvo_owners as unknown as {full_name:string}|null)?.full_name||"Unknown owner"}));
  return <div className="stack"><div><a href="/office">← Dashboard</a><h1>House-call appointments</h1></div>
    {(pets.error||appointments.error)&&<div role="alert" className="notice error">Database could not be queried.</div>}
    <section className="card stack"><h2>New appointment</h2><AppointmentForm pets={opts}/></section>
    <section className="card stack"><h2>Scheduled visits</h2>
      <div className="tablewrap"><table><thead><tr><th>Date (New York)</th><th>Status</th><th>Address</th></tr></thead>
      <tbody>{(appointments.data||[]).map(a=><tr key={a.id}>
        <td>{new Date(a.scheduled_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"})}</td>
        <td>{a.status}</td><td>{a.visit_address}</td></tr>)}</tbody></table></div>
      <p className="muted">Scheduling checks for near-time conflicts but is not yet transactionally protected against simultaneous bookings.</p>
    </section>
  </div>;
}
