"use client";
import { useRef, useState } from "react";
type Pet = { name: string; species: string; breed: string; sex: string; notes: string };
const blankPet = (): Pet => ({ name: "", species: "dog", breed: "", sex: "", notes: "" });
type Owner = {fullName: string; email: string; phone: string; address: string};
const blankOwner: Owner = { fullName: "", email: "", phone: "", address: "" };
export default function IntakeForm({token, consentText, consentVersion}: {token:string;consentText:string;consentVersion:string}) {
  const [owner,setOwner] = useState(blankOwner);
  const [pets,setPets] = useState<Pet[]>([blankPet()]);
  const [signedName,setSignedName] = useState("");
  const [accepted,setAccepted] = useState(false);
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<{status:string;submissionId:string}|null>(null);
  const [error,setError] = useState("");
  const submissionKey = useRef<string|null>(null);
  function updatePet(index:number, key:keyof Pet, value:string) {
    setPets(items => items.map((p,i) => i === index ? {...p,[key]:value} : p));
    submissionKey.current = null;
  }
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);setError("");
    try {
      if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
      const response = await fetch("/api/intake",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,submissionKey:submissionKey.current,owner,pets,signedName,accepted})
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not save your submission.");
      setResult(body);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please retry.");
    } finally {setBusy(false);}
  }
  if (result) return <section className="card stack" role="status">
    <h2>Registration received</h2>
    <p>Thank you. Your reference number is <strong>{result.submissionId}</strong>.</p>
    <p>{result.status === "needs_review" ?
      "We found an existing contact record. PetVax staff will review the details before linking them. No existing information was overwritten." :
      "Your information and electronic consent have been recorded. The PetVax team will confirm your appointment."}</p>
    <p className="muted">This is not confirmation of an appointment.</p></section>;
  return <form onSubmit={submit} className="stack">
    <section className="card stack"><h2>1. Your contact information</h2>
      <div className="grid2">
        <label>Full name<input required maxLength={120} autoComplete="name" value={owner.fullName} onChange={e=>setOwner({...owner,fullName:e.target.value})}/></label>
        <label>Email<input required type="email" maxLength={254} autoComplete="email" value={owner.email} onChange={e=>setOwner({...owner,email:e.target.value})}/></label>
        <label>Phone<input required type="tel" maxLength={40} autoComplete="tel" value={owner.phone} onChange={e=>setOwner({...owner,phone:e.target.value})}/></label>
        <label>House-call address<input required maxLength={240} autoComplete="street-address" value={owner.address} onChange={e=>setOwner({...owner,address:e.target.value})}/></label>
      </div>
    </section>
    <section className="card stack"><h2>2. Pet information</h2>
      {pets.map((pet,i)=><div className="pet" key={i}>
        <div className="row"><strong>Pet {i+1}</strong>{pets.length>1&&<button type="button" className="secondary" onClick={()=>{setPets(ps=>ps.filter((_,j)=>j!==i));submissionKey.current=null;}}>Remove</button>}</div>
        <div className="grid2">
          <label>Name<input required maxLength={100} value={pet.name} onChange={e=>updatePet(i,"name",e.target.value)}/></label>
          <label>Species<select value={pet.species} onChange={e=>updatePet(i,"species",e.target.value)}><option value="dog">Dog</option><option value="cat">Cat</option></select></label>
          <label>Breed (optional)<input maxLength={90} value={pet.breed} onChange={e=>updatePet(i,"breed",e.target.value)}/></label>
          <label>Sex (optional)<select value={pet.sex} onChange={e=>updatePet(i,"sex",e.target.value)}><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="unknown">Unknown</option></select></label>
        </div>
        <label>Medical history, allergies, previous vaccine reactions (optional)<textarea maxLength={700} value={pet.notes} onChange={e=>updatePet(i,"notes",e.target.value)}/></label>
      </div>)}
      {pets.length<6&&<div><button type="button" className="secondary" onClick={()=>{setPets(ps=>[...ps,blankPet()]);submissionKey.current=null;}}>Add another pet</button></div>}
    </section>
    <section className="card stack"><h2>3. Vaccination consent</h2>
      <p className="muted">Consent text version {consentVersion}. Please read before signing.</p>
      <div className="consent" tabIndex={0}>{consentText}</div>
      <label className="checkline"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required/>
        <span>I have read the consent above and agree to electronically sign it. I understand this records my consent for the described vaccination visit.</span></label>
      <label>Type your full legal name to sign<input required maxLength={120} autoComplete="name" value={signedName} onChange={e=>setSignedName(e.target.value)} placeholder="Same name as registered owner"/></label>
      <p className="muted">Your signature, consent version and submission time are retained as an electronic record.</p>
    </section>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <button type="submit" disabled={busy}>{busy?"Submitting...":"Submit registration and signed consent"}</button>
  </form>;
}
