from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import ratings

app = FastAPI(
    title="NITBox ML Service",
    description="Machine learning microservice for football analytics",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ratings.router)


@app.get("/health")
def health():
    return {"status": "ok"}
