export interface IntakeRecord {
  owner: { fullName: string; email: string; phone: string; address: string };
  pets: { name: string; species: string; breed: string; sex: string; notes: string }[];
}
export function cleanText(value: unknown, limit?: number): string;
export function validateIntake(input: unknown): {
  valid: boolean; errors: string[]; payload: IntakeRecord;
  signedName: string; token: string; submissionKey: string;
};
