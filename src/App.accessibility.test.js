import { render, screen } from '@testing-library/react';
import App from './App';

test('App renders at least one heading element', () => {
  render(<App />);
  const heading = screen.getByRole('heading');
  expect(heading).toBeInTheDocument();
});
