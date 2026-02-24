from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.models.task import Task
from app.models.user import User
from app.models.assignment import Assignment
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut
from app.database.deps import get_db
from app.core.auth import get_current_user, require_permission
from app.core.permissions import has_permission

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)
get_tasks_manager = require_permission("tasks.manage")

def build_task_out(task: Task, assignee: Optional[User]):
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        completed=task.completed,
        due_date=task.due_date,
        priority=task.priority or "media",
        labels=normalize_labels(task.labels),
        assignee_id=assignee.id if assignee else None,
        assignee_name=assignee.name if assignee else None,
        assignee_email=assignee.email if assignee else None
    )

def normalize_labels(value):
    if not value:
        return []
    if isinstance(value, list):
        labels = value
    else:
        labels = str(value).split(",")
    return [label.strip() for label in labels if label and label.strip()]

def serialize_labels(value):
    labels = normalize_labels(value)
    return ",".join(labels) if labels else None

@router.post("/", response_model=TaskOut)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_tasks_manager)
):
    assignee = None
    if task.assignee_id:
        assignee = db.query(User).filter(User.id == task.assignee_id).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
    db_task = Task(
        title=task.title,
        description=task.description,
        due_date=task.due_date,
        priority=task.priority or "media",
        labels=serialize_labels(task.labels)
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    if assignee:
        assignment = Assignment(task_id=db_task.id, user_id=assignee.id)
        db.add(assignment)
        db.commit()
    return build_task_out(db_task, assignee)

@router.get("/", response_model=list[TaskOut])
def read_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    can_manage_tasks = has_permission(current_user, "tasks.manage")
    if can_manage_tasks:
        rows = (
            db.query(Task, User)
            .outerjoin(Assignment, Assignment.task_id == Task.id)
            .outerjoin(User, User.id == Assignment.user_id)
            .order_by(Task.due_date.asc().nulls_last(), Task.id.desc())
            .all()
        )
    else:
        rows = (
            db.query(Task, User)
            .join(Assignment, Assignment.task_id == Task.id)
            .join(User, User.id == Assignment.user_id)
            .filter(User.id == current_user.id)
            .order_by(Task.due_date.asc().nulls_last(), Task.id.desc())
            .all()
        )
    return [build_task_out(task, assignee) for task, assignee in rows]

@router.get("/{task_id}", response_model=TaskOut)
def read_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    can_manage_tasks = has_permission(current_user, "tasks.manage")
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    assignment = db.query(Assignment).filter(Assignment.task_id == task_id).first()
    assignee = None
    if assignment:
        assignee = db.query(User).filter(User.id == assignment.user_id).first()
    if not can_manage_tasks:
        if not assignee or assignee.id != current_user.id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    return build_task_out(db_task, assignee)

@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    task: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    can_manage_tasks = has_permission(current_user, "tasks.manage")
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if hasattr(task, "model_dump"):
        data = task.model_dump(exclude_unset=True)
    else:
        data = task.dict(exclude_unset=True)

    assignee_in_payload = "assignee_id" in data
    assignee_id = data.pop("assignee_id", None) if assignee_in_payload else None
    labels_present = "labels" in data
    priority_present = "priority" in data

    assignment = db.query(Assignment).filter(Assignment.task_id == task_id).first()
    if not can_manage_tasks:
        if not assignment or assignment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Acesso negado")
        allowed = {"completed"}
        if labels_present or priority_present or not data or any(key not in allowed for key in data.keys()):
            raise HTTPException(status_code=403, detail="Acesso negado")
        if "completed" in data:
            db_task.completed = data["completed"]
    else:
        labels_value = data.pop("labels", None) if labels_present else None
        if "priority" in data and data["priority"] is None:
            data["priority"] = "media"
        for key, value in data.items():
            if key in {"title", "description", "completed", "due_date", "priority"}:
                setattr(db_task, key, value)
        if labels_present:
            db_task.labels = serialize_labels(labels_value)
        if assignee_in_payload:
            if assignee_id is None:
                if assignment:
                    db.delete(assignment)
            else:
                assignee = db.query(User).filter(User.id == assignee_id).first()
                if not assignee:
                    raise HTTPException(status_code=404, detail="Usuário não encontrado")
                if assignment:
                    assignment.user_id = assignee.id
                else:
                    db.add(Assignment(task_id=task_id, user_id=assignee.id))

    db.commit()
    db.refresh(db_task)
    assignee = None
    assignment = db.query(Assignment).filter(Assignment.task_id == task_id).first()
    if assignment:
        assignee = db.query(User).filter(User.id == assignment.user_id).first()
    return build_task_out(db_task, assignee)

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_tasks_manager)
):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    db.query(Assignment).filter(Assignment.task_id == task_id).delete()
    db.delete(db_task)
    db.commit()
    return {"detail": "Tarefa excluída"}
