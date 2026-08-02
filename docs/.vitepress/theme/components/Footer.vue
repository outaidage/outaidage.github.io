<template>
  <footer class="ol-footer">
    <div class="ol-footer-inner">
      <p class="ol-footer-brand">⬢ Outai Lab</p>
      <p class="ol-footer-text">Build · Learn · Collect — 持续成长的个人知识库</p>
      <div class="ol-footer-links">
        <a href="https://github.com/outaidage/outaidage.github.io" target="_blank" rel="noopener">GitHub</a>
        <span class="sep">·</span>
        <a href="/about">About</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.ol-footer {
  border-top: 1px solid var(--ol-border);
  padding: 40px 24px 48px;
  text-align: center;
  background: var(--ol-bg);
}

.ol-footer-inner {
  max-width: 560px;
  margin: 0 auto;
}

.ol-footer-brand {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ol-text);
  margin: 0 0 6px;
}

.ol-footer-text {
  font-size: 0.875rem;
  color: var(--ol-text-secondary);
  margin: 0 0 14px;
}

.ol-footer-links {
  font-size: 0.875rem;
}

.ol-footer-links a {
  color: var(--ol-text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.ol-footer-links a:hover {
  color: var(--ol-primary);
}

.sep {
  margin: 0 8px;
  color: var(--ol-border);
}
</style>
