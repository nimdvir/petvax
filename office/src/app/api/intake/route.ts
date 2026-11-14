import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { validateIntake } from "@/lib/intake-rules.mjs";

export const runtime = "nodejs";
export async function POST(request: Request) {
  // Same-origin JSON submissions only; add managed distributed rate limiting and
  // anti-bot verification before activating reusable links in production.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin)
    return NextResponse.json({error:"Origin rejected"},{status:403});
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({error:"JSON required"},{status:415});
  if (Number(request.headers.get("content-length")||0) > 20000)
    return NextResponse.json({error:"Submission too large"},{status:413});
  let input:unknown;
  try {
    const body = await request.text();
    if (body.length > 20000) throw new Error("too large");
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({error:"Invalid submission"},{status:400});
  }
  const checked = validateIntake(input);
  if (!checked.valid)
    return NextResponse.json({error:checked.errors.join(" ")},{status:400});
  const digest = createHash("sha256").update(checked.token).digest("hex");
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("pvo_accept_intake",{
      p_digest:digest,p_key:checked.submissionKey,
      p_payload:checked.payload,p_signed_name:checked.signedName
    });
    if (error || !data?.submissionId) {
      console.error("PetVax intake write failed",error?.code || "invalid RPC result");
      return NextResponse.json({error:"Unable to save. Please check your link and retry."},{status:503});
    }
    return NextResponse.json({
      submissionId: data.submissionId,
      status:data.status
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Service unavailable. Please retry later."},{status:503});
  }
}
