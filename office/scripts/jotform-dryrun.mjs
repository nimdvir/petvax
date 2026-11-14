#!/usr/bin/env node
/**
 * Read-only local inventory of Jotform exported submission JSON.
 * NEVER sends data to an API, changes records, or logs personal information.
 *
 * Usage:
 *   node scripts/jotform-dryrun.mjs /secure/submissions.json /secure/field-map.json
 *
 * Example mapping JSON:
 * {"ownerName":"3","email":"4","phone":"5","petName":"6","species":"7","signature":"8"}
 * Question IDs vary between Jotform forms: inventory each form separately.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function normalizeText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object")
    return [value.first,value.last].filter(Boolean).join(" ").trim();
  return "";
}
function getAnswer(submission, fieldId) {
  if (!fieldId) return "";
  const field = submission?.answers?.[fieldId];
  return field && typeof field === "object" && "answer" in field
    ? normalizeText(field.answer) : "";
}
export function reconcileJotform(exportData, fieldMap) {
  const records=Array.isArray(exportData)?exportData:
    Array.isArray(exportData?.content)?exportData.content:
    Array.isArray(exportData?.submissions)?exportData.submissions:null;
  if (!records) throw new Error("Expected an array or an object containing content/submissions array");
  const fields=["ownerName","email","phone","petName","species","signature"];
  if (!fieldMap || fields.some(f=>typeof fieldMap[f]!=="string"))
    throw new Error("A field mapping with all six Jotform question IDs is required");
  const sourceIds=new Set(),owners=new Map(),pets=new Map();
  const counts={
    sourceSubmissions:records.length,uniqueSourceIds:0,duplicateSourceIds:0,
    recordsMissingSourceIds:0,missingOwnerEmail:0,missingPetName:0,
    signaturesPresent:0,signaturesMissing:0,ownersByEmail:0,
    potentialDuplicateOwners:0,potentialDuplicatePets:0,
    recordsNeedingManualReview:0,readyForImport:false
  };
  for(const record of records) {
    const id=normalizeText(record?.id);
    let review=false;
    if(!id){counts.recordsMissingSourceIds++;review=true;}
    else if(sourceIds.has(id)){counts.duplicateSourceIds++;review=true;}
    else {sourceIds.add(id);}
    const email=getAnswer(record,fieldMap.email).toLowerCase();
    const name=getAnswer(record,fieldMap.ownerName);
    const petName=getAnswer(record,fieldMap.petName).toLowerCase();
    const species=getAnswer(record,fieldMap.species).toLowerCase();
    const signature=getAnswer(record,fieldMap.signature);
    if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){counts.missingOwnerEmail++;review=true;}
    if(!petName){counts.missingPetName++;review=true;}
    if(signature){counts.signaturesPresent++;}else{counts.signaturesMissing++;review=true;}
    if(email) {
      const prior=owners.get(email);
      if(prior){
        // Same email may mean repeated submissions or multiple pets; never auto-merge.
        counts.potentialDuplicateOwners++;
        if(prior.name!==name)review=true;
      } else owners.set(email,{name});
      const petKey=email+"|"+petName+"|"+species;
      if(petName && species) {
        if(pets.has(petKey)){counts.potentialDuplicatePets++;review=true;}
        else pets.set(petKey,true);
      }
    }
    if(review)counts.recordsNeedingManualReview++;
  }
  counts.uniqueSourceIds=sourceIds.size;
  counts.ownersByEmail=owners.size;
  return counts;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [, , inputPath,mapPath]=process.argv;
  if(!inputPath||!mapPath){
    process.stderr.write("Usage: node scripts/jotform-dryrun.mjs export.json mapping.json\n");
    process.exitCode=2;
  } else {
    try {
      const data=JSON.parse(readFileSync(inputPath,"utf8"));
      const mapping=JSON.parse(readFileSync(mapPath,"utf8"));
      process.stdout.write(JSON.stringify(reconcileJotform(data,mapping),null,2)+"\n");
    } catch(error) {
      process.stderr.write("Inventory failed: "+(error instanceof Error?error.message:"Unknown error")+"\n");
      process.exitCode=1;
    }
  }
}
