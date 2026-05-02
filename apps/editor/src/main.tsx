/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ICON_MEDIUM } from './design-system/icons';

document.documentElement.style.setProperty('--icon-medium', `${ICON_MEDIUM}px`);
import './design-system/tokens.css';
import './design-system/theme.css';
import './styles/base.css';
import './styles/app-layout.css';
import './styles/button.css';
import './styles/shortcut-key.css';
import './styles/divider.css';
import './styles/avatar.css';
import './styles/tag.css';
import './styles/dropdown-item.css';
import './styles/topbar.css';
import './styles/editor.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
