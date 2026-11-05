import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Logo, Notice } from "../components/ui";
import { supabase } from "../lib/supabase";
import { isIOSDevice } from "../lib/platform";
import { logOut } from "../lib/auth";

const releasesPage = import.meta.env.VITE_RELEASES_PAGE ?? "https://github.com/KenhighRDS/j-releases/releases";

/** Target of the invite email. Marks the profile active, then explains how to get J on the phone. */
export function Welcome() {
  const [state, setState] = useState<"checking" | "ok" | "expired">("checking");
  const [email, setEmail] = useState("");
  useEffect(() => {
    let tries = 0;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setEmail(data.session.user.email ?? "");
        await supabase.rpc("profile_accept_invite");
        setState("ok");
        return;
      }
      if (++tries < 6) window.setTimeout(check, 500); else setState("expired");
    };
    void check();
  }, []);
  return (
    <div className="app-frame">
      <div className="scroll-area">
        <div className="mx-auto w-full max-w-sm px-6 py-12">
          <Logo size={64} className="mb-6" />
          {state === "checking" && <p className="text-muted">Confirming your email…</p>}
          {state === "expired" && (
            <>
              <h1 className="text-[28px] font-semibold tracking-tight">This link has expired</h1>
              <p className="mt-3 text-[15px] text-muted">Invite links work for 7 days. Ask the admin to send a new one.</p>
              <Link to="/login" className="mt-6 inline-block text-[15px] underline">Already confirmed? Sign in</Link>
            </>
          )}
          {state === "ok" && (
            <>
              <h1 className="text-[28px] font-semibold tracking-tight leading-tight">You're in, {email.split("@")[0]}.</h1>
              <p className="mt-3 text-[15px] text-muted">Get J on your phone so signals reach you the moment they're called.</p>
              <section className="mt-8">
                <h2 className="text-[17px] font-semibold">iPhone</h2>
                <ol className="mt-2 space-y-2 text-[15px] text-muted list-decimal pl-5">
                  <li>Open this site in Safari and tap <span className="text-text">Share</span>.</li>
                  <li>Tap <span className="text-text">Add to Home Screen</span>, then <span className="text-text">Add</span>.</li>
                  <li>Open J from the icon, sign in with a code, then turn on notifications in Settings.</li>
                </ol>
                <div className="mt-3"><Notice>The installed app has its own storage, so you sign in once inside it with a code.</Notice></div>
              </section>
              <section className="mt-8">
                <h2 className="text-[17px] font-semibold">Android</h2>
                <p className="mt-2 text-[15px] text-muted">Install the J app so alerts ring like a call, even on the lock screen.</p>
                <a className="mt-3 inline-flex h-12 items-center rounded-[14px] border border-border px-5 text-[15px]" href={releasesPage} target="_blank" rel="noreferrer">Download the Android app</a>
              </section>
              <div className="mt-10 flex gap-3">
                {!isIOSDevice && <Link to="/"><Button type="button">Open J</Button></Link>}
                <Button variant="quiet" type="button" onClick={() => { void logOut(); }}>Sign out here</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
