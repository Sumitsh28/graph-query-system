import os
from neo4j import GraphDatabase

class GraphBuilder:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))
        )

    def close(self):
        self.driver.close()

    def setup_constraints(self):
        queries = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (o:SalesOrder) REQUIRE o.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Delivery) REQUIRE d.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (b:BillingDocument) REQUIRE b.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (j:JournalEntry) REQUIRE j.id IS UNIQUE",
        ]
        with self.driver.session() as session:
            for query in queries:
                session.run(query)

    def bulk_insert_nodes(self, label: str, id_field: str, batch: list):
        """Creates the core entities."""
        query = f"""
        UNWIND $batch AS row
        MERGE (n:{label} {{id: row['{id_field}']}})
        SET n += row
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)


    def link_customer_to_order(self, batch: list):
        """Uses sales_order_headers: soldToParty -> salesOrder"""
        query = """
        UNWIND $batch AS row
        MATCH (c:Customer {id: row.soldToParty})
        MATCH (o:SalesOrder {id: row.salesOrder})
        MERGE (c)-[:PLACED]->(o)
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)

    def link_order_to_product(self, batch: list):
        """Uses sales_order_items: salesOrder -> material"""
        query = """
        UNWIND $batch AS row
        MATCH (o:SalesOrder {id: row.salesOrder})
        MATCH (p:Product {id: row.material})
        MERGE (o)-[r:CONTAINS]->(p)
        SET r.quantity = toFloat(row.requestedQuantity), r.amount = toFloat(row.netAmount)
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)

    def link_delivery_to_order(self, batch: list):
        """Uses outbound_delivery_items: deliveryDocument -> referenceSdDocument"""
        query = """
        UNWIND $batch AS row
        MATCH (d:Delivery {id: row.deliveryDocument})
        MATCH (o:SalesOrder {id: row.referenceSdDocument})
        MERGE (d)-[:FULFILLS]->(o)
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)

    def link_billing_to_reference(self, batch: list):
        """Uses billing_document_items: billingDocument -> referenceSdDocument"""
        query = """
        UNWIND $batch AS row
        MATCH (b:BillingDocument {id: row.billingDocument})
        // The reference could be a Delivery or Sales Order, so we match generically by ID
        MATCH (ref {id: row.referenceSdDocument}) 
        MERGE (b)-[:BILLED_FOR]->(ref)
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)

    def link_billing_to_accounting(self, batch: list):
        """Uses billing_document_headers: billingDocument -> accountingDocument"""
        query = """
        UNWIND $batch AS row
        MATCH (b:BillingDocument {id: row.billingDocument})
        MATCH (j:JournalEntry {id: row.accountingDocument})
        MERGE (b)-[:POSTED_TO]->(j)
        """
        with self.driver.session() as session:
            session.run(query, batch=batch)