"use client";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  enterGuest,
  enterMockSession,
  prepareMockFlow,
  clearMockFlow,
  completeMockConfirmation,
  completeMockRecovery,
  advanceOnboarding,
  backOnboarding,
  saveOnboardingJob,
  clearOnboardingSuccess,
  finishOnboarding,
} from "@/store/appSlice";
import {
  entryDestination,
  normalizeEmail,
  prepareOnboardingJob,
  validDemoFlow,
  type Credentials,
  type OnboardingJobDraft,
} from "./model";
import { mockAuth } from "./mockAuth";
import type { WorkspaceCommand } from "@/lib/workspace";

export function useAuthActions() {
  const { read, commit } = useWorkspace(),
    router = useRouter();
  const save = async (command: WorkspaceCommand) => {
    let validation: string | null = null;
    const saved = await commit((latest) => {
      try {
        return typeof command === "function" ? command(latest) : command;
      } catch (error) {
        validation =
          error instanceof Error ? error.message : "Review the current data.";
        throw error;
      }
    });
    if (!saved)
      throw new Error(
        validation ?? "Could not save. Your inputs are kept; try again.",
      );
  };
  const ensureOnboarding = (data: ReturnType<typeof read>) => {
    if (data.auth.session !== "mock")
      throw new Error("Sign in before setting up a profile.");
  };
  return {
    signIn: async (input: Credentials) => {
      await mockAuth.signIn(input);
      await save((latest) => {
        const remembered = latest.auth.lastProfile;
        const name =
          normalizeEmail(remembered?.email ?? "") ===
          normalizeEmail(input.email)
            ? remembered?.name
            : input.name;
        return enterMockSession({
          mode: "mock",
          email: input.email,
          name: name ?? "",
        });
      });
      router.replace(entryDestination(read()));
    },
    signUp: async (input: Credentials, plan: "free" | "premium") => {
      const account = await mockAuth.signUp(input);
      await save(
        prepareMockFlow({
          id: crypto.randomUUID(),
          kind: "confirmation",
          plan,
          email: account.email,
          name: account.name,
          createdAt: Date.now(),
        }),
      );
    },
    recover: async (email: string) => {
      await mockAuth.requestRecovery(email);
      await save(
        prepareMockFlow({
          id: crypto.randomUUID(),
          kind: "recovery",
          email,
          name: "",
          createdAt: Date.now(),
        }),
      );
    },
    resend: async () =>
      save((latest) => {
        const flow = latest.auth.pending;
        if (flow?.kind !== "confirmation")
          throw new Error("Prepare a new confirmation first.");
        return prepareMockFlow({
          ...flow,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        });
      }),
    cancel: async (id?: string) => {
      if (read().auth.pending && (!id || read().auth.pending?.id === id))
        await save((latest) => {
          if (id && latest.auth.pending?.id !== id)
            throw new Error(
              "A newer flow is pending. Return to sign-in to review it.",
            );
          return clearMockFlow();
        });
    },
    guest: async () => {
      if (read().auth.session !== "guest" || read().auth.pending)
        await save(enterGuest());
      router.replace("/tracker");
    },
    current: () => router.replace(entryDestination(read())),
    callback: () => {
      const flow = read().auth.pending;
      if (flow)
        router.push(
          `/auth-callback?demo=1&flow=${flow.kind}&id=${encodeURIComponent(flow.id)}`,
        );
    },
    confirm: async (params: { demo?: string; flow?: string; id?: string }) => {
      await save((latest) => {
        if (
          params.flow !== "confirmation" ||
          !validDemoFlow(latest.auth.pending, params, Date.now())
        )
          throw new Error(
            "This mock link is invalid, expired or already used. Prepare a new link.",
          );
        return completeMockConfirmation({ id: params.id!, now: Date.now() });
      });
      router.replace(entryDestination(read()));
    },
    resetPassword: async (
      params: { demo?: string; flow?: string; id?: string },
      password: string,
      confirmation: string,
    ) => {
      if (
        params.flow !== "recovery" ||
        !validDemoFlow(read().auth.pending, params, Date.now())
      )
        throw new Error("This mock recovery link is no longer current.");
      await mockAuth.setPassword(password, confirmation);
      await save((latest) => {
        if (!validDemoFlow(latest.auth.pending, params, Date.now()))
          throw new Error(
            "This mock recovery link changed or expired. Prepare a new one.",
          );
        return completeMockRecovery({ id: params.id!, now: Date.now() });
      });
    },
    name: (name: string) =>
      save((latest) => {
        ensureOnboarding(latest);
        if (!name.trim()) throw new Error("Enter your name.");
        return advanceOnboarding(name);
      }),
    back: () =>
      save((latest) => {
        ensureOnboarding(latest);
        return backOnboarding();
      }),
    job: async (draft: OnboardingJobDraft) => {
      const id = crypto.randomUUID();
      await save((latest) => {
        ensureOnboarding(latest);
        if (latest.auth.onboarding.lastSavedJobId)
          throw new Error(
            "This job is already saved. Choose Add another to create a different profile.",
          );
        const result = prepareOnboardingJob(latest, draft, id);
        if ("error" in result) throw new Error(result.error);
        return saveOnboardingJob({ draft, id });
      });
    },
    another: () =>
      save((latest) => {
        ensureOnboarding(latest);
        if (!latest.auth.onboarding.lastSavedJobId)
          throw new Error("You can add the next job now.");
        return clearOnboardingSuccess();
      }),
    finish: async (name: string, review = false) => {
      if (!(
        read().auth.onboarding.complete &&
        (!name.trim() || name.trim() === read().account.name)
      ))
        await save((latest) => {
          ensureOnboarding(latest);
          return finishOnboarding(name);
        });
      router.replace(review ? "/settings" : "/tracker");
    },
  };
}
