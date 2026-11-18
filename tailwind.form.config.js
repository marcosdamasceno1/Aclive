import base from './tailwind.config.js';

/** CSS da página pública de formulário: só as classes que ela usa. */
export default {
  ...base,
  content: ['./form.html', './src/pages/PublicForm.tsx', './src/components/forms/**/*.{ts,tsx}'],
};
