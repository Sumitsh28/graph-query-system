import json
import asyncio
from pydantic import ValidationError
from rich.progress import Progress
from app.models.domain import SalesOrder, Delivery, BillingDocument, Product, Customer
from app.services.graph_builder import GraphBuilder

DLQ_FILE = "data/dlq.json"

def log_to_dlq(record: dict, error_msg: str):
    """Phase 2.2: Dead Letter Queue"""
    with open(DLQ_FILE, "a") as f:
        dlq_entry = {"error": error_msg, "payload": record}
        f.write(json.dumps(dlq_entry) + "\n")

async def seed_database(filepath: str):
    """Phase 2.3: Automated Seeding CLI"""
    builder = GraphBuilder()
    builder.setup_constraints_and_indexes()
    
    with open(filepath, 'r') as file:
        lines = file.readlines()

    with Progress() as progress:
        task = progress.add_task("[cyan]Ingesting records into Neo4j...", total=len(lines))
        
        for line in lines:
            try:
                raw_data = json.loads(line)
                
                order = SalesOrder(**raw_data.get("order", {}))
                delivery = Delivery(**raw_data.get("delivery", {}))
                billing = BillingDocument(**raw_data.get("billing", {}))
                product = Product(**raw_data.get("product", {}))
                
                builder.ingest_order_flow(
                    order.dict(), 
                    delivery.dict(), 
                    billing.dict(), 
                    product.dict()
                )
                
            except ValidationError as e:
                log_to_dlq(raw_data, str(e))
            except Exception as e:
                log_to_dlq(raw_data, f"System Error: {str(e)}")
            
            progress.update(task, advance=1)
            
    builder.close()
    print("[green]Ingestion complete! Check data/dlq.json for any skipped records.[/green]")

if __name__ == "__main__":
    print("Run this via: python -m cli.seed_db")