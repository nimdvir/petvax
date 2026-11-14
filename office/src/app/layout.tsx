import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PetVax Office",
  description: "Secure PetVax house-call vaccination management",
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body><div className="shell">
    <header className="masthead"><a href="/" className="logo" aria-label="PetVax Office home">PetVax <span>Office</span></a><nav><a href="/office">Staff dashboard</a></nav></header>
    <main>{children}</main><footer>PetVax · Private vaccination records are accessible only to authorized staff.</footer>
  </div></body></html>;
}
