"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
from pathlib import Path
from uuid import uuid4

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}

# In-memory user store for role-based access.
users = {
    "student1": {
        "password": "student123",
        "role": "student",
        "email": "student1@mergington.edu"
    },
    "clubadmin1": {
        "password": "clubadmin123",
        "role": "club_admin",
        "email": "clubadmin1@mergington.edu"
    },
    "federation1": {
        "password": "federation123",
        "role": "federation_admin",
        "email": "federation1@mergington.edu"
    }
}

# In-memory session token registry.
active_sessions = {}


class LoginRequest(BaseModel):
    username: str
    password: str


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")
    return token


def get_current_user(authorization: str | None = Header(default=None)):
    token = extract_bearer_token(authorization)
    username = active_sessions.get(token)
    if not username or username not in users:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = users[username]
    return {
        "username": username,
        "role": user["role"],
        "email": user["email"]
    }


@app.post("/auth/login")
def login(payload: LoginRequest):
    user = users.get(payload.username)
    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = str(uuid4())
    active_sessions[token] = payload.username

    return {
        "access_token": token,
        "token_type": "bearer",
        "username": payload.username,
        "role": user["role"],
        "email": user["email"]
    }


@app.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    token = extract_bearer_token(authorization)
    if token not in active_sessions:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    del active_sessions[token]
    return {"message": "Logged out successfully"}


@app.get("/auth/me")
def me(current_user=Depends(get_current_user)):
    return current_user


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str, current_user=Depends(get_current_user)):
    """Sign up a student for an activity"""
    if current_user["role"] not in ["student", "club_admin", "federation_admin"]:
        raise HTTPException(status_code=403, detail="You do not have permission to sign up students")

    # Students can only sign themselves up.
    if current_user["role"] == "student" and email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Students can only sign up themselves")

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: str, current_user=Depends(get_current_user)):
    """Unregister a student from an activity"""
    if current_user["role"] not in ["club_admin", "federation_admin"]:
        raise HTTPException(status_code=403, detail="You do not have permission to unregister students")

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
