import os
from fastapi import APIRouter, HTTPException
from neo4j import GraphDatabase

router = APIRouter()

@router.get("/graph")
def get_graph_data(limit: int = 300):
    """Fetches a localized subgraph for the React frontend visualization."""
    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))
    )
    
    query = """
    MATCH (n)-[r]->(m)
    // Optional: Prioritize nodes with high centrality to see the core flow
    WITH n, r, m ORDER BY n.degree_centrality DESC LIMIT $limit
    RETURN n, r, m
    """
    
    try:
        with driver.session(default_access_mode="READ") as session:
            result = session.run(query, limit=limit)
            
            nodes_dict = {}
            links = []
            
            for record in result:
                n = record["n"]
                m = record["m"]
                r = record["r"]
                
                if n["id"] not in nodes_dict:
                    nodes_dict[n["id"]] = {
                        "id": n["id"],
                        "label": list(n.labels)[0] if n.labels else "Unknown",
                        "pagerank_score": n.get("pagerank_score"),
                        "community_id": n.get("community_id"),
                        "degree_centrality": n.get("degree_centrality"),
                    }
                
                if m["id"] not in nodes_dict:
                    nodes_dict[m["id"]] = {
                        "id": m["id"],
                        "label": list(m.labels)[0] if m.labels else "Unknown",
                        "pagerank_score": m.get("pagerank_score"),
                        "community_id": m.get("community_id"),
                        "degree_centrality": m.get("degree_centrality"),
                    }
                    
                links.append({
                    "source": n["id"],
                    "target": m["id"],
                    "type": r.type
                })
                
            return {
                "nodes": list(nodes_dict.values()),
                "links": links
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        driver.close()