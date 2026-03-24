import './styles/main.css';
import App from './App.js';

const appElement = document.querySelector('#app');
if (appElement) {
  appElement.innerHTML = '<div class="container"><h1>⚡ <span>NosTeach</span></h1><p class="subtitle">Cargando...</p></div>';
}

const app = new App();
export default app;
