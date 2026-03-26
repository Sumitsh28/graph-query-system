"use client";

import { useState } from "react";
import { Send, Terminal, ChevronDown } from "lucide-react";

export default function ChatInterface({
  activeNodeId,
}: {
  activeNodeId: string | null;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMsg = { role: "user", text: input };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "The billing document with the highest amount is INV-9920, linked to Plant A.",
          cypher:
            "MATCH (b:BillingDocument) RETURN b ORDER BY b.amount DESC LIMIT 1",
          latency: "840ms",
          tokens: 142,
        },
      ]);
    }, 1000);
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
              {m.text}
            </div>

            {m.cypher && (
              <details className="mt-2 w-full max-w-[85%] bg-slate-800 text-slate-300 rounded-md p-2 text-xs font-mono">
                <summary className="cursor-pointer flex items-center text-slate-400 hover:text-white">
                  <Terminal size={12} className="mr-1" /> View Execution Details{" "}
                  <ChevronDown size={12} className="ml-auto" />
                </summary>
                <div className="mt-2 pt-2 border-t border-slate-600">
                  <p className="text-blue-300">Generated Cypher:</p>
                  <code className="block mt-1 bg-slate-900 p-2 rounded">
                    {m.cypher}
                  </code>
                  <div className="flex gap-4 mt-2 text-slate-500">
                    <span>Latency: {m.latency}</span>
                    <span>Tokens: {m.tokens}</span>
                  </div>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-100">
        {activeNodeId && (
          <div className="mb-2 text-xs font-medium text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded">
            Context: Node {activeNodeId} selected
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about orders, broken flows, or anomalies..."
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
