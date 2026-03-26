from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.agents.state import GraphQAState
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from neo4j import GraphDatabase
import os

llm = ChatOpenAI(model=os.getenv("LLM_MODEL", "gpt-4o"), temperature=0)

driver = GraphDatabase.driver(
    os.getenv("NEO4J_URI"), 
    auth=(os.getenv("NEO4J_READONLY_USER"), os.getenv("NEO4J_READONLY_PASSWORD"))
)

def guardrail_node(state: GraphQAState):
    """Phase 3.3: Semantic Router to block off-topic queries."""
    question = state["original_question"]
    
    prompt = f"""You are a strict data security guard. Does this question relate to supply chain, orders, deliveries, invoices, business analytics, Graph Data Science (e.g., 'influence', 'bottlenecks', 'PageRank', 'Centrality', 'disconnected components', 'WCC'), OR exploring a graph database of these entities? 
    
    Question: {question}
    
    Reply ONLY with 'YES' or 'NO'. If the user mentions 'this node', an ID, 'influence', 'disconnected', or 'bottleneck', the answer is always 'YES'."""
    
    response = llm.invoke(prompt).content.strip().upper()
    return {"is_in_domain": response == 'YES'}

def generate_cypher_node(state: GraphQAState):
    """Phase 3.4 & 3.5: Query Agent with dynamic context (RAG)"""
    
    schema = """
    Nodes: Customer, Product, SalesOrder, Delivery, BillingDocument, JournalEntry. 
    Exact Relationships: 
    (Customer)-[:PLACED]->(SalesOrder)
    (SalesOrder)-[:CONTAINS]->(Product)
    (Delivery)-[:FULFILLS]->(SalesOrder)
    (BillingDocument)-[:BILLED_FOR]->(Delivery) OR (BillingDocument)-[:BILLED_FOR]->(SalesOrder)
    (BillingDocument)-[:POSTED_TO]->(JournalEntry)
    Properties:
    - All nodes have a string property called 'id'.
    - All nodes have numeric properties 'degree_centrality' (for bottlenecks) and 'pagerank_score' (for influence).
    """
    
    prompt = f"""Generate a read-only Cypher query for Neo4j based on the exact schema: {schema}.
    
    CRITICAL RULES:
    1. NEVER use the internal `id(n)` function. ALWAYS query node IDs using the string property `id`.
    2. SPECIFIC FLOW TRACING: IF AND ONLY IF a specific node ID is provided in the question or context, use this exact pattern replacing 'the_id' with the actual ID:
       - `MATCH (start {{id: 'the_id'}})`
       - `MATCH (start)-[*0..3]-(so:SalesOrder)`
       - `OPTIONAL MATCH (c:Customer)-[:PLACED]->(so)`
       - `OPTIONAL MATCH (so)-[:CONTAINS]->(p:Product)`
       - `OPTIONAL MATCH (d:Delivery)-[:FULFILLS]->(so)`
       - `OPTIONAL MATCH (b:BillingDocument)-[:BILLED_FOR]->(d)`
       - `OPTIONAL MATCH (b)-[:POSTED_TO]->(j:JournalEntry)`
    3. ANALYTICS & GDS:
       - If asking for "Bottlenecks", query nodes and `ORDER BY n.degree_centrality DESC`.
       - If asking for "Influence", query nodes and `ORDER BY n.pagerank_score DESC`.
    4. STRICT CYPHER GRAMMAR (Avoid Hallucinations):
       - NEVER use `WITH` after a `RETURN` clause. `RETURN` must be the final operation.
       - NEVER try to COUNT or aggregate a variable before you have `MATCH`ed it.
       - If using `UNION ALL`, EVERY query block must return the EXACT SAME column names and types.
       - To find "dead ends", use: `MATCH (n) WHERE NOT (n)-->() AND ()-->(n) RETURN n`
       - To find "disconnected" nodes, use: `MATCH (n) WHERE NOT (n)--() RETURN n`
       - To find "split deliveries" (1 delivery -> multiple billing), use: `MATCH (d:Delivery)<-[:BILLED_FOR]-(b:BillingDocument) WITH d, COUNT(b) as bCount WHERE bCount > 1 RETURN d`
    5. SAFETY VALVE: ALWAYS append `LIMIT 50` to the end of your query to prevent massive data dumps.
    6. Return ONLY valid Cypher code. Do not include markdown formatting like ```cypher.
    
    Question: {state["original_question"]}
    Previous Error (if any): {state.get("error_message", "None")}
    """
    
    response = llm.invoke(prompt).content.replace("```cypher", "").replace("```", "").strip()
    
    current_retries = state.get("retry_count")
    if current_retries is None:
        current_retries = 0
        
    return {"generated_cypher": response, "retry_count": current_retries + 1}

def execute_and_review_node(state: GraphQAState):
    """Phase 3.5: Execution Sandbox with Self-Healing"""
    cypher = state["generated_cypher"]
    
    if any(keyword in cypher.upper() for keyword in ["DELETE", "DROP", "SET", "MERGE", "CREATE"]):
        return {"error_message": "Query attempted write operations. Read-only allowed.", "db_results": []}

    try:
        with driver.session(default_access_mode="READ") as session:
            result = session.run(cypher)
            data = [record.data() for record in result]
            return {"db_results": data, "error_message": ""}
    except Exception as e:
        return {"error_message": str(e), "db_results": []}

def summarize_node(state: GraphQAState):
    """Phase 3.5: Summarizer Agent"""
    db_data = state.get("db_results", [])
    error_msg = state.get("error_message", "")
    
    db_data_str = str(db_data)
    max_chars = 12000 
    
    if len(db_data_str) > max_chars:
        db_data_str = db_data_str[:max_chars] + "\n... [SYSTEM WARNING: DATA TRUNCATED DUE TO MASSIVE SIZE. Tell the user there were too many results to show them all, and summarize the snippet you can see.]"
    
    if error_msg and not db_data:
        prompt = f"""The database query failed 3 times. Last error: {error_msg}. 
        Politely explain to the user that there was a database error and you couldn't retrieve the info.
        Question: {state["original_question"]}"""
    else:
        prompt = f"""Answer the user's question naturally using the following data retrieved from the database.
        Question: {state["original_question"]}
        Data: {db_data_str}"""
    
    response = llm.invoke(prompt).content
    return {"final_answer": response}

def build_graph():
    """State Machine Compilation"""
    workflow = StateGraph(GraphQAState)
    
    workflow.add_node("guardrail", guardrail_node)
    workflow.add_node("generate_cypher", generate_cypher_node)
    workflow.add_node("execute_review", execute_and_review_node)
    workflow.add_node("summarize", summarize_node)
    
    workflow.set_entry_point("guardrail")
    
    workflow.add_conditional_edges(
        "guardrail",
        lambda state: "generate_cypher" if state["is_in_domain"] else END
    )
    
    workflow.add_edge("generate_cypher", "execute_review")
    
    def route_after_execution(state: GraphQAState):
        if state["error_message"]:
            if state["retry_count"] >= 3:
                return "summarize"
            return "generate_cypher" 
        return "summarize" 
        
    workflow.add_conditional_edges("execute_review", route_after_execution)
    workflow.add_edge("summarize", END)
    
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

app_graph = build_graph()