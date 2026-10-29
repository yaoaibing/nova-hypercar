import './styles.css';
import { App } from './app';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const boot = document.getElementById('boot');

function start() {
  try {
    const app = new App(canvas);
    // @ts-expect-error 便于调试
    window.__app = app;
    requestAnimationFrame(() => {
      boot?.classList.add('done');
      setTimeout(() => boot?.remove(), 700);
    });
  } catch (err) {
    console.error(err);
    if (boot) {
      boot.innerHTML =
        '<div class="boot-inner"><div class="boot-logo">ERROR</div><div class="boot-tip">' +
        String((err as Error)?.message ?? err) +
        '</div></div>';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
