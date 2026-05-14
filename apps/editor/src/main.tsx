/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ICON_EXTRA_SMALL, ICON_MEDIUM, ICON_SMALL, ICON_STROKE_USER } from './design-system/icons';

document.documentElement.style.setProperty('--icon-medium', `${ICON_MEDIUM}px`);
document.documentElement.style.setProperty('--icon-small', `${ICON_SMALL}px`);
document.documentElement.style.setProperty('--dot-md', `${ICON_EXTRA_SMALL}px`);
document.documentElement.style.setProperty('--clutter-icon-stroke-user', String(ICON_STROKE_USER));
import './design-system/tokens.css';
import './design-system/theme.css';
import './styles/base.css';
import './styles/app-layout.css';
import './styles/sidebar.css';
import './styles/button.css';
import './styles/topbar.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
