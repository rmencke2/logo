# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Logo Generator")

class LogoRequest(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/generate")
def generate_logo(req: LogoRequest):
    if not req.text:
        raise HTTPException(status_code=400, detail="text is required")

    # TODO: hook into your existing Python logic that makes logos
    # For now just echo back
    return {"echo": req.text}