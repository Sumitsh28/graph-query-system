"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface GraphData {
  nodes: any[];
  links: any[];
}

export default function GraphView({
  activeNodeId,
  onNodeClick,
}: {
  activeNodeId: string | null;
  onNodeClick: (id: string) => void;
}) {
  const fgRef = useRef<any>(null);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    fetch("http://localhost:8000/api/graph")
      .then((r) => r.json())
      .then((data) => {
        console.log("Graph Data Loaded:", data);
        setGraphData(data);
      })
      .catch((err) => console.error("Error fetching graph data:", err));
  }, []);

  return (
    <div className="w-full h-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="id"
        nodeVal={(node: any) =>
          node.pagerank_score ? node.pagerank_score * 10 : 1
        }
        nodeColor={(node: any) => {
          if (node.id === activeNodeId) return "#ef4444";
          if (node.degree_centrality > 10) return "#f59e0b";

          const colors = [
            "#3b82f6",
            "#10b981",
            "#8b5cf6",
            "#ec4899",
            "#6366f1",
          ];
          return colors[(node.community_id || 0) % colors.length];
        }}
        onNodeClick={(node: any) => {
          onNodeClick(node.id);
          if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 1000);
            fgRef.current.zoom(8, 2000);
          }
        }}
        linkColor={() => "#cbd5e1"}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
      />
    </div>
  );
}
