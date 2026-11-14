import {NextResponse} from "next/server";
import {authenticatedStaff,getAdminClient} from "@/lib/supabase";

export const runtime="nodejs";
const isUuid=(x:unknown):x is string=>typeof x==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text=(x:unknown,max=1000)=>typeof x==="string"?x.trim().slice(0,max):"";
const date=(x:unknown)=>typeof x==="string" && /^\d{4}-\d{2}-\d{2}$/.test(x)?x:"";
function number(x:unknown,min:number,max:number):string|null {
  if(x===""||x==null)return null;
  const n=Number(x);
  return Number.isFinite(n) && n>=min && n<=max ? String(n) : "invalid";
}
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  if(origin && new URL(origin).origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Origin rejected"},{status:403});
  const staff=await authenticatedStaff();
  if(!staff)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({error:"JSON required"},{status:415});
  let raw:Record<string,unknown>;
  try {
    const body=await request.text();
    if(body.length>40000)throw new Error("too large");
    raw=JSON.parse(body);
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("not object");
  }catch{return NextResponse.json({error:"Invalid submission"},{status:400});}
  const recordKey=raw.recordKey,appointmentId=raw.appointmentId,petId=raw.petId;
  if(!isUuid(recordKey)||!isUuid(appointmentId)||!isUuid(petId))
    return NextResponse.json({error:"Appointment identifier invalid"},{status:400});
  const exam=raw.exam && typeof raw.exam==="object" ? raw.exam as Record<string,unknown> : {};
  const fields={
    tempC:number(exam.tempC,25,45),heartRate:number(exam.heartRate,0,400),
    respRate:number(exam.respRate,0,200),weightKg:number(exam.weightKg,0.01,500),
    bcsScore:number(exam.bcsScore,1,9)
  };
  if(Object.values(fields).includes("invalid") ||
     (fields.bcsScore!=null && !Number.isInteger(Number(fields.bcsScore))))
    return NextResponse.json({error:"Please check exam measurements and BCS score."},{status:400});
  const safeExam={
    ...fields,subjective:text(exam.subjective,3000),objective:text(exam.objective,3000),
    assessment:text(exam.assessment,3000),plan:text(exam.plan,3000),
    reactions:text(exam.reactions,1500)
  };
  const inputVaccines=Array.isArray(raw.vaccines)?raw.vaccines:[];
  if(!inputVaccines.length||inputVaccines.length>8)
    return NextResponse.json({error:"Record 1–8 administered vaccines"},{status:400});
  const vaccines=inputVaccines.map((v)=> {
    const p=v && typeof v==="object" ? v as Record<string,unknown>:{};
    return {name:text(p.name,120),manufacturer:text(p.manufacturer,120),
      lotNumber:text(p.lotNumber,100),expiresOn:date(p.expiresOn),
      route:text(p.route,70),site:text(p.site,70),nextDueOn:date(p.nextDueOn),
      reaction:text(p.reaction,1200)};
  });
  if(vaccines.some(v=>!v.name||!v.manufacturer||!v.lotNumber||!v.expiresOn||!v.route||!v.site||!v.nextDueOn))
    return NextResponse.json({error:"Every vaccine needs product, manufacturer, lot, expiration, route, site and next-due date"},{status:400});
  const admin=getAdminClient();
  const {data,error}=await admin.rpc("pvo_record_visit",{
    p_record_key:recordKey,p_appointment_id:appointmentId,p_pet_id:petId,
    p_clinician_id:staff.user.id,p_exam:safeExam,p_vaccines:vaccines
  });
  if(error||!data?.encounterId) {
    console.error("PetVax clinical draft save failed",error?.code||"unknown");
    return NextResponse.json({error:"Could not save clinical record. Please retry."},{status:503});
  }
  return NextResponse.json({encounterId:data.encounterId,replayed:data.replayed});
}
