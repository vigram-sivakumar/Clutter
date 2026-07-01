import { Button } from '../../components/Button';
import { Section } from '../../components/sidebar/Sidebar.Section';
import { View } from '../../components/sidebar/Sidebar.View';
import { DateLabel } from '../../components/DateLabel';

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
