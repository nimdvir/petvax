"use client";
import {useState} from "react";
type PetOption={id:string;name:string;owner:string};
export default function AppointmentForm({pets}:{pets:PetOption[]}) {
  const [petId,setPetId]=useState("");
  const [localTime,setLocalTime]=useState("");
  const [notes,setNotes]=useState("");
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setStatus("");
    try {
      const scheduledAt=new Date(localTime).toISOString();
      const r=await fetch("/api/appointments",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({petId,scheduledAt,notes})});
      const result=await r.json();
      if(!r.ok)throw new Error(result.error||"Appointment could not be saved");
      setStatus("Appointment request saved. Reference: "+result.appointmentId);
    }catch(err){setStatus(err instanceof Error?err.message:"Please try again");}
    finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={submit}>
    <label>Pet and owner<select required value={petId} onChange={e=>setPetId(e.target.value)}>
      <option value="">Select a registered pet</option>
      {pets.map(p=><option key={p.id} value={p.id}>{p.name} — {p.owner}</option>)}
    </select></label>
    <label>Visit date and time (your device's timezone)<input required type="datetime-local" value={localTime} onChange={e=>setLocalTime(e.target.value)}/></label>
    <label>Staff notes (optional)<textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    {status&&<div className="notice" role="status">{status}</div>}
    <button disabled={busy||pets.length===0} type="submit">{busy?"Saving...":"Save appointment request"}</button>
  </form>;
}
