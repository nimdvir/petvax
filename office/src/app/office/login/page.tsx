import { login } from "./actions";
export default async function StaffLogin({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const { error } = await searchParams;
  return <section className="card stack" style={{maxWidth:450,margin:"2rem auto"}}>
    <div className="eyebrow">Authorized staff only</div>
    <h1>PetVax Office sign in</h1>
    <p className="muted">This dashboard contains confidential owner and pet records.</p>
    {error && <p className="notice error" role="alert">
      {error === "access" ? "This account has not been authorized for PetVax Office." : "Invalid sign-in. Check your credentials."}
    </p>}
    <form action={login} className="stack">
      <label>Email<input required type="email" name="email" autoComplete="username"/></label>
      <label>Password<input required type="password" name="password" autoComplete="current-password"/></label>
      <button type="submit">Sign in</button>
    </form>
  </section>;
}
