"use client";

import { useState } from "react";
import { Send, Terminal, ChevronDown, Loader2, X } from "lucide-react";
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input;
    const newMsg = { role: "user", text: userText, contextId: activeNodeId };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userText,
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
        { role: "agent", text: "Error connecting to the LangGraph backend." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`p-3 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}
            >
              <div className="text-sm leading-relaxed">
                <ReactMarkdown
                  components={{
                    p: ({ node, ...props }) => (
                      <p className="mb-2 last:mb-0" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-bold" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul
                        className="list-disc list-outside ml-4 mb-2"
                        {...props}
                      />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol
                        className="list-decimal list-outside ml-4 mb-2"
                        {...props}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="mb-1" {...props} />
                    ),
                  }}
                >
                  {m.text}
                </ReactMarkdown>
              </div>

              {m.contextId && m.role === "user" && (
                <div className="mt-2 text-[10px] bg-blue-800 text-blue-100 px-2 py-1 rounded w-fit uppercase tracking-wider">
                  Node: {m.contextId}
                </div>
              )}
            </div>

            {m.cypher && (
              <details className="mt-2 w-full max-w-[85%] bg-slate-800 text-slate-300 rounded-md p-2 text-xs font-mono">
                <summary className="cursor-pointer flex items-center text-slate-400 hover:text-white transition-colors">
                  <Terminal size={12} className="mr-1" /> View Execution Details{" "}
                  <ChevronDown size={12} className="ml-auto" />
                </summary>
                <div className="mt-2 pt-2 border-t border-slate-600">
                  <p className="text-blue-300">Generated Cypher:</p>
                  <code className="block mt-1 bg-slate-900 p-2 rounded whitespace-pre-wrap">
                    {m.cypher}
                  </code>
                  <div className="flex gap-4 mt-2 text-slate-500">
                    <span>Latency: {m.latency}</span>
                  </div>
                </div>
              </details>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center text-slate-400 text-sm">
            <Loader2 className="animate-spin mr-2" size={16} /> Agent is
            thinking...
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
        {activeNodeId && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-100 border border-blue-200 inline-block px-2 py-1 rounded w-fit">
            <span>Context Attached: Node {activeNodeId}</span>
            <button
              onClick={onClearSelection}
              className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              title="Remove Selection"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about orders, broken flows, or anomalies..."
            disabled={isLoading}
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
