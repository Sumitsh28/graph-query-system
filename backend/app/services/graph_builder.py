import os
from neo4j import GraphDatabase
from langchain_openai import OpenAIEmbeddings

class GraphBuilder:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))
        )
        self.embeddings = OpenAIEmbeddings(model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))

    def close(self):
        self.driver.close()

    def setup_constraints_and_indexes(self):
        """Ensure uniqueness and setup vector indexes for semantic search."""
        queries = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (o:SalesOrder) REQUIRE o.id IS UNIQUE",
            
            """
            CREATE VECTOR INDEX product_embeddings IF NOT EXISTS
            FOR (p:Product) ON (p.embedding)
            OPTIONS {indexConfig: {
              `vector.dimensions`: 1536,
              `vector.similarity_function`: 'cosine'
            }}
            """
        ]
        with self.driver.session() as session:
            for query in queries:
                session.run(query)

    def ingest_order_flow(self, order_data: dict, delivery_data: dict, billing_data: dict, product_data: dict):
        """Creates the nodes and edges, calculates time deltas, and handles cancellations."""
        
        desc_embedding = self.embeddings.embed_query(product_data['description'])

        cypher_query = """
        // 1. Create Nodes (Phase 2.4)
        MERGE (c:Customer {id: $order.customer_id})
        
        MERGE (p:Product {id: $product.product_id})
        SET p.description = $product.description, p.embedding = $embedding
        
        MERGE (o:SalesOrder {id: $order.order_id})
        SET o.date = datetime($order.order_date), o.amount = $order.amount
        
        MERGE (d:Delivery {id: $delivery.delivery_id})
        SET d.date = datetime($delivery.delivery_date), d.status = $delivery.status
        
        MERGE (b:BillingDocument {id: $billing.billing_id})
        // 2.6 Handle Cancellations 
        SET b.date = datetime($billing.billing_date), b.status = $billing.status
        
        // 2. Build Edges & Process Mining (Phase 2.5)
        MERGE (c)-[:PLACED]->(o)
        MERGE (o)-[:CONTAINS]->(p)
        
        MERGE (o)-[fd:FULFILLED_BY]->(d)
        // Calculate time delta in hours between order and delivery
        SET fd.time_delta_hours = duration.inSeconds(o.date, d.date).seconds / 3600.0
        
        MERGE (d)-[bt:BILLED_TO]->(b)
        // Calculate time delta between delivery and billing
        SET bt.time_delta_hours = duration.inSeconds(d.date, b.date).seconds / 3600.0
        """
        
        with self.driver.session() as session:
            session.run(
                cypher_query, 
                order=order_data, 
                delivery=delivery_data, 
                billing=billing_data, 
                product=product_data,
                embedding=desc_embedding
            )