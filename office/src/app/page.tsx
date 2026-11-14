export default function Home() {
  return <section className="card stack"><div className="eyebrow">PetVax Office</div>
    <h1>House-call vaccination management</h1>
    <p>Clients: use the secure registration link provided by PetVax. Staff: sign in to review registration, consent and pet records.</p>
    <div><a className="button" href="/office">Staff sign-in</a></div>
    <p className="muted">This application is under development. Public registration links will become available only after safety and consent wording review.</p>
  </section>;
}
