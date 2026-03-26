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
    
    question = state["original_question"]
    
    prompt = f"""You are a strict data security guard. Does this question relate to supply chain, orders, deliveries, invoices, business analytics, OR exploring a graph database of these entities (e.g., asking about 'this node', 'IDs', or 'relationships')? 
    
    Question: {question}
    
    Reply ONLY with 'YES' or 'NO'. If the user mentions 'this node' or an ID, the answer is always 'YES'."""
    
    response = llm.invoke(prompt).content.strip().upper()
    return {"is_in_domain": response == 'YES'}

def generate_cypher_node(state: GraphQAState):
    
    schema = """
    Nodes: Customer, Product, SalesOrder, Delivery, BillingDocument, JournalEntry. 
    Exact Relationships: 
    (Customer)-[:PLACED]->(SalesOrder)
    (SalesOrder)-[:CONTAINS]->(Product)
    (Delivery)-[:FULFILLS]->(SalesOrder)
    (BillingDocument)-[:BILLED_FOR]->(Delivery) OR (BillingDocument)-[:BILLED_FOR]->(SalesOrder)
    (BillingDocument)-[:POSTED_TO]->(JournalEntry)
    All nodes have a string property called 'id'.
    """
    
    prompt = f"""Generate a read-only Cypher query for Neo4j based on the exact schema: {schema}.
    
    CRITICAL RULES:
    1. NEVER use the internal `id(n)` function. ALWAYS query node IDs using the string property `id`.
    2. If tracing a flow from a specific ID, DO NOT assume the starting node's type.
    3. PATTERN: To trace an entire Order-to-Cash flow from ANY starting node, use this exact pattern:
       - `MATCH (start {{id: 'the_id'}})`
       - `MATCH (start)-[*0..3]-(so:SalesOrder)`
       - `OPTIONAL MATCH (c:Customer)-[:PLACED]->(so)`
       - `OPTIONAL MATCH (so)-[:CONTAINS]->(p:Product)`
       - `OPTIONAL MATCH (d:Delivery)-[:FULFILLS]->(so)`
       - `OPTIONAL MATCH (b:BillingDocument)-[:BILLED_FOR]->(d)`
       - `OPTIONAL MATCH (b)-[:POSTED_TO]->(j:JournalEntry)`
    4. SAFETY VALVE: ALWAYS append `LIMIT 50` to the end of your query to prevent massive data dumps that crash the system.
    5. Return ONLY valid Cypher code. Do not include markdown formatting.
    
    Question: {state["original_question"]}
    Previous Error (if any): {state.get("error_message", "None")}
    """
    
    response = llm.invoke(prompt).content.replace("```cypher", "").replace("```", "").strip()
    
    current_retries = state.get("retry_count")
    if current_retries is None:
        current_retries = 0
        
    return {"generated_cypher": response, "retry_count": current_retries + 1}

def execute_and_review_node(state: GraphQAState):
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