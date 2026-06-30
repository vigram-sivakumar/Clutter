import { Button } from '../Button';
import { Section } from '../Section';
import { View } from './Sidebar.View';
import { DateLabel } from '../DateLabel';

export function DailyNotesPanel() {
  return (
    <View
      navigation={
        <Section>
          <Button
            leading={<DateLabel isToday />}
            variant="outline-fill"
            className="button--muted"
          >
            Start your day...
          </Button>
        </Section>
      }
    ></View>
  );
}
