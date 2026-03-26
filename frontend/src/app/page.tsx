"use client";

import { useState } from "react";
import GraphView from "@/components/GraphView";
import ChatInterface from "@/components/Chat";

export default function Dashboard() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  return (
    <main className="h-screen w-screen bg-slate-100 p-4 flex flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Supply Chain Context Graph
        </h1>
        <p className="text-sm text-slate-500">
          Powered by Neo4j GDS & LangGraph
        </p>
      </header>

      <div className="flex-1 flex gap-4 min-h-0">
        <section className="flex-[7] min-w-0">
          <GraphView
            activeNodeId={activeNodeId}
            onNodeClick={setActiveNodeId}
          />
        </section>

        <section className="flex-[3] min-w-[350px]">
          <ChatInterface
            activeNodeId={activeNodeId}
            onClearSelection={() => setActiveNodeId(null)}
          />
        </section>
      </div>
    </main>
  );
}
