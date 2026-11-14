import { NextResponse } from "next/server";
import { authenticatedStaff } from "@/lib/supabase";
export const runtime = "nodejs";
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin)
    return NextResponse.json({error:"Origin rejected"},{status:403});
  const staff=await authenticatedStaff();
  if (!staff) return NextResponse.json({error:"Unauthorized"},{status:401});
  let body:Record<string,unknown>;
  try {body=await request.json();} catch {return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const petId=typeof body.petId==="string" ? body.petId:"";
  const when=typeof body.scheduledAt==="string" ? body.scheduledAt:"";
  const notes=typeof body.notes==="string" ? body.notes.trim().slice(0,1000):"";
  const at=new Date(when);
  if (!/^[0-9a-f-]{36}$/i.test(petId) || !Number.isFinite(at.getTime()) ||
      at.getTime()<Date.now() || at.getTime()>Date.now()+365*86400000)
    return NextResponse.json({error:"Select a pet and a future appointment time"},{status:400});
  const {data:pet,error:petError}=await staff.client.from("pvo_pets")
    .select("id,owner_id,pvo_owners(address)").eq("id",petId).single();
  if (petError || !pet) return NextResponse.json({error:"Pet not found"},{status:404});
  const owner = pet.pvo_owners as unknown as {address:string}|null;
  if (!owner?.address) return NextResponse.json({error:"Owner address missing"},{status:400});
  const from=new Date(at.getTime()-30*60000).toISOString();
  const to=new Date(at.getTime()+30*60000).toISOString();
  const {data:overlap}=await staff.client.from("pvo_appointments").select("id")
    .gte("scheduled_at",from).lte("scheduled_at",to)
    .neq("status","canceled").limit(1);
  if (overlap?.length) return NextResponse.json({error:"Another appointment is within 30 minutes of this time"},{status:409});
  const {data,error}=await staff.client.from("pvo_appointments")
    .insert({owner_id:pet.owner_id,pet_id:petId,scheduled_at:at.toISOString(),
      visit_address:owner.address,notes,status:"requested"})
    .select("id").single();
  if (error || !data) return NextResponse.json({error:"Could not save appointment"},{status:503});
  return NextResponse.json({appointmentId:data.id});
}
