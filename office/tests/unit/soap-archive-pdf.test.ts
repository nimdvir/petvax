import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderSoapArchivePdf } from "@/lib/soap/archive-pdf";
import { pdfToText } from "../pdf-text";

const sample = () => ({
  clinic:"PetVax",pet:"Scout",species:"dog",owner:"Alex Rivera",
  clinician:"M. Andersen, LVT, VTS",visitDate:"2026-11-14",
  savedAt:"2026-11-15T00:00:00Z",revision:2,status:"amended" as const,
  note:{
    subjective:"Owner reports normal appetite",temperature:101.5,temperature_unit:"F",
    heart_rate_bpm:120,respiratory_rate_bpm:22,weight:18,weight_unit:"lb",
    body_condition_score:5,body_condition_scale:9,general_appearance:"BAR",
    exam_findings:"Normal brief examination",assessment:"Suitable for vaccination",
    fit_for_vaccination:true,plan:"DHPP today",observed_reactions:"None observed",
    follow_up:"Booster in 3 weeks",amendment_reason:"Corrected heart rate",
  },
});

describe("SOAP archive PDFs",()=>{
  it("includes all clinical sections, units, names and immutable revision details",async()=>{
    const pdf=await renderSoapArchivePdf(sample());
    const txt=pdfToText(pdf).replace(/\s+/g," ");
    for(const field of ["PetVax","Scout","Alex Rivera","Subjective","Objective","Assessment",
      "Plan","101.5 F","120 bpm","22 breaths/min","18 lb","5 / 9","Corrected heart rate",
      "AMENDED","Revision: 2"]) expect(txt.toLowerCase()).toContain(field.toLowerCase());
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
  });
});
