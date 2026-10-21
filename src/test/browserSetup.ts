import { beforeEach } from 'vitest';
import '../styles.css';

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  document.title = '';
});

/** Appends `el` inside a fresh #app container. */
export function mount<T extends Element>(el: T): T {
  let app = document.querySelector('#app');
  if (!app) {
    app = document.createElement('div');
    app.id = 'app';
    document.body.append(app);
  }
  app.replaceChildren(el);
  return el;
}
