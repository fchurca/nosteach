import './styles/main.css';
import './lib/toast.js';
import App from './App.js';

const appElement = document.querySelector('#app');
if (appElement) {
  appElement.innerHTML = `
    <div class="container">
      <h1>⚡ <span>NosTeach</span></h1>
      <div class="skeleton skeleton-text-lg" style="width: 60%"></div>
      <div class="skeleton skeleton-text" style="width: 40%"></div>
    </div>
  `;
}

const app = new App();
export default app;
