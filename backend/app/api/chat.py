import time
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.agents.workflow import app_graph

router = APIRouter()

class ChatRequest(BaseModel):
    query: str
    context: str | None = None 
    session_id: str = "default_session" 

class ChatResponse(BaseModel):
    role: str
    text: str
    cypher: str | None = None
    latency: str
    highlighted_nodes: list[str] = [] 

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    start_time = time.time()
    
    try:
        if request.context:
            full_question = f"System Context: {request.context}\nUser Question: {request.query}"
        else:
            full_question = request.query

        initial_state = {"original_question": full_question, "messages": []}
        config = {"configurable": {"thread_id": request.session_id}}
        
        result = app_graph.invoke(initial_state, config=config)
        latency_ms = round((time.time() - start_time) * 1000)
        final_text = result.get("final_answer", "Sorry, I couldn't generate an answer.")
        
        
        potential_ids = re.findall(r'\b[A-Z0-9]{6,15}\b', final_text.upper())
        
        highlighted_nodes = list(set([pid for pid in potential_ids if any(c.isdigit() for c in pid)]))
        
        if not result.get("is_in_domain", True):
            return ChatResponse(
                role="agent", text="This system is designed to answer questions related to the provided dataset only.",
                cypher=None, latency=f"{latency_ms}ms"
            )
            
        return ChatResponse(
            role="agent",
            text=final_text,
            cypher=result.get("generated_cypher", ""),
            latency=f"{latency_ms}ms",
            highlighted_nodes=highlighted_nodes 
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))