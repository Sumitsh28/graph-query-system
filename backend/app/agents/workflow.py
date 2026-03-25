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
    
    prompt = f"""You are a strict data security guard. Does this question relate to supply chain, orders, deliveries, invoices, or business analytics? 
    Question: {question}
    Reply ONLY with 'YES' or 'NO'."""
    
    response = llm.invoke(prompt).content.strip().upper()
    return {"is_in_domain": response == 'YES'}

def generate_cypher_node(state: GraphQAState):
    
    schema = "Nodes: Customer, Product, SalesOrder, Delivery, BillingDocument..."
    
    prompt = f"""Generate a read-only Cypher query for Neo4j based on the schema: {schema}.
    Question: {state["original_question"]}
    Previous Error (if any): {state.get("error_message", "None")}
    Return ONLY valid Cypher code."""
    
    response = llm.invoke(prompt).content.replace("```cypher", "").replace("```", "").strip()
    return {"generated_cypher": response, "retry_count": state.get("retry_count", 0) + 1}

def execute_and_review_node(state: GraphQAState):
    
    cypher = state["generated_cypher"]
    
    if any(keyword in cypher.upper() for keyword in ["DELETE", "DROP", "SET", "MERGE", "CREATE"]):
        return {"error_message": "Query attempted write operations. Read-only allowed."}

    try:
        with driver.session(default_access_mode="READ") as session:
            result = session.run(cypher)
            data = [record.data() for record in result]
            return {"db_results": data, "error_message": ""}
    except Exception as e:
        return {"error_message": str(e)}

def summarize_node(state: GraphQAState):
    prompt = f"""Answer the user's question naturally using the following data retrieved from the database.
    Question: {state["original_question"]}
    Data: {state["db_results"]}"""
    
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