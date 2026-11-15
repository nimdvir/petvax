import type { CertificateSnapshot } from "@/lib/certificates/data";

export const sampleSnapshot = (over: Partial<CertificateSnapshot> = {}): CertificateSnapshot => ({
  certificate_number: "PVX-2026-001001",
  verification_code: "a1b2c3d4e5f6a7b8c9",
  issued_at: "2026-11-14T20:00:00.000Z",
  issued_on: "2026-11-14",
  business: { name: "PetVax", tagline: "House-call pet vaccinations in New York City", phone: "(212) 555-0199", email: "petvaxnyc@gmail.com",
    website: "www.petvax.org", address: null, footer: "Keep this certificate with your pet's records.", accent_color: "#b91c1c" },
  owner: { name: "Dana Rivera", address: "500 W 43rd St, Apt 12B, New York, NY, 10036", phone: "(212) 555-0100", email: "dana@example.com" },
  pet: { name: "Rex", species: "Dog", breed: "Beagle", sex: "Male", spayed_neutered: true, color: "Tricolor",
    date_of_birth: "2021-03-04", age: "5 years", weight_lb: 24.5, microchip: "985112003456789" },
  vaccinations: [
    { id: "v1", vaccine_name: "Rabies (3-year)", vaccine_type: "Rabies", is_rabies: true, manufacturer: "TestPharma", lot_number: "RB-4471",
      serial_number: "RB-4471", lot_expiration: "2027-08-31", administered_on: "2026-11-14", next_due_on: "2029-11-14", route: "SC",
      site: "Right hind", duration_months: 36, rabies_tag_number: "NYC-55821", administered_by_name: "Test Vet", administered_by_credentials: "DVM",
      administered_by_license: "TEST-000" },
    { id: "v2", vaccine_name: "DHPP / DAPP", vaccine_type: "DHPP", is_rabies: false, manufacturer: "TestPharma", lot_number: "DH-2210",
      serial_number: null, lot_expiration: "2027-03-31", administered_on: "2026-11-14", next_due_on: "2027-11-14", route: "SC",
      site: "Right fore", duration_months: 12, rabies_tag_number: null, administered_by_name: "Test Vet", administered_by_credentials: "DVM",
      administered_by_license: "TEST-000" },
  ],
  signer: { name: "Test Vet", credentials: "DVM", license_number: "TEST-000", license_state: "NY", signature_path: null },
  verify_url: "https://office.petvax.org/verify/a1b2c3d4e5f6a7b8c9",
  ...over,
});
