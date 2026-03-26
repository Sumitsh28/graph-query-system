"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Terminal,
  ChevronDown,
  Loader2,
  X,
  Mic,
  MicOff,
  Bot,
  User,
  Sparkles,
  Copy,
  Check,
  Menu,
  Plus,
  MessageSquare,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

type Message = {
  role: string;
  text: string;
  cypher?: string;
  latency?: string;
  contextId?: string | null;
};
type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

export default function ChatInterface({
  activeNodeId,
  onClearSelection,
}: {
  activeNodeId: string | null;
  onClearSelection: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const savedSessions = localStorage.getItem("chat_sessions");
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      setSessions(parsed);
      if (parsed.length > 0) {
        setCurrentSessionId(parsed[0].id);
      } else {
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("chat_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, currentSessionId, isLoading]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((r: any) => r[0].transcript)
            .join("");
          setInput(transcript);
        };
        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.onend = () => setIsListening(false);
      }
    }
  }, []);

  const createNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: "New Conversation",
      messages: [],
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setIsSidebarOpen(false);
    onClearSelection();
  };

  const deleteSession = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== idToDelete);
    setSessions(updated);
    if (updated.length === 0) createNewSession();
    else if (currentSessionId === idToDelete)
      setCurrentSessionId(updated[0].id);
    if (updated.length === 0) localStorage.removeItem("chat_sessions");
  };

  const currentMessages =
    sessions.find((s) => s.id === currentSessionId)?.messages || [];

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInput("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleCopyCypher = (cypher: string, index: number) => {
    navigator.clipboard.writeText(cypher);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText || input;
    if (!textToSend.trim() || isLoading) return;

    if (isListening) toggleListening();

    const newMsg: Message = {
      role: "user",
      text: textToSend,
      contextId: activeNodeId,
    };

    setSessions((prev) =>
      prev
        .map((session) => {
          if (session.id === currentSessionId) {
            const title =
              session.messages.length === 0
                ? textToSend.slice(0, 25) + "..."
                : session.title;
            return {
              ...session,
              title,
              messages: [...session.messages, newMsg],
              updatedAt: Date.now(),
            };
          }
          return session;
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );

    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("https://nexus-ip.duckdns.org/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: textToSend,
          session_id: currentSessionId,
          context: activeNodeId
            ? `The user is currently analyzing the node with ID: ${activeNodeId}. Keep this in mind.`
            : null,
        }),
      });

      const data = await res.json();

      if (data.highlighted_nodes && data.highlighted_nodes.length > 0) {
        window.dispatchEvent(
          new CustomEvent("highlightPath", { detail: data.highlighted_nodes }),
        );
      }

      const agentMsg: Message = {
        role: data.role,
        text: data.text,
        cypher: data.cypher,
        latency: data.latency,
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? {
                ...session,
                messages: [...session.messages, agentMsg],
                updatedAt: Date.now(),
              }
            : session,
        ),
      );
    } catch (error) {
      const errorMsg: Message = {
        role: "agent",
        text: "Error connecting to the LangGraph backend.",
      };
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? { ...session, messages: [...session.messages, errorMsg] }
            : session,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedPrompts = [
    "Which products have the most billing documents?",
    "Find broken sales flows without billing.",
    "Show me the overall bottlenecks in the supply chain.",
  ];

  return (
    <div className="flex relative h-full bg-white rounded-xl shadow-xl border border-slate-200/60 overflow-hidden">
      <div
        className={`absolute top-0 left-0 h-full bg-slate-900 text-slate-300 w-64 z-20 transition-transform duration-300 flex flex-col ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h3 className="font-bold text-slate-100 text-sm">Chat History</h3>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="hover:text-white p-1 rounded-md hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} /> New Conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                setCurrentSessionId(session.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between group cursor-pointer transition-colors ${currentSessionId === session.id ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <MessageSquare size={14} className="flex-shrink-0 opacity-70" />
                <span className="truncate">{session.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {isSidebarOpen && (
        <div
          className="absolute inset-0 bg-black/20 z-10 backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors mr-1"
            title="View Chat History"
          >
            <Menu size={18} />
          </button>
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm leading-tight">
              Nexus: Supply Chain Copilot
            </h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/30">
          {currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in duration-700">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2 border border-blue-100">
                <Bot size={32} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-700">
                  How can I help you?
                </h3>
                <p className="text-sm text-slate-500 max-w-[250px] mx-auto mt-2">
                  Ask questions about orders, flows, or specific nodes on the
                  graph.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="text-xs text-left px-4 py-3 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all text-slate-600"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentMessages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 max-w-[90%] ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 shadow-sm ${m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-blue-600"}`}
              >
                {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className="flex flex-col gap-1 w-full min-w-0">
                <div
                  className={`p-3.5 shadow-sm text-sm leading-relaxed overflow-hidden ${m.role === "user" ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm" : "bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm"}`}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => (
                        <p className="mb-2 last:mb-0 break-words" {...props} />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong className="font-semibold" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul
                          className="list-disc list-outside ml-4 mb-2 space-y-1"
                          {...props}
                        />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol
                          className="list-decimal list-outside ml-4 mb-2 space-y-1"
                          {...props}
                        />
                      ),
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>

                  {m.contextId && m.role === "user" && (
                    <div className="mt-3 text-[10px] bg-blue-700/50 border border-blue-500/30 text-blue-50 px-2 py-1 rounded w-fit uppercase tracking-wider flex items-center gap-1">
                      🎯 Target: {m.contextId}
                    </div>
                  )}
                </div>

                {m.cypher && (
                  <details className="mt-1 w-full bg-slate-900 text-slate-300 rounded-lg text-xs font-mono overflow-hidden shadow-inner group">
                    <summary className="cursor-pointer flex items-center p-2.5 text-slate-400 hover:text-slate-200 transition-colors bg-slate-800/50 select-none">
                      <Terminal size={12} className="mr-2" />
                      <span className="font-medium">Execution Logic</span>
                      <span className="ml-auto text-slate-500 flex items-center gap-2">
                        {m.latency}{" "}
                        <ChevronDown
                          size={14}
                          className="group-open:rotate-180 transition-transform"
                        />
                      </span>
                    </summary>
                    <div className="p-3 border-t border-slate-800 bg-slate-950/50 relative">
                      <button
                        onClick={() => handleCopyCypher(m.cypher as string, i)}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 transition-colors"
                        title="Copy Cypher"
                      >
                        {copiedIndex === i ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <p className="text-blue-400/80 mb-2 text-[10px] uppercase tracking-wider">
                        Generated Cypher
                      </p>
                      <code className="block text-slate-300 whitespace-pre-wrap leading-relaxed pr-8 break-all">
                        {m.cypher}
                      </code>
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 mr-auto max-w-[90%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200 text-blue-600 flex items-center justify-center mt-1 shadow-sm">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="animate-spin" size={16} />
                <span>Analyzing graph relationships...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-slate-100">
          {activeNodeId && (
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 inline-flex px-3 py-1.5 rounded-full w-fit shadow-sm animate-in slide-in-from-bottom-2">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                Targeting Node:{" "}
                <strong className="font-bold truncate max-w-[120px]">
                  {activeNodeId}
                </strong>
              </span>
              <div className="w-[1px] h-3 bg-indigo-300 mx-1"></div>
              <button
                onClick={onClearSelection}
                className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors text-indigo-500 hover:text-indigo-800"
                title="Clear Target"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 rounded-xl p-1 transition-all shadow-sm">
            {recognitionRef.current !== null && (
              <button
                onClick={toggleListening}
                className={`p-2.5 rounded-lg flex-shrink-0 transition-all ${isListening ? "bg-red-100 text-red-600 animate-pulse shadow-inner" : "bg-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}
                title={
                  isListening ? "Listening... Click to stop" : "Click to speak"
                }
              >
                {isListening ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            )}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isListening
                  ? "Listening..."
                  : "Ask a question about your supply chain..."
              }
              disabled={isLoading}
              rows={
                input.split("\n").length > 1
                  ? Math.min(input.split("\n").length, 4)
                  : 1
              }
              className="flex-1 bg-transparent border-none px-2 py-2.5 focus:outline-none focus:ring-0 text-sm resize-none min-h-[44px] max-h-[120px]"
              style={{ scrollbarWidth: "none" }}
            />

            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="mb-1 mr-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:bg-slate-300 flex-shrink-0 shadow-sm"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="text-center mt-2 flex justify-between px-1">
            <span className="text-[10px] text-slate-400 font-medium">
              Session: {currentSessionId.split("_")[1] || "Default"}
            </span>
            <span className="text-[10px] text-slate-400">
              Shift + Return for new line
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
