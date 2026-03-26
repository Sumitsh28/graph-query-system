import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.agents.workflow import app_graph

router = APIRouter()

class ChatRequest(BaseModel):
    query: str
    session_id: str = "default_session" 

class ChatResponse(BaseModel):
    role: str
    text: str
    cypher: str | None = None
    latency: str

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    start_time = time.time()
    
    try:
        initial_state = {
            "original_question": request.query,
            "messages": []
        }
        
        config = {"configurable": {"thread_id": request.session_id}}
        
        result = app_graph.invoke(initial_state, config=config)
        
        latency_ms = round((time.time() - start_time) * 1000)
        
        if not result.get("is_in_domain", True):
            return ChatResponse(
                role="agent",
                text="This system is designed to answer questions related to the provided supply chain dataset only.",
                cypher=None,
                latency=f"{latency_ms}ms"
            )
            
        return ChatResponse(
            role="agent",
            text=result.get("final_answer", "Sorry, I couldn't generate an answer."),
            cypher=result.get("generated_cypher", ""),
            latency=f"{latency_ms}ms"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))