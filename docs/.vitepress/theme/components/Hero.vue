<template>
  <section class="ol-hero">
    <div class="ol-hero-inner">
      <div class="ol-logo-mark" aria-hidden="true">⬢</div>
      <h1 class="ol-title">Outai Lab</h1>
      <p class="ol-tagline">Build · Learn · Collect</p>
      <p class="ol-desc">一个不断成长的个人知识库。<br />Curated resources. Personal knowledge. Built for lifelong learning.</p>

      <div class="ol-actions">
        <a class="ol-btn ol-btn-primary" href="/featured/">开始浏览</a>
        <a
          class="ol-btn ol-btn-ghost"
          href="https://github.com/outaidage/outaidage.github.io"
          target="_blank"
          rel="noopener"
        >
          GitHub
        </a>
      </div>

      <!-- Search hint (local search is available via VitePress) -->
      <p class="ol-search-hint">
        <kbd>⌘</kbd><kbd>K</kbd> 或点击右上角搜索
      </p>
    </div>
  </section>
</template>

<style scoped>
.ol-hero {
  position: relative;
  padding: 72px 24px 56px;
  text-align: center;
  overflow: hidden;
}

.ol-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37, 99, 235, 0.12), transparent),
    radial-gradient(ellipse 60% 40% at 80% 60%, rgba(96, 165, 250, 0.06), transparent);
  pointer-events: none;
}

.dark .ol-hero::before {
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(96, 165, 250, 0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 60%, rgba(37, 99, 235, 0.08), transparent);
}

.ol-hero-inner {
  position: relative;
  max-width: 640px;
  margin: 0 auto;
}

.ol-logo-mark {
  font-size: 2.75rem;
  line-height: 1;
  color: var(--ol-primary);
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.ol-title {
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 750;
  letter-spacing: -0.03em;
  color: var(--ol-text);
  margin: 0 0 8px;
  line-height: 1.15;
}

.ol-tagline {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--ol-primary);
  margin: 0 0 16px;
  letter-spacing: 0.02em;
}

.ol-desc {
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--ol-text-secondary);
  margin: 0 0 32px;
}

.ol-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-bottom: 28px;
}

.ol-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 22px;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 560;
  text-decoration: none;
  transition: all 0.18s ease;
  border: 1px solid transparent;
}

.ol-btn-primary {
  background: var(--ol-primary);
  color: #fff;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.25);
}

.ol-btn-primary:hover {
  background: var(--ol-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.dark .ol-btn-primary {
  color: #09090b;
}

.ol-btn-ghost {
  background: transparent;
  color: var(--ol-text);
  border-color: var(--ol-border);
}

.ol-btn-ghost:hover {
  background: var(--ol-card);
  border-color: var(--ol-primary);
  color: var(--ol-primary);
}

.ol-search-hint {
  font-size: 0.8rem;
  color: var(--ol-text-secondary);
  margin: 0;
  opacity: 0.85;
}

.ol-search-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 1px;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--ol-card);
  border: 1px solid var(--ol-border);
  border-radius: 4px;
  box-shadow: 0 1px 0 var(--ol-border);
}

@media (max-width: 640px) {
  .ol-hero {
    padding: 56px 20px 40px;
  }
  .ol-desc br {
    display: none;
  }
}
</style>
