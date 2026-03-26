
from dotenv import load_dotenv
load_dotenv()  

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, graph

app = FastAPI(title="SAP O2C Graph Query API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(graph.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "Backend is running! The Graph is awake."}