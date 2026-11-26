{
  const top = document.querySelector('.top');
  const onScroll = () => { if (top) top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
}
