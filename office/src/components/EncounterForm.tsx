"use client";
import {useRef,useState} from "react";
type Visit={id:string;title:string;petId:string};
type Vax={name:string;manufacturer:string;lotNumber:string;expiresOn:string;route:string;site:string;nextDueOn:string;reaction:string};
const blankVax=():Vax=>({name:"",manufacturer:"",lotNumber:"",expiresOn:"",route:"",site:"",nextDueOn:"",reaction:""});
const blankExam={tempC:"",heartRate:"",respRate:"",weightKg:"",bcsScore:"",
  subjective:"",objective:"",assessment:"",plan:"",reactions:""};
export default function EncounterForm({visits}:{visits:Visit[]}) {
  const [appointmentId,setAppointmentId]=useState("");
  const [exam,setExam]=useState({...blankExam});
  const [vaccines,setVaccines]=useState<Vax[]>([blankVax()]);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const key=useRef<string|null>(null);
  const setField=(k:keyof typeof blankExam,v:string)=>{setExam(e=>({...e,[k]:v}));key.current=null;};
  const setVax=(i:number,k:keyof Vax,v:string)=>{setVaccines(xs=>xs.map((x,j)=>j===i?{...x,[k]:v}:x));key.current=null;};
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setError("");setSuccess("");setBusy(true);
    try {
      const visit=visits.find(v=>v.id===appointmentId);
      if(!visit)throw new Error("Select an appointment");
      if(!key.current)key.current=crypto.randomUUID();
      const r=await fetch("/api/encounters",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({recordKey:key.current,appointmentId,petId:visit.petId,exam,vaccines})});
      const body=await r.json();
      if(!r.ok)throw new Error(body.error||"Could not save visit");
      setSuccess("Clinical draft saved. Encounter reference: "+body.encounterId);
    }catch(err){setError(err instanceof Error?err.message:"Something went wrong");}
    finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={submit}>
    <section className="card stack"><h2>1. House-call visit</h2>
      <label>Appointment<select required value={appointmentId} onChange={e=>{setAppointmentId(e.target.value);key.current=null;}}>
        <option value="">Select an appointment</option>
        {visits.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}
      </select></label>
      <p className="muted">Drafts are not finalized or signed records.</p>
    </section>
    <section className="card stack"><h2>2. Pre-vaccination examination</h2>
      <div className="grid2">
        <label>Temperature (°C)<input inputMode="decimal" type="number" step=".1" min="25" max="45" value={exam.tempC} onChange={e=>setField("tempC",e.target.value)}/></label>
        <label>Heart rate (BPM)<input type="number" min="0" max="400" value={exam.heartRate} onChange={e=>setField("heartRate",e.target.value)}/></label>
        <label>Respiratory rate (per min)<input type="number" min="0" max="200" value={exam.respRate} onChange={e=>setField("respRate",e.target.value)}/></label>
        <label>Weight (kg)<input type="number" min=".01" max="500" step=".01" value={exam.weightKg} onChange={e=>setField("weightKg",e.target.value)}/></label>
        <label>BCS (1–9)<input type="number" min="1" max="9" step="1" value={exam.bcsScore} onChange={e=>setField("bcsScore",e.target.value)}/></label>
      </div>
      {(["subjective","objective","assessment","plan","reactions"] as const).map(k=>
        <label key={k}>{k[0].toUpperCase()+k.slice(1)}<textarea maxLength={3000} value={exam[k]} onChange={e=>setField(k,e.target.value)}/></label>)}
    </section>
    <section className="card stack"><h2>3. Vaccines administered</h2>
      {vaccines.map((v,i)=><div key={i} className="pet">
        <div className="row"><strong>Dose {i+1}</strong>{vaccines.length>1&&
          <button type="button" className="secondary" onClick={()=>{setVaccines(xs=>xs.filter((_,j)=>j!==i));key.current=null;}}>Remove</button>}</div>
        <div className="grid2">
          <label>Vaccine product<input required maxLength={120} value={v.name} onChange={e=>setVax(i,"name",e.target.value)}/></label>
          <label>Manufacturer<input required maxLength={120} value={v.manufacturer} onChange={e=>setVax(i,"manufacturer",e.target.value)}/></label>
          <label>Lot / serial number<input required maxLength={100} value={v.lotNumber} onChange={e=>setVax(i,"lotNumber",e.target.value)}/></label>
          <label>Product expiration<input required type="date" value={v.expiresOn} onChange={e=>setVax(i,"expiresOn",e.target.value)}/></label>
          <label>Administration route<input required maxLength={70} value={v.route} onChange={e=>setVax(i,"route",e.target.value)}/></label>
          <label>Administration site<input required maxLength={70} value={v.site} onChange={e=>setVax(i,"site",e.target.value)}/></label>
          <label>Next due date<input required type="date" value={v.nextDueOn} onChange={e=>setVax(i,"nextDueOn",e.target.value)}/></label>
        </div>
        <label>Reactions (if observed)<textarea maxLength={1200} value={v.reaction} onChange={e=>setVax(i,"reaction",e.target.value)}/></label>
      </div>)}
      {vaccines.length<8&&<div><button className="secondary" type="button" onClick={()=>{setVaccines(xs=>[...xs,blankVax()]);key.current=null;}}>Add vaccine dose</button></div>}
    </section>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {success&&<div className="notice" role="status">{success}</div>}
    <button disabled={busy||visits.length===0}>{busy?"Saving...":"Save clinical draft"}</button>
  </form>;
}
