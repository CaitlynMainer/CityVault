function getImportStatus(req, res) {
  const task = global.characterImportTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({
      status: 'unknown',
      message: 'Invalid task ID'
    });
  }

  res.json({
    status: task.status,
    message: task.message,
    error: task.error,
    total: task.total ?? null,
    completed: task.completed ?? null
  });
}

module.exports = {
  getImportStatus
};
