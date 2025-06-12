import { render, screen } from '@testing-library/react'; 
import { BrowserRouter } from 'react-router-dom';
import ShipList from './components/ShipList';

jest.mock('./services/api', () => ({
  fetchShips: () => Promise.resolve({ ships: [], pages: 0 }),
}));

test('renders ship list title', async () => {
  render(
    <BrowserRouter>
      <ShipList />
    </BrowserRouter>
  );

  const titleElement = await screen.findByText(/Список судов/i);

  expect(titleElement).toBeInTheDocument();
});