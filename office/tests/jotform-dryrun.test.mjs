import test from "node:test";
import assert from "node:assert/strict";
import {reconcileJotform} from "../scripts/jotform-dryrun.mjs";

const map={ownerName:"3",email:"4",phone:"5",petName:"6",species:"7",signature:"8"};
function submission(id,email,petName,signature) {
  return {id,answers:{
    "3":{answer:{first:"Sample",last:"Owner"}},
    "4":{answer:email},"5":{answer:"000-0000"},
    "6":{answer:petName},"7":{answer:"Dog"},"8":{answer:signature}
  }};
}
test("read-only inventory counts owners and signature evidence without exporting PII",()=>{
  const summary=reconcileJotform([
    submission("1","a@test.example","Rover","signature-a"),
    submission("2","a@test.example","Bella","signature-b")
  ],map);
  assert.equal(summary.sourceSubmissions,2);
  assert.equal(summary.ownersByEmail,1);
  assert.equal(summary.signaturesPresent,2);
  assert.equal(summary.readyForImport,false);
  assert.equal(JSON.stringify(summary).includes("a@test.example"),false);
});
test("detect duplicate submission and potential pet duplicate",()=>{
  const summary=reconcileJotform([
    submission("1","a@test.example","Rover","signature"),
    submission("1","a@test.example","Rover","signature")
  ],map);
  assert.equal(summary.duplicateSourceIds,1);
  assert.equal(summary.potentialDuplicatePets,1);
});
test("detect missing signature and malformed identifiers",()=>{
  const summary=reconcileJotform([
    submission("","not-an-email","Rover","")
  ],map);
  assert.equal(summary.signaturesMissing,1);
  assert.equal(summary.missingOwnerEmail,1);
  assert.equal(summary.recordsMissingSourceIds,1);
});
test("mapping required, never guess Jotform question IDs",()=>{
  assert.throws(()=>reconcileJotform([],{}),/mapping/);
});
