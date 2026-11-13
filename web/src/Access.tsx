import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, type Account, type Session } from "./api";
import { Orb } from "./Orb";

/** Who is signed in (null when the server runs without accounts) and how to sign out. */
const AccountCtx = createContext<{ user: Account | null; logout: () => void }>({ user: null, logout: () => {} });
export const useAccount = () => useContext(AccountCtx);

/** Shows the app once the visitor is signed in; the sign-in screen until then. Transparent when accounts are off. */
export function AccessGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.session().then(setSession, (e: Error) => setError(e.message)); }, []);

  if (error) return <p className="grid h-svh place-items-center p-6 text-center text-sm text-muted-foreground">Il server di Sibilla non risponde: {error}</p>;
  if (!session) return <div className="grid h-svh place-items-center"><Spinner /></div>;
  if (session.enabled && !session.user) return <SignIn signup={session.signup} onDone={(user) => setSession({ ...session, user })} />;
  const logout = () => { api.logout().finally(() => setSession({ ...session, user: null })); };
  return <AccountCtx.Provider value={{ user: session.user, logout }}>{children}</AccountCtx.Provider>;
}

function SignIn({ signup, onDone }: { signup: boolean; onDone: (user: Account) => void }) {
  // With no account yet the only thing to do is create the first one.
  const [mode, setMode] = useState<"login" | "register">(signup ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creating = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { onDone((await (creating ? api.register(email, password) : api.login(email, password))).user); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-background px-6 py-10 text-foreground">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center gap-6">
        <Orb className="size-20" />
        <h1 className="text-center font-heading text-2xl font-semibold tracking-tight">
          {creating ? "Crea il tuo account Sibilla" : "Accedi a Sibilla"}
        </h1>
        <FieldGroup className="w-full">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 8 : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {creating && <FieldDescription>Almeno 8 caratteri.</FieldDescription>}
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>{busy && <Spinner />}{creating ? "Crea account" : "Accedi"}</Button>
        </FieldGroup>
        {signup && (
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setMode(creating ? "login" : "register"); setError(null); }}>
            {creating ? "Ho già un account" : "Crea un account"}
          </button>
        )}
      </form>
    </div>
  );
}
