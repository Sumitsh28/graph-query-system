from langchain_community.cache import RedisSemanticCache
from langchain_openai import OpenAIEmbeddings
from langchain.globals import set_llm_cache
import os

def init_semantic_cache():
    
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    embeddings = OpenAIEmbeddings(model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))
    
    set_llm_cache(RedisSemanticCache(
        embedding=embeddings,
        redis_url=redis_url,
        score_threshold=0.95 
    ))