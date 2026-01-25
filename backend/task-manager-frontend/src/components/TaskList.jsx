import React from 'react';
import TaskCard from './TaskCard';

const TaskList = ({ tasks, toggleComplete, onEdit, onDelete }) => {
  return tasks.length === 0 ? (
    <p>Nenhuma tarefa encontrada.</p>
  ) : (
    tasks.map((task, index) => (
      <TaskCard
        key={task.id}
        task={task}
        toggleComplete={toggleComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        className="stagger-item"
        style={{ '--stagger-delay': `${index * 60}ms` }}
      />
    ))
  );
};

export default TaskList;
