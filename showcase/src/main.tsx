import { createRoot } from 'react-dom/client';
import './styles.css';
import './web/fonts.css';
import { Player } from './web/Player';

createRoot(document.getElementById('root')!).render(<Player />);
