"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

export default function RootPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending) {
      router.replace(session ? "/dashboard" : "/sign-in");
    }
  }, [session, isPending, router]);

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
    </div>
  );
}
