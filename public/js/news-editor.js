const quill = new Quill('#editor', {
  theme: 'snow'
});

function syncContent() {
  document.getElementById('news-content').value = quill.root.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('news-list');
  new Sortable(list, {
    animation: 150,
    onEnd: () => {
      const order = Array.from(list.children).map(li => li.dataset.id);
      fetch('/admin/news/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
    }
  });
});
