import {redirect} from "next/navigation";
import {authenticatedStaff} from "@/lib/supabase";
import EncounterForm from "@/components/EncounterForm";
export const dynamic="force-dynamic";
export default async function Encounters() {
  const staff=await authenticatedStaff();
  if(!staff)redirect("/office/login");
  const [visits,records]=await Promise.all([
    staff.client.from("pvo_appointments")
      .select("id,pet_id,scheduled_at,status,pvo_pets(name),pvo_owners(full_name)")
      .neq("status","canceled").not("pet_id","is",null).order("scheduled_at",{ascending:false}).limit(150),
    staff.client.from("pvo_encounters")
      .select("id,created_at,pet_id,finalized_at,subjective,assessment")
      .order("created_at",{ascending:false}).limit(30)
  ]);
  const options=(visits.data||[]).filter(v=>!!v.pet_id).map(v=>({
    id:v.id,petId:v.pet_id as string,
    title:new Date(v.scheduled_at).toLocaleDateString("en-US",{timeZone:"America/New_York"})+
      " · "+(v.pvo_pets as unknown as {name:string}|null)?.name+
      " · "+(v.pvo_owners as unknown as {full_name:string}|null)?.full_name
  }));
  return <div className="stack">
    <div><a href="/office">← Dashboard</a><h1>Examination and SOAP notes</h1>
      <p className="muted">Pre-vaccination examination and vaccine administration only.</p></div>
    {(visits.error||records.error)&&<div className="notice error">Could not read clinical records. Check Supabase access.</div>}
    <EncounterForm visits={options}/>
    <section className="card stack"><h2>Recent drafts</h2>
      <div className="tablewrap"><table><thead><tr><th>Created</th><th>Record</th><th>Status</th></tr></thead>
      <tbody>{(records.data||[]).map(r=><tr key={r.id}>
        <td>{new Date(r.created_at).toLocaleString("en-US",{timeZone:"America/New_York"})}</td>
        <td><code>{r.id}</code></td><td>{r.finalized_at?"Finalized":"Draft"}</td>
      </tr>)}</tbody></table></div>
      <p className="muted">Clinical finalization, practitioner signature, and official vaccine certificate issuance require additional implementation and verification.</p>
    </section>
  </div>;
}
