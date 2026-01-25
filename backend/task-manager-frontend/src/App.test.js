import { render, screen } from '@testing-library/react';

jest.mock('./services/api', () => ({
  __esModule: true,
  default: {
    get: () => Promise.resolve({ data: [] }),
    post: () => Promise.resolve({}),
    put: () => Promise.resolve({}),
    delete: () => Promise.resolve({})
  }
}));

const App = require('./App').default;

test('renders dashboard title', async () => {
  const payload = btoa(JSON.stringify({ role: 'admin', name: 'Admin' }));
  localStorage.setItem('token', `test.${payload}.sig`);
  render(<App />);
  const titleElement = await screen.findByText(/Dashboard de Tarefas/i);
  expect(titleElement).toBeInTheDocument();
});
