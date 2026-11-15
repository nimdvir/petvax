import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archiveSoap, archiveMissing, type ArchiveConfig } from "@/lib/drive-archive";
import { pdfToText } from "../pdf-text";
import { loadArchiveScript } from "../support/fake-drive";
import { adminClient, makeUser, uniq } from "./helpers";

const drive=loadArchiveScript("local-test-key");
let server:http.Server;
let cfg:ArchiveConfig;
let soapId:string,revisionFinal:number,revisionAmended:number;
beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    let body="";req.on("data",c=>body+=c);
    req.on("end",()=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(drive.doPost(JSON.parse(body))));});
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  cfg={url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`,secret:"local-test-key"};
  const db=adminClient(),vet=await makeUser("vet"),tag=uniq();
  const owner=(await db.from("owners").insert({first_name:"Taylor",last_name:`SOAP${tag}`,email:`soap-${tag}@example.test`}).select("id").single()).data!;
  const pet=(await db.from("pets").insert({name:`Biscuit${tag}`,species:"dog",sex:"female"}).select("id").single()).data!;
  await db.from("pet_owners").insert({owner_id:owner.id,pet_id:pet.id});
  const encounter=(await db.from("encounters").insert({owner_id:owner.id,pet_id:pet.id,clinician_id:vet.userId,encounter_date:"2026-11-14"}).select("id").single()).data!;
  const soap=(await db.from("soap_notes").insert({encounter_id:encounter.id,subjective:"Owner reports normal appetite",body_condition_score:5,
    body_condition_scale:9,temperature:101.5,temperature_unit:"F",assessment:"Ready for vaccines",status:"final",created_by:vet.userId,updated_by:vet.userId,finalized_by:vet.userId}).select("id").single()).data!;
  soapId=soap.id;
  const first=(await db.from("soap_note_revisions").select("revision").eq("soap_note_id",soapId).eq("status","final").single()).data!;
  revisionFinal=first.revision;
  const amended=await db.from("soap_notes").update({status:"amended",assessment:"Vaccinated; recheck in 3 weeks",
    amendment_reason:"Follow-up clarification",updated_by:vet.userId}).eq("id",soapId);
  expect(amended.error).toBeNull();
  const last=(await db.from("soap_note_revisions").select("revision").eq("soap_note_id",soapId).eq("status","amended").single()).data!;
  revisionAmended=last.revision;
});
afterAll(()=>server.close());

describe("finalized SOAP Drive archive",()=>{
  it("archives each immutable revision as an independent readable PDF",async()=>{
    const db=adminClient();
    for(const revisionNumber of [revisionFinal,revisionAmended]){
      const result=await archiveSoap(db,{soapNoteId:soapId,revisionNumber,siteUrl:"https://office.example.test",cfg});
      expect(result?.status).toBe("saved");
    }
    const folder=drive.find(["PetVax Office archive","SOAP notes","2026","2026-11"])!;
    const files=folder.files.filter(f=>f.name.includes(soapId.slice(0,8)));
    expect(files).toHaveLength(2);
    const first=pdfToText(new Uint8Array(files.find(f=>f.name.includes(`revision ${revisionFinal}`))!.content));
    expect(first).toContain("Owner reports normal appetite");
    expect(first).toContain("101.5 F");
    expect(first).toContain("5 / 9");
    const amended=pdfToText(new Uint8Array(files.find(f=>f.name.includes(`revision ${revisionAmended}`))!.content));
    expect(amended).toContain("Follow-up clarification");
    expect(amended).toContain("Vaccinated; recheck in 3 weeks");
    const rows=(await db.from("drive_archive_log").select("revision_no,status").eq("kind","soap").eq("record_id",soapId).eq("status","saved")).data!;
    expect(rows.map(x=>x.revision_no).sort()).toEqual([revisionFinal,revisionAmended]);
  });
  it("does not retry already saved SOAP revisions in catch-up",async()=>{
    const result=await archiveMissing(adminClient(),{siteUrl:"https://office.example.test",cfg,limit:100});
    expect(result.error).toBeNull();
    const soapFiles=drive.find(["PetVax Office archive","SOAP notes","2026","2026-11"])!.files.filter(f=>f.name.includes(soapId.slice(0,8)));
    expect(soapFiles).toHaveLength(2);
  });
});
