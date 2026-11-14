export function cleanText(value, limit = 160) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function validateIntake(input) {
  const data = input && typeof input === "object" ? input : {};
  const owner = data.owner && typeof data.owner === "object" ? data.owner : {};
  const fullName = cleanText(owner.fullName, 120);
  const email = cleanText(owner.email, 254).toLowerCase();
  const phone = cleanText(owner.phone, 40);
  const address = cleanText(owner.address, 240);
  const signedName = cleanText(data.signedName, 120);
  const token = cleanText(data.token, 200);
  const submissionKey = cleanText(data.submissionKey, 80);
  const pets = Array.isArray(data.pets) ? data.pets.slice(0, 6).map((p) => ({
    name: cleanText(p?.name, 100),
    species: cleanText(p?.species, 30).toLowerCase(),
    breed: cleanText(p?.breed, 90),
    sex: cleanText(p?.sex, 25),
    notes: cleanText(p?.notes, 700)
  })) : [];
  const errors = [];
  if (fullName.length < 2) errors.push("Owner name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email is required.");
  if (phone.length < 7) errors.push("A contact phone number is required.");
  if (address.length < 8) errors.push("A house-call address is required.");
  if (pets.length < 1 || pets.length > 6) errors.push("Register 1–6 pets.");
  if (pets.some(p => !p.name || !["dog", "cat"].includes(p.species))) errors.push("Each pet needs a name and a valid species (dog or cat).");
  if (signedName.length < 2 || signedName.toLowerCase() !== fullName.toLowerCase()) errors.push("Signature must match the owner's name.");
  if (data.accepted !== true) errors.push("Please affirm your vaccination consent.");
  if (!/^[a-zA-Z0-9_-]{32,200}$/.test(token)) errors.push("This form link is invalid.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionKey)) errors.push("Submission identifier is invalid.");
  return { valid: errors.length === 0, errors, payload: { owner: { fullName, email, phone, address }, pets }, signedName, token, submissionKey };
}
