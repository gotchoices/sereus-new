/**
 * use-chat.ts — React hook for the chat message list and send/receive.
 *
 * Because Optimystic doesn't yet expose reactive subscriptions, this hook
 * polls the strand's Quereus database on a configurable interval.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { StrandInstance } from '@serfab/cadre-core';
import {
  insertMember,
  insertMessage,
  queryMessages,
  queryMembers,
  type ChatMessage,
  type ChatMember,
} from './chat-operations.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseChatOptions {
  /** The active strand instance (null if not yet created/joined) */
  strand: StrandInstance | null;
  /** Local member ID (e.g. peerId) */
  memberId: string | null;
  /** Local display name */
  memberName?: string;
  /** Polling interval in ms (default 2000) */
  pollIntervalMs?: number;
}

export interface UseChatResult {
  /** Chat messages, oldest first */
  messages: ChatMessage[];
  /** Known members */
  members: ChatMember[];
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Last error */
  error: string | null;
  /** Send a text message */
  send: (content: string) => Promise<void>;
  /** Force a refresh */
  refresh: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(opts: UseChatOptions): UseChatResult {
  const { strand, memberId, memberName, pollIntervalMs = 2000 } = opts;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track latest strand so callbacks stay current
  const strandRef = useRef(strand);
  strandRef.current = strand;

  const memberIdRef = useRef(memberId);
  memberIdRef.current = memberId;

  // ── Register local member on first attach ──────────────────────────────

  const registeredRef = useRef(false);

  useEffect(() => {
    if (!strand || !memberId || registeredRef.current) return;

    (async () => {
      try {
        await insertMember(strand, memberId, memberName ?? memberId);
        registeredRef.current = true;
      } catch (err) {
        console.warn('Failed to register member:', err);
      }
    })();
  }, [strand, memberId, memberName]);

  // ── Fetch messages + members ───────────────────────────────────────────

  const refresh = useCallback(async () => {
    const s = strandRef.current;
    if (!s || s.status !== 'active') return;

    try {
      const [msgs, mems] = await Promise.all([
        queryMessages(s),
        queryMembers(s),
      ]);
      setMessages(msgs);
      setMembers(mems);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Polling loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!strand || strand.status !== 'active') {
      setLoading(false);
      return;
    }

    // Initial fetch
    void refresh();

    const timer = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [strand, strand?.status, pollIntervalMs, refresh]);

  // ── Send ───────────────────────────────────────────────────────────────

  const send = useCallback(async (content: string) => {
    const s = strandRef.current;
    const mid = memberIdRef.current;
    if (!s) throw new Error('No strand attached');
    if (!mid) throw new Error('No member ID');

    const msg = await insertMessage(s, mid, content);
    // Optimistic update — prepend immediately, next poll will reconcile
    setMessages(prev => [...prev, msg]);
  }, []);

  return { messages, members, loading, error, send, refresh };
}

