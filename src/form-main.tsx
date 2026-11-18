// Entrada enxuta da página pública de formulário (growthexpert.com.br/f/...).
// Compilada à parte (vite.form.config.ts) com Preact no lugar do React e um
// CSS só com as classes do formulário — abre bem mais rápido no celular.
import { createRoot } from 'react-dom/client';
import './form.css';
import { PublicForm } from './pages/PublicForm';

createRoot(document.getElementById('root')!).render(<PublicForm />);
