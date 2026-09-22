"use client";

// ============================================================
// VoiceChessmate — account panel
//
// Sign-in is a magic link and nothing else. No password field, no CAPTCHA, no
// social buttons, no timed redirect. For a screen reader user a password flow
// means a hidden field, an unlabelled strength meter and error text that often
// never gets announced — a magic link is one labelled input and one button.
//
// The panel hides itself entirely when auth is not configured, rather than
// offering a control that cannot work.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient, isAuthConfigured } from "@/lib/supabase/browser";

type Status = "idle" | "sending" | "sent" | "error";

interface Profile {
  rating: number;
  gamesPlayed: number;
}

export function AccountPanel() {
  const [configured] = useState(() => isAuthConfigured());
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Load account state. Deliberately after mount: this is browser-only data,
  // and reading it during render would reintroduce the hydration mismatch
  // logged in BUGLOG 2026-09-16.
  const readAccount = useCallback(async (): Promise<{
    signedIn: boolean;
    profile: Profile | null;
  } | null> => {
    try {
      const res = await fetch("/api/games", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return { signedIn: Boolean(data.signedIn), profile: data.profile ?? null };
    } catch {
      return null; // offline or degraded — the panel stays anonymous
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      const account = await readAccount();
      if (cancelled || !account) return;
      setSignedIn(account.signedIn);
      setProfile(account.profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, readAccount]);

  // On returning from the magic link, claim any games played anonymously on
  // this device and announce the outcome.
  useEffect(() => {
    if (!configured) return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (!auth) return;

    // Clean the URL so a refresh does not re-run this.
    params.delete("auth");
    const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", clean);

    let cancelled = false;
    void (async () => {
      if (auth !== "ok") {
        if (cancelled) return;
        setStatus("error");
        setMessage("That sign-in link did not work. Request a new one.");
        return;
      }
      try {
        const res = await fetch("/api/auth/claim", { method: "POST" });
        const data = await res.json();
        const account = await readAccount();
        if (cancelled) return;
        if (account) {
          setSignedIn(account.signedIn);
          setProfile(account.profile);
        }
        setStatus("idle");
        setMessage(
          data.claimed > 0
            ? `Signed in. ${data.claimed} game${data.claimed === 1 ? "" : "s"} from this device saved to your account. Rating ${data.rating}.`
            : "Signed in. Your games will be saved from now on.",
        );
      } catch {
        if (!cancelled) setMessage("Signed in.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, readAccount]);

  // Focus management: opening the panel moves focus to the field, Escape
  // returns it to the trigger. Without this a keyboard user has to tab back
  // through the whole header.
  useEffect(() => {
    if (open) emailRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const node = panelRef.current;
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [open]);

  const sendLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const supabase = browserClient();
      if (!supabase) return;

      const address = email.trim();
      if (!address) {
        setStatus("error");
        setMessage("Enter your email address first.");
        emailRef.current?.focus();
        return;
      }

      setStatus("sending");
      setMessage("Sending your sign-in link…");

      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        setStatus("error");
        setMessage(`Could not send the link. ${error.message}`);
        emailRef.current?.focus();
        return;
      }

      setStatus("sent");
      setMessage(
        `Check your email. We sent a sign-in link to ${address}. It opens this page already signed in.`,
      );
    },
    [email],
  );

  const signOut = useCallback(async () => {
    const supabase = browserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedIn(false);
    setProfile(null);
    setOpen(false);
    setMessage("Signed out. You can keep playing — games just won't be saved.");
  }, []);

  // Auth not set up for this deployment: render nothing at all.
  if (!configured) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="account-panel"
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {signedIn
          ? profile
            ? `Account · ${profile.rating}`
            : "Account"
          : "Sign in to save games"}
      </button>

      {open && (
        <div
          id="account-panel"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-bg-raised p-4 shadow-xl"
        >
          {signedIn ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Your account</h2>
              {profile && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-fg-muted">Rating</dt>
                    <dd className="text-lg font-semibold">{profile.rating}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Games played</dt>
                    <dd className="text-lg font-semibold">{profile.gamesPlayed}</dd>
                  </div>
                </dl>
              )}
              <p className="text-xs text-fg-muted">
                Your games are saved and will resume on any device you sign in
                from.
              </p>
              <button
                type="button"
                onClick={signOut}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg-raised focus-visible:outline focus-visible:outline-2"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-3">
              <h2 className="text-sm font-semibold">Save your games</h2>
              <p className="text-xs text-fg-muted">
                You can play without an account. Signing in saves your games so
                you can resume them, and tracks your rating.
              </p>

              <div>
                <label htmlFor="account-email" className="block text-xs font-medium mb-1">
                  Email address
                </label>
                <input
                  ref={emailRef}
                  id="account-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby="account-email-help"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2"
                />
                <p id="account-email-help" className="mt-1 text-xs text-fg-muted">
                  We send a link that signs you in. No password to remember.
                </p>
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg disabled:opacity-60 focus-visible:outline focus-visible:outline-2"
              >
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          )}
          {message && (
            <p
              className={`mt-3 text-xs ${status === "error" ? "text-danger" : "text-fg-muted"}`}
            >
              {message}
            </p>
          )}
        </div>
      )}

      {/* Announced regardless of whether the panel is open, because the result
          of a sign-in arrives after a page load the user did not initiate from
          this control. Always rendered so the region exists before it fills. */}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
