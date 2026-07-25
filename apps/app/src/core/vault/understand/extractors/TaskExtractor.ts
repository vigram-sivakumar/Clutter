export interface ScannedTask {
  readonly text: string;
  readonly completed: boolean;
}

export class TaskExtractor {
  extract(content: string): readonly ScannedTask[] {
    const tasks: ScannedTask[] = [];

    for (const line of content.split('\n')) {
      const task = this.extractFromLine(line);

      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  private extractFromLine(line: string): ScannedTask | null {
    const match = line.match(/^\s*- \[( |x|X)\]\s+(.+)$/);

    if (!match) {
      return null;
    }

    const text = match[2];

    if (!text) {
      return null;
    }

    const completed = match[1];

    if (!completed) {
      return null;
    }

    return {
      completed: completed.toLowerCase() === 'x',
      text,
    };
  }
}
