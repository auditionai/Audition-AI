export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean>
  | ClassValue[];

const appendClass = (buffer: string[], value: ClassValue): void => {
  if (!value) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    buffer.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => appendClass(buffer, entry));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([className, enabled]) => {
      if (enabled) {
        buffer.push(className);
      }
    });
  }
};

export function cn(...inputs: ClassValue[]) {
  const buffer: string[] = [];
  inputs.forEach((input) => appendClass(buffer, input));
  return buffer.join(' ');
}
