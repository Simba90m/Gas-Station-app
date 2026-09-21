"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  sendMagicLinkAction,
  signInAction,
  type SignInState,
} from "./actions";

const INITIAL_STATE: SignInState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    INITIAL_STATE,
  );
  const [magicLinkState, magicLinkAction, isMagicLinkPending] = useActionState(
    sendMagicLinkAction,
    INITIAL_STATE,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Gas Station Platform
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Sign in to the admin dashboard.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isPending}
          >
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-center text-xs text-slate-500">
            Email login test
          </p>

          <form
            action={magicLinkAction}
            className="space-y-2"
          >
            <Input
              name="email"
              type="email"
              placeholder="Enter your email"
              required
            />

            {magicLinkState.error && (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {magicLinkState.error}
              </p>
            )}

            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={isMagicLinkPending}
            >
              {isMagicLinkPending ? "Sending..." : "Send Magic Link"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Owner, manager, and station manager accounts only.
          Employees and customers use the mobile app.
        </p>
      </Card>
    </div>
  );
}