import { startLogin } from "@/const";
import { supabase, setSupabaseAccessToken } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const usesSupabase = Boolean(supabase);
  const [sessionReady, setSessionReady] = useState(!usesSupabase);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSupabaseAccessToken(data.session?.access_token ?? null);
      setSessionReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseAccessToken(session?.access_token ?? null);
      setSessionReady(true);
      void utils.auth.me.invalidate();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [utils]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionReady,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSupabaseAccessToken(null);
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      return;
    }
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: !sessionReady || meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
    sessionReady,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || usesSupabase) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    if (redirectPath) window.location.href = redirectPath;
    else startLogin();
  }, [
    logoutMutation.isPending,
    meQuery.isLoading,
    redirectOnUnauthenticated,
    redirectPath,
    state.user,
    usesSupabase,
  ]);

  return {
    ...state,
    usesSupabase,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
