import os
from neo4j import GraphDatabase

class GraphAnalyticsEngine:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))
        )

    def close(self):
        self.driver.close()

    def run_all_analytics(self):
        """Orchestrates the GDS pipeline."""
        with self.driver.session() as session:
            print("1. Projecting graph into GDS memory...")
            self._project_graph(session)
            
            print("2. Running Weakly Connected Components (WCC)...")
            self._run_wcc(session)
            
            print("3. Running PageRank (Influence)...")
            self._run_pagerank(session)
            
            print("4. Running Louvain (Community Detection)...")
            self._run_louvain(session)
            
            print("5. Running Degree Centrality (Anomaly/Bottleneck Detection)...")
            self._run_degree_centrality(session)
            
            print("6. Cleaning up memory...")
            self._drop_projection(session)
            print("Analytics complete. Nodes updated with new properties.")

    def _project_graph(self, session):
        """Creates an in-memory graph named 'o2c_graph' for fast algorithmic processing."""
        session.run("CALL gds.graph.drop('o2c_graph', false) YIELD graphName;")
        
        query = """
        CALL gds.graph.project(
            'o2c_graph',
            ['Customer', 'Product', 'SalesOrder', 'Delivery', 'BillingDocument'],
            ['PLACED', 'CONTAINS', 'FULFILLED_BY', 'BILLED_TO']
        )
        YIELD graphName, nodeCount, relationshipCount;
        """
        session.run(query)

    def _run_wcc(self, session):
        """Phase 4.1: WCC - Finds broken flows (e.g., invoices with no deliveries)."""
        query = """
        CALL gds.wcc.write('o2c_graph', {
            writeProperty: 'wcc_component_id'
        })
        YIELD nodePropertiesWritten, componentCount;
        """
        session.run(query)

    def _run_pagerank(self, session):
        """Phase 4.2: PageRank - Finds the most influential nodes (e.g., bottleneck products or mega-customers)."""
        query = """
        CALL gds.pageRank.write('o2c_graph', {
            maxIterations: 20,
            dampingFactor: 0.85,
            writeProperty: 'pagerank_score'
        })
        YIELD nodePropertiesWritten, ranIterations;
        """
        session.run(query)

    def _run_louvain(self, session):
        """Phase 4.3: Louvain - Clusters transactions into 'communities' for UI grouping."""
        query = """
        CALL gds.louvain.write('o2c_graph', {
            writeProperty: 'community_id'
        })
        YIELD nodePropertiesWritten, communityCount;
        """
        session.run(query)

    def _run_degree_centrality(self, session):
        """Phase 4.4: Degree Centrality - Identifies structural anomalies and bottlenecks."""
        query = """
        CALL gds.degree.write('o2c_graph', {
            writeProperty: 'degree_centrality'
        })
        YIELD nodePropertiesWritten;
        """
        session.run(query)

    def _drop_projection(self, session):
        """Frees up Neo4j RAM."""
        session.run("CALL gds.graph.drop('o2c_graph', false) YIELD graphName;")

if __name__ == "__main__":
    engine = GraphAnalyticsEngine()
    engine.run_all_analytics()
    engine.close()