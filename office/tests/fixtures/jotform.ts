import type { JotformSubmission } from "@/lib/jotform/map";

/** Synthetic submissions in the Jotform API shape, mirroring the two live PetVax forms' questions. */
export function jotformFixtures(tag: string): JotformSubmission[] {
  return [
    {
      id: `9001${tag}1`, form_id: "262500538572052", created_at: "2026-11-02 09:15:00", status: "ACTIVE",
      answers: {
        "3": { name: "q3_fullname1", text: "Owner Full Name", type: "control_fullname", answer: { first: "Riley", last: `Moss${tag}` } },
        "4": { text: "Street Address", type: "control_textbox", answer: "12 Bank St" },
        "5": { text: "Apartment/Unit", type: "control_textbox", answer: "4R" },
        "6": { text: "City", type: "control_textbox", answer: "New York" },
        "7": { text: "State", type: "control_dropdown", answer: "NY" },
        "8": { text: "ZIP Code", type: "control_textbox", answer: "10014" },
        "9": { text: "Primary Phone Number", type: "control_phone", answer: { full: "(917) 555-0142" } },
        "11": { text: "Email Address", type: "control_email", answer: `riley.${tag}@example.net` },
        "13": { text: "Pet Name", type: "control_textbox", answer: "Biscuit" },
        "14": { text: "Species", type: "control_radio", answer: "Dog" },
        "15": { text: "Breed", type: "control_textbox", answer: "Corgi" },
        "16": { text: "Color", type: "control_textbox", answer: "Red/white" },
        "17": { text: "Sex", type: "control_radio", answer: "Male" },
        "18": { text: "Spayed/Neutered", type: "control_radio", answer: "Yes" },
        "19": { text: "Date of Birth", type: "control_datetime", answer: { month: "03", day: "09", year: "2021" }, prettyFormat: "03-09-2021" },
        "21": { text: "Weight (lb)", type: "control_textbox", answer: "27" },
        "23": { text: "Pet Photo", type: "control_fileupload", answer: [`https://www.jotform.com/uploads/petvax/262500538572052/9001${tag}1/biscuit.jpg`] },
        "25": { text: "Previous Vaccine History", type: "control_textarea", answer: "Rabies 2023 at Village Vet" },
        "26": { text: "Which vaccines are you interested in?", type: "control_checkbox", answer: ["Rabies", "DHPP/DAPP"] },
        "27": { text: "Has your pet ever had a reaction to vaccinations?", type: "control_radio", answer: "No" },
        "35": { text: "I certify that the information provided is accurate and true to the best of my knowledge", type: "control_checkbox", answer: ["I agree"] },
        "36": { text: "Owner Signature", type: "control_signature", answer: `https://www.jotform.com/uploads/petvax/262500538572052/9001${tag}1/sig.png` },
      },
    },
    {
      id: `9001${tag}2`, form_id: "262500542108042", created_at: "2026-11-03 18:40:12", status: "ACTIVE",
      answers: {
        "2": { text: "Owner Full Name", type: "control_fullname", answer: { first: "Riley", last: `Moss${tag}` } },
        "3": { text: "Address", type: "control_address", answer: { addr_line1: "12 Bank St", addr_line2: "", city: "New York", state: "New York", postal: "10014", country: "United States" } },
        "4": { text: "Apartment/Unit", type: "control_textbox", answer: "4R" },
        "5": { text: "Primary Phone Number", type: "control_phone", answer: { full: "917-555-0142" } },
        "6": { text: "Email Address", type: "control_email", answer: `Riley.${tag}@example.net` },
        "7": { text: "Pet Name", type: "control_textbox", answer: "Biscuit" },
        "8": { text: "Species", type: "control_radio", answer: "Dog" },
        "12": { text: "Spayed/Neutered", type: "control_radio", answer: "Yes" },
        "13": { text: "My pet visits a boarding kennel", type: "control_radio", answer: "Yes" },
        "16": { text: "My pet has exposure to wildlife", type: "control_radio", answer: "No" },
        "17": { text: "Has your pet had any prior vaccine reactions? (Check all that apply)", type: "control_checkbox", answer: { "0": "Hives", other: "Sleepy for a day" } },
        "21": { text: "I have read and understand the above consent statement.", type: "control_checkbox", answer: ["I confirm"] },
        "22": { text: "Owner Signature", type: "control_signature", answer: `https://www.jotform.com/uploads/petvax/262500542108042/9001${tag}2/sig.png` },
        "23": { text: "Date Signed", type: "control_datetime", answer: { month: "11", day: "03", year: "2026" } },
      },
    },
    {
      // A consent without a signature image (should import but be flagged)
      id: `9001${tag}3`, form_id: "262500542108042", created_at: "2026-11-04 08:00:00", status: "ACTIVE",
      answers: {
        "2": { text: "Owner Full Name", type: "control_fullname", answer: { first: "Casey", last: `Nguyen${tag}` } },
        "5": { text: "Primary Phone Number", type: "control_phone", answer: { full: "212-555-0177" } },
        "6": { text: "Email Address", type: "control_email", answer: `casey.${tag}@example.net` },
        "7": { text: "Pet Name", type: "control_textbox", answer: "Mochi" },
        "8": { text: "Species", type: "control_radio", answer: "Cat" },
        "21": { text: "I have read and understand the above consent statement.", type: "control_checkbox", answer: ["I confirm"] },
      },
    },
  ];
}

/** A real 1x1 PNG, used as the downloaded signature/photo bytes. */
export const PNG_BYTES = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
