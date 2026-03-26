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
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function ChatInterface({
  activeNodeId,
  onClearSelection,
}: {
  activeNodeId: string | null;
  onClearSelection: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

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
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join("");
          setInput(transcript);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

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

    const newMsg = { role: "user", text: textToSend, contextId: activeNodeId };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: textToSend,
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

      setMessages((prev) => [
        ...prev,
        {
          role: data.role,
          text: data.text,
          cypher: data.cypher,
          latency: data.latency,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Error connecting to the LangGraph backend. Please ensure the server is running.",
        },
      ]);
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
    <div className="flex flex-col h-full bg-white rounded-xl shadow-xl border border-slate-200/60 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800 text-sm">
            Supply Chain Copilot
          </h2>
          <p className="text-[11px] text-slate-500">
            Powered by LangGraph & Neo4j
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/30">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in duration-700">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
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
                  className="text-xs text-left px-4 py-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all text-slate-600"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 max-w-[90%] ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 shadow-sm ${m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-blue-600"}`}
            >
              {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div className="flex flex-col gap-1 w-full">
              <div
                className={`p-3.5 shadow-sm text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm"
                    : "bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm"
                }`}
              >
                <ReactMarkdown
                  components={{
                    p: ({ node, ...props }) => (
                      <p className="mb-2 last:mb-0" {...props} />
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
                    Target: {m.contextId}
                  </div>
                )}
              </div>

              {m.cypher && (
                <details className="mt-1 w-full bg-slate-900 text-slate-300 rounded-lg text-xs font-mono overflow-hidden shadow-inner group">
                  <summary className="cursor-pointer flex items-center p-2.5 text-slate-400 hover:text-slate-200 transition-colors bg-slate-800/50">
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
                      onClick={() => handleCopyCypher(m.cypher, i)}
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
                    <code className="block text-slate-300 whitespace-pre-wrap leading-relaxed pr-8">
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
              <strong className="font-bold">{activeNodeId}</strong>
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
              className={`p-2.5 rounded-lg flex-shrink-0 transition-all ${
                isListening
                  ? "bg-red-100 text-red-600 animate-pulse shadow-inner"
                  : "bg-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
              }`}
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
            style={{ scrollbarWidth: "none", color: "black" }}
          />

          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="mb-1 mr-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:bg-slate-300 flex-shrink-0 shadow-sm"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="text-center mt-2">
          <span className="text-[10px] text-slate-400">
            Shift + Return for new line
          </span>
        </div>
      </div>
    </div>
  );
}
