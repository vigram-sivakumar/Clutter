export function isToday(date: string): boolean {
  const today = new Date();
  const noteDate = new Date(date);

  return (
    today.getFullYear() === noteDate.getFullYear() &&
    today.getMonth() === noteDate.getMonth() &&
    today.getDate() === noteDate.getDate()
  );
}
