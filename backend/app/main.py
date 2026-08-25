# main.py
from fastapi import FastAPI

# Création de l'instance de l'apk
app = FastAPI()

# Routes
@app.get("/")
def read_root():
    return {"message": "Hello World"}

if __name__ == "_main_":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
