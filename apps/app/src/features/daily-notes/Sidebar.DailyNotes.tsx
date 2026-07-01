import { Button } from '@components/button/Button';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { View } from '@components/sidebar/View/Sidebar.View';
import { DateLabel } from '@components/date-label/DateLabel';

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
