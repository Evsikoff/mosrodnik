import './dbg';
import { createRoot } from 'react-dom/client';
import App from './App';
import { currentTheme } from './theme';
import './styles.css';

// Тема выставляется до первого кадра, чтобы не было мигания
document.documentElement.dataset.theme = currentTheme();

createRoot(document.getElementById('root')!).render(<App />);
