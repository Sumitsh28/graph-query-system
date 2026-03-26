"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Layers, Info, ChevronDown, ChevronUp } from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
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
  const [activeDetails, setActiveDetails] = useState<any>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(
    new Set(),
  );

  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(true); // Legend state

  useEffect(() => {
    fetch("http://localhost:8000/api/graph")
      .then((r) => r.json())
      .then((data) => setGraphData(data))
      .catch((err) => console.error("Error fetching graph data:", err));
  }, []);

  useEffect(() => {
    const handleHighlight = (e: any) => {
      setHighlightedNodes(new Set(e.detail));
    };
    window.addEventListener("highlightPath", handleHighlight);
    return () => window.removeEventListener("highlightPath", handleHighlight);
  }, []);

  useEffect(() => {
    if (
      highlightedNodes.size > 0 &&
      fgRef.current &&
      graphData.nodes.length > 0
    ) {
      const timer = setTimeout(() => {
        try {
          const currentNodes = graphData.nodes;

          const targetNodes = currentNodes.filter((n: any) =>
            highlightedNodes.has(n.id),
          );

          if (targetNodes.length > 0) {
            if (is3DMode) {
              let cx = 0,
                cy = 0,
                cz = 0;
              targetNodes.forEach((n: any) => {
                cx += n.x || 0;
                cy += n.y || 0;
                cz += n.z || 0;
              });
              cx /= targetNodes.length;
              cy /= targetNodes.length;
              cz /= targetNodes.length;

              let maxSpread = 10;
              targetNodes.forEach((n: any) => {
                const dist = Math.hypot(
                  (n.x || 0) - cx,
                  (n.y || 0) - cy,
                  (n.z || 0) - cz,
                );
                if (dist > maxSpread) maxSpread = dist;
              });

              const distance = Math.max(150, maxSpread * 2.5);

              fgRef.current.cameraPosition(
                { x: cx, y: cy, z: cz + distance },
                { x: cx, y: cy, z: cz },
                2000,
              );
            } else {
              fgRef.current.zoomToFit(2000, 75, (n: any) =>
                highlightedNodes.has(n.id),
              );
            }
          }
        } catch (e) {
          console.error("Auto-zoom error:", e);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [highlightedNodes, is3DMode, graphData]);

  useEffect(() => {
    if (!activeNodeId) {
      setActiveDetails(null);
      if (fgRef.current) {
        if (is3DMode) {
          fgRef.current.cameraPosition(
            { x: 0, y: 0, z: 500 },
            { x: 0, y: 0, z: 0 },
            1000,
          );
        } else {
          fgRef.current.zoomToFit(1000);
        }
      }
    }
  }, [activeNodeId, is3DMode]);

  const isHighlightedLink = (link: any) => {
    if (highlightedNodes.size === 0) return false;
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;
    return highlightedNodes.has(sourceId) && highlightedNodes.has(targetId);
  };

  const getNodeColor = (node: any) => {
    let color = "#3b82f6";
    if (node.id === activeNodeId) color = "#ef4444";
    else if (node.degree_centrality > 10) color = "#f59e0b";
    else {
      const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#6366f1"];
      color = colors[(node.community_id || 0) % colors.length];
    }

    let alpha = "E6";
    if (highlightedNodes.size > 0) {
      alpha =
        highlightedNodes.has(node.id) || node.id === activeNodeId ? "FF" : "1A";
    }
    return `${color}${alpha}`;
  };

  return (
    <div
      className={`relative w-full h-full rounded-xl overflow-hidden border transition-colors duration-500 ${is3DMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200 shadow-inner"}`}
    >
      {activeDetails && (
        <div
          className={`absolute top-4 left-4 z-10 w-80 max-h-[85vh] flex flex-col backdrop-blur-md shadow-2xl border rounded-xl transition-all ${is3DMode ? "bg-slate-900/90 border-slate-700 text-white" : "bg-white/95 border-slate-200 text-slate-800"}`}
        >
          <div
            className={`p-5 pb-3 border-b flex-shrink-0 ${is3DMode ? "border-slate-700" : "border-slate-200"}`}
          >
            <h3
              className={`font-bold text-lg tracking-tight ${is3DMode ? "text-slate-100" : "text-slate-900"}`}
            >
              {activeDetails.label || "Entity Detail"}
            </h3>
            <p className="text-sm font-mono text-blue-500 mt-1 break-all">
              {activeDetails.id}
            </p>
          </div>

          <div className="p-5 py-3 space-y-3 text-sm overflow-y-auto scrollbar-thin flex-1 min-h-0">
            {Object.entries(activeDetails)
              .filter(
                ([key]) =>
                  ![
                    "id",
                    "label",
                    "x",
                    "y",
                    "z",
                    "vx",
                    "vy",
                    "vz",
                    "fx",
                    "fy",
                    "fz",
                    "index",
                    "color",
                    "__bckgDimensions",
                    "__threeObj",
                    "isActive",
                    "isHighlighted",
                  ].includes(key),
              )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => {
                let displayValue = value;
                if (typeof value === "object" && value !== null)
                  displayValue = JSON.stringify(value);
                else if (value === null || value === undefined || value === "")
                  displayValue = "—";
                else if (typeof value === "number" && !Number.isInteger(value))
                  displayValue = value.toFixed(3);

                return (
                  <div key={key} className="flex flex-col">
                    <span
                      className={`font-semibold text-[11px] uppercase tracking-wider ${is3DMode ? "text-slate-400" : "text-slate-500"}`}
                    >
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span
                      className={`font-mono mt-0.5 break-words ${is3DMode ? "text-slate-200" : "text-slate-700"}`}
                    >
                      {String(displayValue)}
                    </span>
                  </div>
                );
              })}
          </div>

          <div
            className={`p-5 pt-3 border-t flex-shrink-0 flex justify-between items-center text-xs ${is3DMode ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}
          >
            <span className="font-bold bg-blue-500/10 text-blue-500 px-2 py-1 rounded">
              Connections: {activeDetails.degree_centrality || 0}
            </span>
          </div>
        </div>
      )}

      {/* 2D / 3D Toggle */}
      <button
        onClick={() => setIs3DMode(!is3DMode)}
        className={`absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-all shadow-md ${
          is3DMode
            ? "bg-slate-800 text-blue-400 hover:bg-slate-700 border border-slate-600"
            : "bg-white text-blue-600 hover:bg-slate-50 border border-slate-200"
        }`}
      >
        {is3DMode ? <Box size={16} /> : <Layers size={16} />}
        {is3DMode ? "Switch to 2D" : "Switch to 3D"}
      </button>

      <div
        className={`absolute bottom-4 right-4 z-10 w-48 rounded-lg shadow-lg border transition-all overflow-hidden ${is3DMode ? "bg-slate-900/90 border-slate-700 text-white" : "bg-white/95 border-slate-200 text-slate-800"}`}
      >
        <button
          onClick={() => setIsLegendOpen(!isLegendOpen)}
          className={`flex items-center justify-between w-full px-3 py-2 text-xs font-semibold hover:bg-black/5 transition-colors ${isLegendOpen ? "border-b" : ""} ${is3DMode ? "border-slate-700" : "border-slate-100"}`}
        >
          <span className="flex items-center gap-1.5">
            <Info size={14} /> Graph Legend
          </span>
          {isLegendOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {isLegendOpen && (
          <div className="p-3 space-y-2 text-[11px] font-medium">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <span>Active Target / Path</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
              <span>Bottleneck (Connections {">"} 10)</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <div className="flex gap-0.5 opacity-80">
                <div className="w-1.5 h-3 rounded-l-full bg-[#3b82f6]"></div>
                <div className="w-1.5 h-3 bg-[#10b981]"></div>
                <div className="w-1.5 h-3 bg-[#ec4899]"></div>
                <div className="w-1.5 h-3 rounded-r-full bg-[#8b5cf6]"></div>
              </div>
              <span className="text-slate-500">Community Clusters</span>
            </div>
          </div>
        )}
      </div>

      <div
        className={`absolute bottom-4 left-4 z-10 text-[11px] font-mono px-2 py-1.5 rounded ${is3DMode ? "text-slate-500 bg-slate-950/70" : "text-slate-500 bg-white/70 backdrop-blur"}`}
      >
        {is3DMode
          ? "Left Click: Rotate | Right Click: Pan | Scroll: Zoom"
          : "Scroll to zoom | Click & Drag to pan"}
      </div>

      {is3DMode ? (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="#020617"
          nodeLabel="id"
          nodeVal={(node: any) =>
            node.pagerank_score ? Math.max(node.pagerank_score * 15, 2) : 2
          }
          nodeColor={getNodeColor}
          linkColor={(link: any) => {
            if (highlightedNodes.size === 0) return "rgba(148, 163, 184, 0.3)";
            return isHighlightedLink(link)
              ? "#ef4444"
              : "rgba(148, 163, 184, 0.05)";
          }}
          linkWidth={(link: any) => (isHighlightedLink(link) ? 2 : 0.5)}
          linkDirectionalParticles={(link: any) =>
            isHighlightedLink(link) ? 4 : 0
          }
          linkDirectionalParticleSpeed={(link: any) =>
            isHighlightedLink(link) ? 0.01 : 0
          }
          linkDirectionalParticleWidth={3}
          linkDirectionalParticleColor={() => "#ef4444"}
          onNodeClick={(node: any) => {
            onNodeClick(node.id);
            setActiveDetails(node);
            setHighlightedNodes(new Set());
            if (fgRef.current) {
              const distance = 150;
              const distRatio =
                1 + distance / Math.hypot(node.x, node.y, node.z);
              fgRef.current.cameraPosition(
                {
                  x: node.x * distRatio,
                  y: node.y * distRatio,
                  z: node.z * distRatio,
                },
                node,
                2000,
              );
            }
          }}
          onBackgroundClick={() => setHighlightedNodes(new Set())}
        />
      ) : (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.id;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bgDimensions = [textWidth, fontSize].map(
              (n) => n + fontSize * 0.2,
            );

            const isHighlighted =
              highlightedNodes.size === 0 ||
              highlightedNodes.has(node.id) ||
              node.id === activeNodeId;
            ctx.globalAlpha = isHighlighted ? 1.0 : 0.1;

            const radius = node.pagerank_score
              ? Math.max(node.pagerank_score * 12, 3)
              : 3;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = getNodeColor(node).slice(0, 7);
            ctx.fill();

            if (
              globalScale > 2 ||
              node.id === activeNodeId ||
              (highlightedNodes.size > 0 && highlightedNodes.has(node.id))
            ) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
              ctx.fillRect(
                node.x - bgDimensions[0] / 2,
                node.y - radius - fontSize - 2,
                bgDimensions[0],
                bgDimensions[1],
              );
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#1e293b";
              ctx.fillText(label, node.x, node.y - radius - fontSize / 2 - 2);
            }
            ctx.globalAlpha = 1.0;
          }}
          linkColor={(link: any) => {
            if (highlightedNodes.size === 0) return "#cbd5e1";
            return isHighlightedLink(link)
              ? "#ef4444"
              : "rgba(203, 213, 225, 0.1)";
          }}
          linkDirectionalParticles={(link: any) =>
            isHighlightedLink(link) ? 4 : 0
          }
          linkDirectionalParticleSpeed={(link: any) =>
            isHighlightedLink(link) ? 0.005 : 0
          }
          linkDirectionalParticleWidth={4}
          linkDirectionalParticleColor={() => "#ef4444"}
          onNodeClick={(node: any) => {
            onNodeClick(node.id);
            setActiveDetails(node);
            setHighlightedNodes(new Set());
            if (fgRef.current) {
              fgRef.current.centerAt(node.x, node.y, 1000);
              fgRef.current.zoom(8, 2000);
            }
          }}
          onBackgroundClick={() => setHighlightedNodes(new Set())}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
        />
      )}
    </div>
  );
}
