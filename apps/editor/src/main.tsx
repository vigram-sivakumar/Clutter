/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DOT_MD, ICON_MEDIUM, ICON_SMALL } from './design-system/icons';

document.documentElement.style.setProperty('--icon-medium', `${ICON_MEDIUM}px`);
document.documentElement.style.setProperty('--icon-small', `${ICON_SMALL}px`);
document.documentElement.style.setProperty('--dot-md', `${DOT_MD}px`);
import './design-system/tokens.css';
import './design-system/theme.css';
import './styles/base.css';
import './styles/app-layout.css';
import './styles/button.css';
import './styles/shortcut-key.css';
import './styles/divider.css';
import './styles/avatar.css';
import './styles/tag.css';
import './styles/pill.css';
import './styles/date-pill.css';
import './styles/count.css';
import './styles/section-subheader.css';
import './styles/sidepanel-navigation.css';
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
