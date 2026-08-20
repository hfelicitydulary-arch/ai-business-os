"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSignupMessage(null);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSignupMessage(
          "Account created. If email confirmation is required, check your inbox before signing in."
        );
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">AI BOS</h1>
          <p className="text-yellow-400 text-xs mt-2 break-all">
            DEBUG URL: [{process.env.NEXT_PUBLIC_SUPABASE_URL || "EMPTY"}]
          </p>
          <p className="text-yellow-400 text-xs break-all">
            DEBUG KEY LENGTH: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0}
          </p>
          <p className="text-white/50 mt-2">
            {mode === "signin" ? "Sign in to continue" : "Create an account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/20 rounded p-3 text-white"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-white/5 border border-white/20 rounded p-3 text-white"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {signupMessage && <p className="text-green-400 text-sm">{signupMessage}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 text-black rounded p-3 font-semibold disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setSignupMessage(null);
          }}
          className="w-full text-center text-sm text-white/50"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}


