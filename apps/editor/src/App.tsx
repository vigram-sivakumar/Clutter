import { useState } from 'react';
import { AppLayout } from './components/layouts/AppLayout';
import { useTheme } from './design-system/useTheme';
import { PageLayout } from './components/layouts/PageLayout';
import { Tab, Tabs } from './components/tabs';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync
  const [activeTab, setActiveTab] = useState('notes');
  return (
    <AppLayout
      page={
        <PageLayout>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <Tab value="notes">Notes</Tab>
            <Tab value="tasks">Tasks</Tab>
            <Tab value="tags">Tags</Tab>
          </Tabs>
        </PageLayout>
      }
    />
  );
}
