import json
from pathlib import Path

DATA_DIR = Path("../sap-o2c-data")
OUTPUT_FILE = "schema_summary.txt"

def analyze_schemas():
    if not DATA_DIR.exists():
        print(f"Error: Could not find data directory at {DATA_DIR.resolve()}")
        return

    print(f"Analyzing folders in {DATA_DIR.resolve()}...")
    
    with open(OUTPUT_FILE, 'w') as out_file:
        for folder_path in sorted(DATA_DIR.iterdir()):
            if folder_path.is_dir():
                first_file = next(folder_path.glob("*.jsonl"), None)
                
                out_file.write(f"=========================================\n")
                out_file.write(f"FOLDER: {folder_path.name}\n")
                out_file.write(f"=========================================\n")
                
                if first_file:
                    with open(first_file, 'r') as f:
                        first_line = f.readline()
                        if first_line:
                            try:
                                data = json.loads(first_line)
                                # Pretty print the JSON so it's easy to read
                                formatted_json = json.dumps(data, indent=2)
                                out_file.write(formatted_json + "\n\n")
                            except json.JSONDecodeError:
                                out_file.write("Error: Could not parse JSON.\n\n")
                else:
                    out_file.write("No .jsonl files found in this folder.\n\n")

    print(f"Done! Open 'backend/{OUTPUT_FILE}' to see your data structures.")

if __name__ == "__main__":
    analyze_schemas()