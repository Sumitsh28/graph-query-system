
from dotenv import load_dotenv
load_dotenv()  
import json
from pathlib import Path
from rich.progress import Progress
from app.services.graph_builder import GraphBuilder

DATA_DIR = Path("../sap-o2c-data")
BATCH_SIZE = 1000

NODE_CONFIG = {
    "business_partners": {"label": "Customer", "id_field": "businessPartner"},
    "products": {"label": "Product", "id_field": "product"},
    "sales_order_headers": {"label": "SalesOrder", "id_field": "salesOrder"},
    "outbound_delivery_headers": {"label": "Delivery", "id_field": "deliveryDocument"},
    "billing_document_headers": {"label": "BillingDocument", "id_field": "billingDocument"},
    "journal_entry_items_accounts_receivable": {"label": "JournalEntry", "id_field": "accountingDocument"},
}

def sanitize_record(record: dict) -> dict:
    """
    Neo4j doesn't accept nested dictionaries (Maps) or lists of objects.
    This converts any complex nested JSON fields into simple strings.
    """
    sanitized = {}
    for key, value in record.items():
        if isinstance(value, dict) or isinstance(value, list):
            sanitized[key] = json.dumps(value)
        else:
            sanitized[key] = value
    return sanitized

def load_jsonl_batch(file_path: Path):
    """Helper to yield batches of JSON from a file."""
    batch = []
    with open(file_path, 'r') as f:
        for line in f:
            if line.strip():
                raw_record = json.loads(line)
                clean_record = sanitize_record(raw_record) 
                
                batch.append(clean_record)
                if len(batch) >= BATCH_SIZE:
                    yield batch
                    batch = []
    if batch:
        yield batch

def main():
    if not DATA_DIR.exists():
        print(f"Error: Could not find data directory at {DATA_DIR.resolve()}")
        return

    builder = GraphBuilder()
    builder.setup_constraints()
    
    with Progress() as progress:
        print("\n--- STAGE 1: Creating Entities (Nodes) ---")
        for folder_name, config in NODE_CONFIG.items():
            folder_path = DATA_DIR / folder_name
            if folder_path.exists():
                files = list(folder_path.glob("*.jsonl"))
                task = progress.add_task(f"[cyan]Loading {config['label']}s...", total=len(files))
                
                for file_path in files:
                    for batch in load_jsonl_batch(file_path):
                        builder.bulk_insert_nodes(config["label"], config["id_field"], batch)
                    progress.update(task, advance=1)

        print("\n--- STAGE 2: Mapping Relationships (Edges) ---")
        
        task_so_hdr = progress.add_task("[magenta]Linking Customers to Orders...", total=1)
        for f in (DATA_DIR / "sales_order_headers").glob("*.jsonl"):
            for batch in load_jsonl_batch(f):
                builder.link_customer_to_order([r for r in batch if "soldToParty" in r and r["soldToParty"]])
        progress.update(task_so_hdr, advance=1)

        task_so_itm = progress.add_task("[magenta]Linking Orders to Products...", total=1)
        for f in (DATA_DIR / "sales_order_items").glob("*.jsonl"):
            for batch in load_jsonl_batch(f):
                builder.link_order_to_product([r for r in batch if "material" in r and r["material"]])
        progress.update(task_so_itm, advance=1)

        task_del = progress.add_task("[magenta]Linking Deliveries to Orders...", total=1)
        for f in (DATA_DIR / "outbound_delivery_items").glob("*.jsonl"):
            for batch in load_jsonl_batch(f):
                builder.link_delivery_to_order([r for r in batch if "referenceSdDocument" in r and r["referenceSdDocument"]])
        progress.update(task_del, advance=1)

        task_bil_itm = progress.add_task("[magenta]Linking Billing to Delivery Flow...", total=1)
        for f in (DATA_DIR / "billing_document_items").glob("*.jsonl"):
            for batch in load_jsonl_batch(f):
                builder.link_billing_to_reference([r for r in batch if "referenceSdDocument" in r and r["referenceSdDocument"]])
        progress.update(task_bil_itm, advance=1)

        task_bil_hdr = progress.add_task("[magenta]Linking Billing to Finance...", total=1)
        for f in (DATA_DIR / "billing_document_headers").glob("*.jsonl"):
            for batch in load_jsonl_batch(f):
                builder.link_billing_to_accounting([r for r in batch if "accountingDocument" in r and r["accountingDocument"]])
        progress.update(task_bil_hdr, advance=1)

    builder.close()
    print("\n[green]Database Seeding Complete! The O2C flow is now a connected graph.[/green]")

if __name__ == "__main__":
    main()