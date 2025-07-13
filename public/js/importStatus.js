function checkImportStatus(taskId) {
  fetch(`/api/character/import/status/${taskId}`)
    .then(res => res.json())
    .then(data => {
      const box = document.getElementById('statusBox');
      if (data.status === 'in_progress') {
        box.innerText = "Still importing...";
        setTimeout(() => checkImportStatus(taskId), 3000);
        } else if (data.status === 'done') {
          box.innerText = data.message || 'Import completed.';
          doneActions.style.display = 'block';
        } else {
          box.innerText = data.message || 'An error occurred.';
          doneActions.style.display = 'block';
        }
    })
    .catch(err => {
      document.getElementById('statusBox').innerText = 'Status check failed.';
    });
}
