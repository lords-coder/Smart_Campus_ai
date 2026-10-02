"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, apiErrorMessage } from "@/lib/api";
import type { AiAskResponse, AiSource, Role } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: AiSource[];
}

const SOURCE_LABEL: Record<AiSource, string> = {
  attendance: "Attendance data",
  fees: "Fee data",
  timetable: "Timetable data",
};

/** Role-aware starter questions: each role only sees prompts it can answer. */
const STARTERS: Record<Role, string[]> = {
  STUDENT: [
    "What's my attendance?",
    "What's my attendance in Data Structures?",
    "How much fee do I have pending?",
    "Show my fee payment history.",
    "What classes do I have today?",
    "When is my next class?",
  ],
  FACULTY: ["What classes do I have today?", "When is my next class?", "What's my attendance?"],
  ADMIN: [
    "How much fee is pending across the institute?",
    "How many classes are scheduled today?",
    "Show my fee payment history.",
  ],
  PARENT: [
    "What is my child's attendance?",
    "What fees are pending for my child?",
    "What classes does my child have today?",
  ],
  ALUMNI: [],
  SUPER_ADMIN: ["How many classes are scheduled today?"],
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function ChatAssistant() {
  const { user } = useAuth();
  const role: Role = user?.role ?? "STUDENT";
  const starters = STARTERS[role] ?? STARTERS.STUDENT;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);
  const busyRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function ask(question: string, isRetry = false): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);

    if (!isRetry) {
      setMessages((prev) => [...prev, { id: newId(), role: "user", text: question }]);
    }

    try {
      const data = await api<AiAskResponse>("/ai/ask", {
        method: "POST",
        body: { message: question },
        timeoutMs: 30_000,
      });
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: data.answer, sources: data.sources },
      ]);
      setRetryText(null);
    } catch (err) {
      setError(apiErrorMessage(err));
      setRetryText(question);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    void ask(text);
  }

  function clearConversation() {
    if (loading) return;
    setMessages([]);
    setError(null);
    setRetryText(null);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            SmartCampus AI
          </CardTitle>
          <Button
            id="ai-clear"
            variant="outline"
            size="sm"
            onClick={clearConversation}
            disabled={loading || (messages.length === 0 && !error)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Answers are generated from your SmartCampus records only — attendance, fees and timetable.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div id="ai-messages" className="max-h-[55vh] min-h-[220px] space-y-3 overflow-y-auto px-1 py-1">
          {messages.length === 0 && !error ? (
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Ask about your campus data"
              description="Try one of these, or type your own question."
            />
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.role === "assistant" && (message.sources?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.sources?.map((source) => (
                        <Badge key={source} variant="outline" className="bg-background/60 text-[11px]">
                          {SOURCE_LABEL[source]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.length === 0 && (
          <div id="ai-starters" className="flex flex-wrap gap-2">
            {starters.map((starter) => (
              <Button
                key={starter}
                variant="outline"
                size="sm"
                onClick={() => void ask(starter)}
                disabled={loading}
              >
                {starter}
              </Button>
            ))}
          </div>
        )}

        {error && (
          <div id="ai-error">
            <ErrorState
              title="The assistant could not answer"
              message={error}
              onRetry={retryText ? () => void ask(retryText, true) : undefined}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            id="ai-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about attendance, fees or your timetable..."
            maxLength={1000}
            disabled={loading}
            autoComplete="off"
          />
          <Button id="ai-send" type="submit" disabled={loading || draft.trim().length === 0}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
