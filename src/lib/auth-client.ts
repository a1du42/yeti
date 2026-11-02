"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
  fetchOptions: { timeout: 15000, retry: 0 },
});
