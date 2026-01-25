import React from 'react';
import { useParams } from 'react-router-dom';
import TaskForm from '../components/TaskForm';

const EditTask = () => {
  const { id } = useParams();
  return <TaskForm taskId={id} />;
};

export default EditTask;
