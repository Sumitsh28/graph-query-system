from typing import TypedDict, Annotated, List, Dict, Any
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class GraphQAState(TypedDict):
   
    messages: Annotated[List[BaseMessage], add_messages]
    original_question: str
    is_in_domain: bool
    generated_cypher: str
    db_results: List[Dict[str, Any]]
    error_message: str
    retry_count: int
    final_answer: str
