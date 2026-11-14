"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

let lastUserId: string | null | undefined;

/**
 * Login/logout happen in Server Actions, so the browser's query cache can't see
 * them. The header renders this with the server-verified user id; when it
 * changes, drop every cached per-user query (cart, account ref).
 */
export function SessionSync({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (lastUserId !== undefined && lastUserId !== userId) queryClient.clear();
    lastUserId = userId;
  }, [userId, queryClient]);
  return null;
}
